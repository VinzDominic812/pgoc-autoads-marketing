import json
import logging
import re
import time
import pytz
import redis
import requests
from celery import shared_task
from datetime import datetime, timedelta
from workers.on_off_functions.ad_spent_message import append_redis_message_adspent

# Redis client
redis_client_asr = redis.Redis(
    host="redisAds",
    port=6379,
    db=9,
    decode_responses=True
)

# Constants
FACEBOOK_API_VERSION = "v22.0"
FACEBOOK_GRAPH_URL = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}"
NON_ALPHANUMERIC_REGEX = re.compile(r'[^a-zA-Z0-9]+')
manila_tz = pytz.timezone("Asia/Manila")

def normalize_text(text):
    return NON_ALPHANUMERIC_REGEX.sub(' ', text).lower().split()

def fetch_facebook_data(url, access_token):
    try:
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=5)
        response.raise_for_status()
        data = response.json()
        logging.debug(f"Facebook API Response: {data}")
        if "error" in data:
            logging.error(f"Facebook API Error: {data['error']}")
            return {"error": data["error"]}
        return data
    except requests.exceptions.RequestException as e:
        logging.error(f"RequestException: {e}")
        return {"error": {"message": str(e), "type": "RequestException"}}

def get_facebook_user_info(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me?fields=id,name"
    data = fetch_facebook_data(url, access_token)
    if data and "id" in data and "name" in data:
        return {"id": data["id"], "name": data["name"]}
    return None

def get_ad_accounts(fb_user_id, access_token, limit=100, max_pages=None):
    """
    Fetch ad accounts with pagination support.
    
    Args:
        fb_user_id: Facebook user ID
        access_token: Access token for authentication
        limit: Number of ad accounts to retrieve per page (default: 100)
        max_pages: Maximum number of pages to retrieve (None for all pages)
    
    Returns:
        List of ad account dictionaries with id and name
    """
    all_ad_accounts = []
    page_count = 0
    next_url = f"{FACEBOOK_GRAPH_URL}/{fb_user_id}/adaccounts?fields=id,name&limit={limit}"
    
    while next_url and (max_pages is None or page_count < max_pages):
        data = fetch_facebook_data(next_url, access_token)
        
        if "error" in data:
            logging.error(f"Error fetching ad accounts: {data['error']}")
            return all_ad_accounts
        
        if "data" in data:
            accounts = [
                {
                    "id": acc["id"].replace("act_", ""),
                    "name": acc.get("name", "Unknown")
                }
                for acc in data.get("data", [])
            ]
            all_ad_accounts.extend(accounts)
            logging.info(f"Retrieved {len(accounts)} ad accounts (page {page_count + 1})")
            
            # Log progress to Redis for the user
            append_redis_message_adspent(fb_user_id, f"Retrieved {len(all_ad_accounts)} ad accounts so far...")
        
        # Check for pagination
        if "paging" in data and "next" in data["paging"]:
            next_url = data["paging"]["next"]
            page_count += 1
        else:
            next_url = None
    
    logging.info(f"Total ad accounts retrieved: {len(all_ad_accounts)}")
    return all_ad_accounts

def fetch_campaign_data_for_account(ad_account_id, access_token):
    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
        f"?fields=name,status,daily_budget,budget_remaining"
    )
    return fetch_facebook_data(url, access_token)

def fetch_campaign_insights(ad_account_id, access_token, since_date=None, until_date=None):
    """Fetch today's campaign spend using Manila timezone."""
    if not since_date or not until_date:
        now_manila = datetime.now(manila_tz)
        today_str = now_manila.strftime('%Y-%m-%d')
        since_date = since_date or today_str
        until_date = until_date or today_str

    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/insights"
        f"?level=campaign&fields=campaign_id,campaign_name,spend"
        f"&time_range[since]={since_date}&time_range[until]={until_date}"
    )

    insights_data = fetch_facebook_data(url, access_token)
    campaign_insights = {}

    if "error" in insights_data:
        logging.error(f"Error fetching insights: {insights_data['error']}")
        return {}

    for item in insights_data.get("data", []):
        campaign_id = item.get("campaign_id")
        if campaign_id:
            campaign_insights[campaign_id] = {
                "name": item.get("campaign_name", "Unknown"),
                "spend": float(item.get("spend", 0))
            }

    return campaign_insights

@shared_task
def fetch_all_accounts_campaigns(user_id, access_token, page_limit=50, max_account_pages=None):
    """
    Fetch all ad accounts and their campaign spending information
    
    Args:
        user_id: User ID for Redis messaging
        access_token: Facebook access token
        page_limit: Number of ad accounts to retrieve per page
        max_account_pages: Maximum number of pages to retrieve (None for all)
    """
    user_info = get_facebook_user_info(access_token)
    if not user_info:
        return {"error": "Failed to fetch Facebook user ID"}

    fb_user_id = user_info["id"]
    fb_user_name = user_info["name"]

    # Use the paginated version of get_ad_accounts
    append_redis_message_adspent(user_id, f"Fetching ad accounts for {fb_user_name}...")
    ad_account_ids = get_ad_accounts(fb_user_id, access_token, limit=page_limit, max_pages=max_account_pages)
    
    if not ad_account_ids:
        return {"error": "No ad accounts found for this user"}

    result = {
        "facebook_id": fb_user_id,
        "facebook_name": fb_user_name,
        "accounts": {},
        "totals": {
            "total_daily_budget": 0,
            "total_budget_remaining": 0,
            "total_estimated_spent": 0,
            "total_insights_spent": 0
        },
        "account_count": len(ad_account_ids)
    }

    now_manila = datetime.now(manila_tz)
    today_str = now_manila.strftime('%Y-%m-%d')
    
    # Process accounts in batches for better performance
    from concurrent.futures import ThreadPoolExecutor
    import math
    
    # Configure batch size - adjust based on your server capacity
    batch_size = 5  # Process 5 accounts at a time
    total_accounts = len(ad_account_ids)
    total_batches = math.ceil(total_accounts / batch_size)
    
    append_redis_message_adspent(user_id, f"Processing {total_accounts} ad accounts in {total_batches} batches...")
    
    def process_account(acc_data):
        """Process a single ad account and return its campaign data"""
        ad_account_id = acc_data["id"]
        ad_account_name = acc_data["name"]
        
        try:
            campaign_data = fetch_campaign_data_for_account(ad_account_id, access_token)
            campaign_insights = fetch_campaign_insights(
                ad_account_id, access_token, since_date=today_str, until_date=today_str
            )
            
            if "error" in campaign_data:
                return ad_account_id, {"error": campaign_data["error"]}
                
            account_info = {
                "name": ad_account_name,
                "campaigns": [],
                "total_daily_budget": 0,
                "total_budget_remaining": 0,
                "total_estimated_spent": 0,
                "total_insights_spent": 0
            }
            
            for campaign in campaign_data.get("data", []):
                campaign_id = campaign.get("id")
                daily_budget = int(campaign.get("daily_budget", 0)) / 100 if campaign.get("daily_budget") else 0
                budget_remaining = int(campaign.get("budget_remaining", 0)) / 100 if campaign.get("budget_remaining") else 0
                estimated_spent = round(daily_budget - budget_remaining, 2)
                
                insights_spend = campaign_insights.get(campaign_id, {}).get("spend", 0)
                
                campaign_info = {
                    "name": campaign.get("name", "Unknown"),
                    "status": campaign.get("status", "Unknown"),
                    "daily_budget": daily_budget,
                    "budget_remaining": budget_remaining,
                    "estimated_spent": estimated_spent,
                    "insights_spend": insights_spend,
                    "spend_difference": round(insights_spend - estimated_spent, 2)
                }
                
                account_info["campaigns"].append(campaign_info)
                account_info["total_daily_budget"] += daily_budget
                account_info["total_budget_remaining"] += budget_remaining
                account_info["total_estimated_spent"] += estimated_spent
                account_info["total_insights_spent"] += insights_spend
                
            return ad_account_id, account_info
        except Exception as e:
            logging.error(f"Error processing account {ad_account_id}: {str(e)}")
            return ad_account_id, {"error": str(e)}
    
    # Process accounts in batches
    for batch_num in range(total_batches):
        start_idx = batch_num * batch_size
        end_idx = min(start_idx + batch_size, total_accounts)
        batch = ad_account_ids[start_idx:end_idx]
        
        append_redis_message_adspent(user_id, f"Processing batch {batch_num+1}/{total_batches} ({start_idx+1}-{end_idx} of {total_accounts})...")
        
        # Process this batch in parallel
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            batch_results = list(executor.map(process_account, batch))
            
        # Add results to the main result object
        for ad_account_id, account_info in batch_results:
            result["accounts"][ad_account_id] = account_info
            
            # Only update totals if this account has no errors
            if "error" not in account_info:
                result["totals"]["total_daily_budget"] += account_info["total_daily_budget"]
                result["totals"]["total_budget_remaining"] += account_info["total_budget_remaining"]
                result["totals"]["total_estimated_spent"] += account_info["total_estimated_spent"]
                result["totals"]["total_insights_spent"] += account_info["total_insights_spent"]
                
                # Send a progress update for this account
                try:
                    message = {
                        "account_name": account_info["name"],
                        "total_daily_budget": account_info["total_daily_budget"],
                        "total_budget_remaining": account_info["total_budget_remaining"],
                        "total_estimated_spent": account_info["total_estimated_spent"],
                        "total_insights_spent": account_info["total_insights_spent"],
                        "spend_difference": round(account_info["total_insights_spent"] - account_info["total_estimated_spent"], 2),
                        "timestamp": now_manila.isoformat()
                    }
                    append_redis_message_adspent(user_id, message)
                except Exception as e:
                    logging.error(f"Failed to append Redis ad spent message for {ad_account_id}: {e}")

    result["totals"]["spend_difference"] = round(
        result["totals"]["total_insights_spent"] - result["totals"]["total_estimated_spent"], 2
    )

    append_redis_message_adspent(user_id, "Fetching report completed for all ad accounts.")
    return result
