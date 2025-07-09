import json
import re
import logging
import pytz
import requests
import time
from datetime import datetime
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from celery import shared_task
from workers.on_off_functions.edit_budget_message import append_redis_message_editbudget

# Constants
FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v22.0"
manila_tz = pytz.timezone("Asia/Manila")

# Logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def get_current_time():
    """Get current time in Manila timezone"""
    return datetime.now(manila_tz).strftime("%Y-%m-%d %H:%M:%S")

def normalize_name(name: str) -> str:
    """
    Normalize campaign names by lowercasing and removing extra spaces/special characters.
    """
    name = name.lower().strip()
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'[^\w\s]', '', name)
    return name

def convert_to_minor_units(user_input) -> int:
    """
    Convert user input budget in pesos to centavos (minor units).
    """
    try:
        return int(float(user_input) * 100)
    except (ValueError, TypeError):
        raise ValueError("Invalid budget input. Please enter a number like 300 or 300.00")

def find_campaign_id_by_name(ad_account_id: str, access_token: str, input_campaign_name: str) -> str:
    """
    Get the campaign ID by matching a normalized campaign name.
    """
    url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
    params = {
        "fields": "name",
        "limit": 1000,
        "access_token": access_token
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        normalized_input = normalize_name(input_campaign_name)

        for campaign in data.get("data", []):
            campaign_name = campaign.get("name", "")
            if normalize_name(campaign_name) == normalized_input:
                logger.info(f"[{get_current_time()}] Match found: {campaign_name} ({campaign['id']})")
                return campaign["id"]

        logger.warning(f"[{get_current_time()}] No matching campaign found for name: {input_campaign_name}")
        return ""

    except requests.RequestException as e:
        logger.error(f"[{get_current_time()}] Error while fetching campaigns: {e}")
        return ""

def update_campaign_budget(campaign_id: str, access_token: str, new_daily_budget: int) -> bool:
    """
    Update the daily budget of a campaign.
    """
    url = f"{FACEBOOK_GRAPH_URL}/{campaign_id}"
    payload = {
        "daily_budget": str(new_daily_budget),
        "access_token": access_token
    }

    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        logger.info(f"[{get_current_time()}] Updated budget for campaign {campaign_id} to {new_daily_budget}")
        return True

    except requests.RequestException as e:
        logger.error(f"[{get_current_time()}] Failed to update budget for campaign {campaign_id}: {e}")
        return False

@shared_task
def update_budget_by_campaign_name(ad_account_id: str, campaign_name: str, new_budget_dollars: float, access_token: str, user_id) -> str:
    """
    Celery task to find a campaign by name and update its daily budget.
    User input is in regular pesos (e.g., 300 or 300.00), and will be converted to centavos.
    """
    start_msg = f"⏳ Starting budget update for campaign: '{campaign_name}' to ₱{new_budget_dollars:.2f}"
    append_redis_message_editbudget(user_id, start_msg)

    campaign_id = find_campaign_id_by_name(ad_account_id, access_token, campaign_name)

    if not campaign_id:
        error_msg = f"❌ Campaign '{campaign_name}' not found under ad account {ad_account_id}"
        append_redis_message_editbudget(user_id, error_msg)
        return error_msg

    try:
        new_daily_budget = convert_to_minor_units(new_budget_dollars)
    except ValueError as ve:
        error_msg = f"❌ Invalid budget input: {ve}"
        append_redis_message_editbudget(user_id, error_msg)
        return error_msg

    success = update_campaign_budget(campaign_id, access_token, new_daily_budget)

    if success:
        result_msg = f"[{get_current_time()}] ✅ Budget for campaign '{campaign_name}' (ID: {campaign_id}) updated to ₱{new_budget_dollars:.2f}"
        append_redis_message_editbudget(user_id, result_msg)
        return result_msg
    else:
        error_msg = f"❌ Failed to update budget for campaign '{campaign_name}' (ID: {campaign_id})"
        append_redis_message_editbudget(user_id, error_msg)
        return error_msg