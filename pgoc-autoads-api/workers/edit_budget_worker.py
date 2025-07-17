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
    Normalize campaign names by lowercasing and removing extra spaces (but NOT dashes or special characters except spaces).
    """
    name = name.lower().strip()
    name = re.sub(r'\s+', ' ', name)
    return name

def parse_campaign_name(campaign_name: str) -> dict:
    """
    Parse campaign name into components: page_name, item_name, campaign_code
    """
    if not campaign_name:
        return {"page_name": "", "item_name": "", "campaign_code": ""}
    
    # Split by dash and get components
    parts = campaign_name.split('-')
    
    if len(parts) >= 4:
        # Format: page_name-item_name-date-campaign_code
        page_name = parts[0].strip()
        item_name = parts[1].strip()
        campaign_code = parts[-1].strip()  # Last part is campaign_code
        return {
            "page_name": page_name,
            "item_name": item_name,
            "campaign_code": campaign_code
        }
    elif len(parts) >= 3:
        # Fallback for shorter formats
        page_name = parts[0].strip()
        item_name = parts[1].strip()
        campaign_code = parts[-1].strip()
        return {
            "page_name": page_name,
            "item_name": item_name,
            "campaign_code": campaign_code
        }
    else:
        # If format doesn't match expected pattern, return original as page_name
        return {
            "page_name": campaign_name,
            "item_name": "",
            "campaign_code": ""
        }

def extract_page_name(campaign_name: str) -> str:
    """
    Extract the page name (first part before '-') from the campaign name.
    """
    return campaign_name.split('-')[0].lower().strip() if campaign_name else ""

def convert_to_minor_units(user_input) -> int:
    """
    Convert user input budget in pesos to centavos (minor units).
    """
    try:
        return int(float(user_input) * 100)
    except (ValueError, TypeError):
        raise ValueError("Invalid budget input. Please enter a number like 300 or 300.00")

def find_campaign_id_by_components(ad_account_id: str, access_token: str, input_page_name: str, input_item_name: str = None, input_campaign_code: str = None) -> str:
    """
    Get the campaign ID by matching page_name, item_name, and campaign_code in the campaign name.
    STRICT MATCHING: All three components must match exactly.
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

        # Normalize input values
        input_page_name = input_page_name.lower().strip() if input_page_name else ""
        input_item_name = input_item_name.lower().strip() if input_item_name else ""
        input_campaign_code = input_campaign_code.strip() if input_campaign_code else ""

        # STRICT MATCHING: All three components must be provided and match exactly
        if not input_page_name or not input_item_name or not input_campaign_code:
            logger.warning(f"[{get_current_time()}] STRICT MODE: All three components (page_name, item_name, campaign_code) must be provided. Got: page_name='{input_page_name}', item_name='{input_item_name}', campaign_code='{input_campaign_code}'")
            return ""

        # Find the best match and identify what's wrong
        best_match = None
        best_match_score = 0
        best_match_details = {}

        for campaign in data.get("data", []):
            campaign_name = campaign.get("name", "")
            parsed_campaign = parse_campaign_name(campaign_name)
            
            # Check each component
            page_match = parsed_campaign["page_name"].lower() == input_page_name
            item_match = parsed_campaign["item_name"].lower() == input_item_name
            code_match = parsed_campaign["campaign_code"] == input_campaign_code
            
            # Calculate match score
            match_score = sum([page_match, item_match, code_match])
            
            if match_score > best_match_score:
                best_match_score = match_score
                best_match = campaign
                best_match_details = {
                    "campaign_name": campaign_name,
                    "campaign_id": campaign["id"],
                    "parsed_page": parsed_campaign["page_name"],
                    "parsed_item": parsed_campaign["item_name"],
                    "parsed_code": parsed_campaign["campaign_code"],
                    "page_match": page_match,
                    "item_match": item_match,
                    "code_match": code_match
                }
            
            # Perfect match
            if page_match and item_match and code_match:
                logger.info(f"[{get_current_time()}] STRICT MATCH FOUND: {campaign_name} ({campaign['id']}) - Page: {parsed_campaign['page_name']}, Item: {parsed_campaign['item_name']}, Code: {parsed_campaign['campaign_code']}")
                return campaign["id"]

        # If no perfect match, provide detailed error about what's wrong
        if best_match:
            error_details = []
            if not best_match_details["page_match"]:
                error_details.append(f"page_name: expected '{input_page_name}', found '{best_match_details['parsed_page']}'")
            if not best_match_details["item_match"]:
                error_details.append(f"item_name: expected '{input_item_name}', found '{best_match_details['parsed_item']}'")
            if not best_match_details["code_match"]:
                error_details.append(f"campaign_code: expected '{input_campaign_code}', found '{best_match_details['parsed_code']}'")
            
            logger.warning(f"[{get_current_time()}] STRICT MODE: No exact match. Closest match '{best_match_details['campaign_name']}' has mismatches: {', '.join(error_details)}")
        else:
            logger.warning(f"[{get_current_time()}] STRICT MODE: No campaigns found in account {ad_account_id}")

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
def update_budget_by_campaign_name(ad_account_id: str, campaign_name: str, new_budget_dollars: float, access_token: str, user_id, item_name: str = None, campaign_code: str = None) -> str:
    """
    Celery task to find a campaign by name components and update its daily budget.
    User input is in regular pesos (e.g., 300 or 300.00), and will be converted to centavos.
    """
    start_msg = f"⏳ Starting budget update for campaign: '{campaign_name}' (Item: {item_name}, Code: {campaign_code}) to ₱{new_budget_dollars:.2f}"
    append_redis_message_editbudget(user_id, start_msg)

    campaign_id = find_campaign_id_by_components(ad_account_id, access_token, campaign_name, item_name, campaign_code)

    if not campaign_id:
        # The detailed error message is already logged in find_campaign_id_by_components
        error_msg = f"❌ STRICT MODE: No exact match found under ad account {ad_account_id} for page_name: '{campaign_name}', item_name: '{item_name}', campaign_code: '{campaign_code}'. Check the logs for specific mismatch details."
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