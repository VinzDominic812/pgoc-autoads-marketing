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
    # First get campaign data
    campaign_url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
        f"?fields=name,status,daily_budget,budget_remaining"
    )
    campaign_data = fetch_facebook_data(campaign_url, access_token)
    
    if "error" in campaign_data:
        return campaign_data
    
    # For each campaign, fetch its ad sets
    for campaign in campaign_data.get("data", []):
        campaign_id = campaign.get("id")
        if campaign_id:
            # Fetch ad sets for this campaign
            adset_url = (
                f"{FACEBOOK_GRAPH_URL}/{campaign_id}/adsets"
                f"?fields=id,name,status,daily_budget,budget_remaining"
            )
            adset_data = fetch_facebook_data(adset_url, access_token)
            
            if "error" not in adset_data:
                # Add ad sets data to the campaign
                campaign["adsets"] = adset_data.get("data", [])
                
                # Check if any ad sets are active and delivering
                has_active_delivering_adsets = False
                for adset in campaign["adsets"]:
                    if adset.get("status") == "ACTIVE":
                        has_active_delivering_adsets = True
                        break
                
                # If campaign is active but no ad sets are active, mark it as not delivering
                if campaign.get("status") == "ACTIVE" and not has_active_delivering_adsets:
                    campaign["delivery_status"] = "NOT_DELIVERING"
    
    return campaign_data

def fetch_active_delivering_campaigns(ad_account_id, access_token):
    """Fetch only campaigns that are actually delivering ads today"""
    target_date = datetime.now(manila_tz).strftime("%Y-%m-%d")
    
    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/insights"
        f"?level=campaign&fields=campaign_id,campaign_name,spend"
        f"&time_range[since]={target_date}&time_range[until]={target_date}"
    )
    
    insights_data = fetch_facebook_data(url, access_token)
    active_campaigns = set()
    
    if "error" not in insights_data:
        for item in insights_data.get("data", []):
            campaign_id = item.get("campaign_id")
            spend = float(item.get("spend", 0))
            
            # If the campaign has any spend on the target date, it's delivering
            if campaign_id and spend > 0:
                active_campaigns.add(campaign_id)
    
    return active_campaigns

def fetch_campaign_insights(ad_account_id, access_token, since_date=None, until_date=None):
    """Fetch campaign spend for today."""
    target_date = datetime.now(manila_tz).strftime("%Y-%m-%d")
    since_date = since_date or target_date
    until_date = until_date or target_date

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
    Fetch all ad accounts and their campaign spending information for today
    
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
            "total_insights_spent": 0,
            "campaign_status_count": {
                "active_delivering": 0,
                "active_not_delivering": 0,
                "paused": 0,
                "deleted": 0,
                "archived": 0,
                "other": 0
            }
        },
        "account_count": len(ad_account_ids)
    }

    target_date = datetime.now(manila_tz).strftime("%Y-%m-%d")
    target_timestamp = datetime.now(manila_tz).isoformat()
    
    # Process accounts in batches for better performance
    from concurrent.futures import ThreadPoolExecutor
    import math
    
    # Configure batch size - adjust based on your server capacity
    batch_size = 5  # Process 5 accounts at a time
    total_accounts = len(ad_account_ids)
    total_batches = math.ceil(total_accounts / batch_size)
    
    append_redis_message_adspent(user_id, f"Processing {total_accounts} ad accounts in {total_batches} batches for {target_date}...")
    
    def process_account(acc_data):
        """Process a single ad account and return its campaign data"""
        ad_account_id = acc_data["id"]
        ad_account_name = acc_data["name"]
        
        try:
            campaign_data = fetch_campaign_data_for_account(ad_account_id, access_token)
            # Get set of campaign IDs that are actively delivering
            active_delivering_campaigns = fetch_active_delivering_campaigns(ad_account_id, access_token)
            campaign_insights = fetch_campaign_insights(
                ad_account_id, access_token, since_date=target_date, until_date=target_date
            )
            
            if "error" in campaign_data:
                return ad_account_id, {"error": campaign_data["error"]}
                
            account_info = {
                "name": ad_account_name,
                "campaigns": [],
                "total_daily_budget": 0,
                "total_budget_remaining": 0,
                "total_estimated_spent": 0,
                "total_insights_spent": 0,
                "campaign_status_count": {
                    "active_delivering": 0,
                    "active_not_delivering": 0,
                    "paused": 0,
                    "deleted": 0,
                    "archived": 0,
                    "other": 0
                }
            }
            
            for campaign in campaign_data.get("data", []):
                campaign_id = campaign.get("id")
                status = campaign.get("status", "UNKNOWN")
                
                # Determine if campaign is delivering based on insights data and ad set status
                insights_spend = float(campaign_insights.get(campaign_id, {}).get("spend", 0))
                has_active_adsets = any(adset.get("status") == "ACTIVE" for adset in campaign.get("adsets", []))
                is_delivering = (campaign_id in active_delivering_campaigns or insights_spend > 0) and has_active_adsets
                
                # Track campaign status
                if status == "ACTIVE":
                    if is_delivering:
                        account_info["campaign_status_count"]["active_delivering"] += 1
                        campaign_status = "ACTIVE_DELIVERING"
                    else:
                        account_info["campaign_status_count"]["active_not_delivering"] += 1
                        campaign_status = "ACTIVE_NOT_DELIVERING"
                elif status == "PAUSED":
                    account_info["campaign_status_count"]["paused"] += 1
                    campaign_status = "PAUSED"
                elif status == "DELETED":
                    account_info["campaign_status_count"]["deleted"] += 1
                    campaign_status = "DELETED"
                elif status == "ARCHIVED":
                    account_info["campaign_status_count"]["archived"] += 1
                    campaign_status = "ARCHIVED"
                else:
                    account_info["campaign_status_count"]["other"] += 1
                    campaign_status = "OTHER"
                
                # Calculate budget and spending info
                daily_budget = int(campaign.get("daily_budget", 0)) / 100 if campaign.get("daily_budget") else 0
                budget_remaining = int(campaign.get("budget_remaining", 0)) / 100 if campaign.get("budget_remaining") else 0
                estimated_spent = round(daily_budget - budget_remaining, 2)
                
                campaign_info = {
                    "name": campaign.get("name", "Unknown"),
                    "status": status,
                    "delivery_status": "DELIVERING" if is_delivering else "NOT_DELIVERING",
                    "campaign_status": campaign_status,
                    "daily_budget": daily_budget,
                    "budget_remaining": budget_remaining,
                    "estimated_spent": estimated_spent,
                    "insights_spend": insights_spend,
                    "spend_difference": round(insights_spend - estimated_spent, 2),
                    "active_adsets_count": sum(1 for adset in campaign.get("adsets", []) if adset.get("status") == "ACTIVE")
                }
                
                account_info["campaigns"].append(campaign_info)
                
                # Only add to budget totals if campaign is active AND delivering
                if status == "ACTIVE" and is_delivering:
                    account_info["total_daily_budget"] += daily_budget
                    account_info["total_budget_remaining"] += budget_remaining
                    account_info["total_estimated_spent"] += estimated_spent
                
                # Always add insights spend (real spend data)
                account_info["total_insights_spent"] += insights_spend
            
            # Send campaign status count to Redis console
            status_message = {
                "account_name": ad_account_name,
                "active_delivering": account_info["campaign_status_count"]["active_delivering"],
                "active_not_delivering": account_info["campaign_status_count"]["active_not_delivering"],
                "paused": account_info["campaign_status_count"]["paused"],
                "deleted": account_info["campaign_status_count"]["deleted"],
                "archived": account_info["campaign_status_count"]["archived"],
                "other": account_info["campaign_status_count"]["other"],
                "timestamp": target_timestamp
            }
            append_redis_message_adspent(user_id, f"Campaign Status for {ad_account_name}: {json.dumps(status_message)}")
            
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
                
                # Update overall campaign status counts
                for status, count in account_info["campaign_status_count"].items():
                    result["totals"]["campaign_status_count"][status] += count
                
                # Send a progress update for this account
                try:
                    message = {
                        "account_name": account_info["name"],
                        "total_daily_budget": account_info["total_daily_budget"],
                        "total_budget_remaining": account_info["total_budget_remaining"],
                        "total_estimated_spent": account_info["total_estimated_spent"],
                        "total_insights_spent": account_info["total_insights_spent"],
                        "spend_difference": round(account_info["total_insights_spent"] - account_info["total_estimated_spent"], 2),
                        "timestamp": target_timestamp
                    }
                    append_redis_message_adspent(user_id, message)
                except Exception as e:
                    logging.error(f"Failed to append Redis ad spent message for {ad_account_id}: {e}")

    # Calculate spend difference
    result["totals"]["spend_difference"] = round(
        result["totals"]["total_insights_spent"] - result["totals"]["total_estimated_spent"], 2
    )
    
    # Send final campaign status summary to Redis
    total_campaigns = sum(result["totals"]["campaign_status_count"].values())
    status_summary = {
        "active_delivering": result["totals"]["campaign_status_count"]["active_delivering"],
        "active_not_delivering": result["totals"]["campaign_status_count"]["active_not_delivering"],
        "paused": result["totals"]["campaign_status_count"]["paused"],
        "deleted": result["totals"]["campaign_status_count"]["deleted"],
        "archived": result["totals"]["campaign_status_count"]["archived"],
        "other": result["totals"]["campaign_status_count"]["other"],
        "total_campaigns": total_campaigns
    }
    
    # Send formatted campaign status summary
    summary_message = (
        f"==== CAMPAIGN STATUS SUMMARY FOR {target_date} ====\n"
        f"Total Campaigns: {total_campaigns}\n"
        f"- Active & Delivering: {status_summary['active_delivering']} ({(status_summary['active_delivering']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
        f"- Active but NOT Delivering: {status_summary['active_not_delivering']} ({(status_summary['active_not_delivering']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
        f"- Paused: {status_summary['paused']} ({(status_summary['paused']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
        f"- Deleted: {status_summary['deleted']} ({(status_summary['deleted']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
        f"- Archived: {status_summary['archived']} ({(status_summary['archived']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
        f"- Other Status: {status_summary['other']} ({(status_summary['other']/total_campaigns*100) if total_campaigns > 0 else 0:.1f}%)\n"
    )
    
    append_redis_message_adspent(user_id, summary_message)
    append_redis_message_adspent(user_id, f"Fetching report completed for all ad accounts for {target_date}.")
    
    return result