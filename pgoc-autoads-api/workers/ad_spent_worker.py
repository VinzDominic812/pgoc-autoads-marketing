import json
import logging
import re
import time
import pytz
import redis
import requests
from celery import shared_task
from datetime import datetime

# Redis client
redis_client_ads = redis.Redis(
    host="redisAds",
    port=6379,
    db=15,
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

        if "error" in data:
            logging.error(f"Facebook API Error: {data['error']}")
            return {"error": data["error"]}
        return data

    except requests.exceptions.RequestException as e:
        logging.error(f"RequestException: {e}")
        return {"error": {"message": str(e), "type": "RequestException"}}


def get_facebook_user_id(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me?fields=id"
    data = fetch_facebook_data(url, access_token)
    return data.get("id") if data and "id" in data else None


def get_ad_accounts(fb_user_id, access_token):
    url = f"{FACEBOOK_GRAPH_URL}/{fb_user_id}/adaccounts?fields=id"
    data = fetch_facebook_data(url, access_token)
    return [acc["id"].replace("act_", "") for acc in data.get("data", [])] if "data" in data else []


def fetch_campaign_data_for_account(ad_account_id, access_token):
    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
        f"?fields=name,status,daily_budget,budget_remaining"
    )
    return fetch_facebook_data(url, access_token)


@shared_task
def fetch_all_accounts_campaigns(access_token):
    fb_user_id = get_facebook_user_id(access_token)
    if not fb_user_id:
        return {"error": "Failed to fetch Facebook user ID"}

    ad_account_ids = get_ad_accounts(fb_user_id, access_token)
    if not ad_account_ids:
        return {"error": "No ad accounts found for this user"}

    result = {
        "facebook_id": fb_user_id,
        "accounts": {},
        "totals": {
            "total_daily_budget": 0,
            "total_budget_remaining": 0,
            "total_spent": 0
        }
    }

    for ad_account_id in ad_account_ids:
        logging.info(f"Processing Ad Account: {ad_account_id}")
        campaign_data = fetch_campaign_data_for_account(ad_account_id, access_token)

        if "error" in campaign_data:
            result["ad_accounts_id"][ad_account_id] = {"error": campaign_data["error"]}
            continue

        account_info = {
            "campaigns": [],
            "total_daily_budget": 0,
            "total_budget_remaining": 0,
            "total_spent": 0
        }

        for campaign in campaign_data.get("data", []):
            daily_budget = int(campaign.get("daily_budget", 0)) / 100 if campaign.get("daily_budget") else 0
            budget_remaining = int(campaign.get("budget_remaining", 0)) / 100 if campaign.get("budget_remaining") else 0
            spent = round(daily_budget - budget_remaining, 2)

            account_info["campaigns"].append({
                "name": campaign.get("name", "Unknown"),
                "status": campaign.get("status", "Unknown"),
                "daily_budget": daily_budget,
                "budget_remaining": budget_remaining,
                "spent": spent,
            })

            # Add to ad account totals
            account_info["total_daily_budget"] += daily_budget
            account_info["total_budget_remaining"] += budget_remaining
            account_info["total_spent"] += spent

        # Add account totals to global totals
        result["totals"]["total_daily_budget"] += account_info["total_daily_budget"]
        result["totals"]["total_budget_remaining"] += account_info["total_budget_remaining"]
        result["totals"]["total_spent"] += account_info["total_spent"]

        # Store account info
        result["accounts"][ad_account_id] = account_info

    return result
