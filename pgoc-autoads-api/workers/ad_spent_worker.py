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
        logging.debug(f"Facebook API Response: {data}")  # Log the response

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

def get_ad_accounts(fb_user_id, access_token):
    url = f"{FACEBOOK_GRAPH_URL}/{fb_user_id}/adaccounts?fields=id,name"
    data = fetch_facebook_data(url, access_token)
    return [
        {
            "id": acc["id"].replace("act_", ""),
            "name": acc.get("name", "Unknown")
        }
        for acc in data.get("data", [])
    ] if "data" in data else []

def fetch_campaign_data_for_account(ad_account_id, access_token):
    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
        f"?fields=name,status,daily_budget,budget_remaining"
    )
    return fetch_facebook_data(url, access_token)

def fetch_campaign_insights(ad_account_id, access_token, since_date=None, until_date=None):
    """
    Fetch campaign insights including spend data directly from the insights endpoint.
    
    Args:
        ad_account_id: The Facebook ad account ID
        access_token: The Facebook access token
        since_date: Start date for insights data (default: yesterday)
        until_date: End date for insights data (default: today)
        
    Returns:
        Dictionary mapping campaign IDs to their spend data
    """
    # Set default date range to today if not specified
    if not since_date:
        since_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    if not until_date:
        until_date = datetime.now().strftime('%Y-%m-%d')
    
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
def fetch_all_accounts_campaigns(user_id,access_token):
    user_info = get_facebook_user_info(access_token)
    if not user_info:
        return {"error": "Failed to fetch Facebook user ID"}

    fb_user_id = user_info["id"]
    fb_user_name = user_info["name"]

    ad_account_ids = get_ad_accounts(fb_user_id, access_token)
    if not ad_account_ids:
        return {"error": "No ad accounts found for this user"}

    result = {
        "facebook_id": fb_user_id,
        "facebook_name": fb_user_name,
        "accounts": {},
        "totals": {
            "total_daily_budget": 0,
            "total_budget_remaining": 0,
            "total_spent": 0,
            "total_insights_spent": 0  # New field for insights-based spending
        }
    }

    for acc in ad_account_ids:
        ad_account_id = acc["id"]
        ad_account_name = acc["name"]
        logging.info(f"Processing Ad Account: {ad_account_id}")
        append_redis_message_adspent(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing Ad Account: {ad_account_id}")
        campaign_data = fetch_campaign_data_for_account(ad_account_id, access_token)
        
        # Fetch insights data for comparison
        campaign_insights = fetch_campaign_insights(ad_account_id, access_token)

        if "error" in campaign_data:
            result["accounts"][ad_account_id] = {"error": campaign_data["error"]}
            continue

        account_info = {
            "name": ad_account_name,
            "campaigns": [],
            "total_daily_budget": 0,
            "total_budget_remaining": 0,
            "total_spent": 0,
            "total_insights_spent": 0  # New field for insights-based spending
        }

        for campaign in campaign_data.get("data", []):
            campaign_id = campaign.get("id")
            daily_budget = int(campaign.get("daily_budget", 0)) / 100 if campaign.get("daily_budget") else 0
            budget_remaining = int(campaign.get("budget_remaining", 0)) / 100 if campaign.get("budget_remaining") else 0
            spent = round(daily_budget - budget_remaining, 2)
            
            # Get insights spend for this campaign if available
            insights_spend = 0
            if campaign_id in campaign_insights:
                insights_spend = campaign_insights[campaign_id]["spend"]
            
            campaign_info = {
                "name": campaign.get("name", "Unknown"),
                "status": campaign.get("status", "Unknown"),
                "daily_budget": daily_budget,
                "budget_remaining": budget_remaining,
                "spent": spent,
                "insights_spend": insights_spend,  # Add insights spend
                "spend_difference": round(insights_spend - spent, 2)  # Calculate difference
            }
            
            account_info["campaigns"].append(campaign_info)

            account_info["total_daily_budget"] += daily_budget
            account_info["total_budget_remaining"] += budget_remaining
            account_info["total_spent"] += spent
            account_info["total_insights_spent"] += insights_spend

        # Append to Redis message
        try:
            message = {
                "account_name": ad_account_name,
                "total_daily_budget": account_info["total_daily_budget"],
                "total_budget_remaining": account_info["total_budget_remaining"],
                "total_spent": account_info["total_spent"],
                "total_insights_spent": account_info["total_insights_spent"],
                "spend_difference": round(account_info["total_insights_spent"] - account_info["total_spent"], 2),
                "timestamp": datetime.now(manila_tz).isoformat()
            }
            append_redis_message_adspent(user_id, message)
        except Exception as e:
            logging.error(f"Failed to append Redis ad spent message for {ad_account_id}: {e}")

        result["totals"]["total_daily_budget"] += account_info["total_daily_budget"]
        result["totals"]["total_budget_remaining"] += account_info["total_budget_remaining"]
        result["totals"]["total_spent"] += account_info["total_spent"]
        result["totals"]["total_insights_spent"] += account_info["total_insights_spent"]

        result["accounts"][ad_account_id] = account_info

    # Calculate total spend difference
    result["totals"]["spend_difference"] = round(
        result["totals"]["total_insights_spent"] - result["totals"]["total_spent"], 2
    )
    
    # Log completion message
    append_redis_message_adspent(user_id, "Fetching report completed for all ad accounts.")

    return result
