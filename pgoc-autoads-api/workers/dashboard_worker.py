import json
import logging
import pytz
import requests
from datetime import datetime
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from celery import shared_task

# Constants
FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v22.0"
manila_tz = pytz.timezone("Asia/Manila")

# Logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Session with connection pooling
session = requests.Session()
session.mount('https://', requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=50, max_retries=3))

def get_current_time():
    """Get current time in Manila timezone"""
    return datetime.now(manila_tz).strftime("%Y-%m-%d %H:%M:%S")

def append_message(user_id, message):
    """Append message with current Manila time"""
    timestamp = get_current_time()

def get_facebook_user_info(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me"
    params = {"access_token": access_token, "fields": "id,name"}
    try:
        response = session.get(url, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
        logger.error(f"User info error: {response.status_code}, {response.text}")
    except Exception as e:
        logger.error(f"Exception in get_facebook_user_info: {e}")
    return None

def get_ad_accounts(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me/adaccounts"
    params = {"access_token": access_token, "fields": "id,name", "limit": 1000}
    ad_accounts = []
    try:
        while url:
            response = session.get(url, params=params if '?' not in url else {}, timeout=15)
            if response.status_code != 200:
                logger.error(f"Ad accounts error: {response.status_code}, {response.text}")
                break
            data = response.json()
            for acc in data.get("data", []):
                ad_accounts.append({
                    "id": acc.get("id", "").replace("act_", ""),
                    "name": acc.get("name", "Unnamed Account")
                })
            url = data.get("paging", {}).get("next")
        return ad_accounts
    except Exception as e:
        logger.error(f"Exception in get_ad_accounts: {e}")
        return []

def get_campaigns(access_token, ad_account_id):
    """Get campaigns for a specific ad account"""
    url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
    params = {"access_token": access_token, "fields": "id,name,account_id", "limit": 1000}
    campaigns = []
    try:
        while url:
            response = session.get(url, params=params if '?' not in url else {}, timeout=15)
            if response.status_code != 200:
                logger.error(f"Campaigns error: {response.status_code}, {response.text}")
                break
            data = response.json()
            logger.info(f"Fetched campaigns for account {ad_account_id}: {len(data.get('data', []))} campaigns")
            
            for campaign in data.get("data", []):
                campaign_account_id = campaign.get("account_id", "").replace("act_", "")
                logger.info(f"Campaign account_id: {campaign_account_id}, Ad account_id: {ad_account_id}")
                
                if campaign_account_id == ad_account_id:
                    campaigns.append({
                        "id": campaign.get("id", ""),
                        "name": campaign.get("name", "Unnamed Campaign")
                    })
            
            url = data.get("paging", {}).get("next")
        
        logger.info(f"Total campaigns found for account {ad_account_id}: {len(campaigns)}")
        return campaigns
    except Exception as e:
        logger.error(f"Exception in get_campaigns: {e}")
        return []

@shared_task
def fetch_dashboard_data(access_token, user_id):
    """
    Celery task to fetch dashboard data asynchronously
    """
    try:
        # Get user info
        user_info = get_facebook_user_info(access_token)
        if not user_info:
            raise Exception("Failed to fetch user information")

        # Get ad accounts
        ad_accounts = get_ad_accounts(access_token)
        if not ad_accounts:
            raise Exception("Failed to fetch ad accounts")

        # Get campaigns for each ad account and structure the response
        all_campaigns = []
        for account in ad_accounts:
            campaigns = get_campaigns(access_token, account["id"])
            for campaign in campaigns:
                all_campaigns.append({
                    "campaign_id": campaign["id"],
                    "campaign_name": campaign["name"],
                    "status": "ACTIVE",  # Default status
                    "account_id": account["id"],
                    "account_name": account["name"]
                })

        return {
            "status": "success",
            "data": {
                "user": user_info,
                "campaigns": all_campaigns
            }
        }

    except Exception as e:
        logger.error(f"Error in fetch_dashboard_data: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }