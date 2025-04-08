import json
import logging
import re
import time
import pytz
import redis
import requests
from celery import shared_task
from datetime import datetime
from flask import request, jsonify
from sqlalchemy.orm.attributes import flag_modified
# from workers.on_off_functions.on_off_adsets import append_redis_message_adsets
from workers.update_status import process_adsets

# Set up Redis clients
redis_client_ads = redis.Redis(
    host="redisAds",
    port=6379,
    db=15,
    decode_responses=True
)

# Timezone
manila_tz = pytz.timezone("Asia/Manila")

# Facebook API
FACEBOOK_API_VERSION = "v22.0"
FACEBOOK_GRAPH_URL = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}"

# Compile regex once for performance
NON_ALPHANUMERIC_REGEX = re.compile(r'[^a-zA-Z0-9]+')


def normalize_text(text):
    """Replace all non-alphanumeric characters with spaces and split into words."""
    return NON_ALPHANUMERIC_REGEX.sub(' ', text).lower().split()


def fetch_facebook_data(url, access_token):
    """Fetch data from Facebook API and handle errors."""
    try:
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=5)
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            logging.error(f"Facebook API Error: {data['error']}")
            return {"error": data["error"]}

        return data

    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching data from Facebook API: {e}")
        return {"error": {"message": str(e), "type": "RequestException"}}


@shared_task
def fetch_campaign_spending(user_id, ad_account_id, access_token, status_filter):
    """
    Fetch campaigns for an ad account and calculate their spent budget.
    Required inputs: ad_account_id, access_token, status (e.g., ACTIVE)
    """
    lock_key = f"lock:fetch_spending:{ad_account_id}"
    lock = redis_client_ads.lock(lock_key, timeout=300)

    if not lock.acquire(blocking=False):
        logging.info(f"Spending fetch already running for {ad_account_id}.")
        return f"Spending fetch already in progress for {ad_account_id}"

    try:
        campaign_url = (
            f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
            f"?fields=id,name,status,daily_budget,budget_remaining"
        )
        campaigns_data = fetch_facebook_data(campaign_url, access_token)

        if "error" in campaigns_data:
            error_msg = campaigns_data["error"].get("message", "Unknown error")
            logging.error(f"Facebook API Error: {error_msg}")
            return f"Error fetching campaign data: {error_msg}"

        campaign_spending_info = {}
        total_daily_budget = 0
        total_budget_remaining = 0
        total_spent = 0

        for campaign in campaigns_data.get("data", []):
            if campaign.get("status") != status_filter:
                continue  # Skip campaigns that do not match the status

            campaign_id = campaign["id"]
            name = campaign.get("name", "Unknown")
            status = campaign.get("status", "Unknown")

            # Convert from microcurrency (in cents)
            daily_budget = int(campaign.get("daily_budget", 0)) / 100 if campaign.get("daily_budget") else 0
            budget_remaining = int(campaign.get("budget_remaining", 0)) / 100 if campaign.get("budget_remaining") else 0
            spent = round(daily_budget - budget_remaining, 2)

            # Add to total values
            total_daily_budget += daily_budget
            total_budget_remaining += budget_remaining
            total_spent += spent

            # Store individual campaign info
            campaign_spending_info[campaign_id] = {
                "name": name,
                "status": status,
                "daily_budget": daily_budget,
                "budget_remaining": budget_remaining,
                "spent": spent,
            }

        # Add total values to the response
        campaign_spending_info["total_daily_budget"] = total_daily_budget
        campaign_spending_info["total_budget_remaining"] = total_budget_remaining
        campaign_spending_info["total_spent"] = total_spent

        logging.info(f"Fetched spending info for ad_account {ad_account_id}: {campaign_spending_info}")
        return campaign_spending_info

    except Exception as e:
        logging.error(f"Error fetching campaign spending: {e}")
        return {"error": str(e)}

    finally:
        lock.release()
        logging.info(f"Released spending lock for Ad Account {ad_account_id}")
