import json
import logging
import re
import time
import pytz
import redis
import requests
from celery import shared_task
from datetime import datetime, timedelta
from flask import request, jsonify
from sqlalchemy.orm.attributes import flag_modified
from workers.on_off_functions.on_off_adsets import append_redis_message_adsets
from workers.update_status import process_adsets

# Set up Redis clients
redis_client_as = redis.Redis(
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


def contains_test(text):
    """Check if 'so1' exists as a separate word in campaign_name."""
    return "so1" in normalize_text(text)


def contains_regular(text):
    """Check if 'so2' exists as a separate word in campaign_name."""
    return "so2" in normalize_text(text)


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


def get_cpp_from_insights(ad_account_id, access_token, level, cpp_date_start, cpp_date_end, user_id=None):
    """
    Fetch CPP values from Facebook insights API within a specific date range.
    Returns a dictionary mapping campaign_id or adset_id to CPP values.
    """
    cpp_data = {}
    url = (f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/insights"
           f"?level={level}&fields={level}_id,actions,spend,impressions"
           f"&time_range[since]={cpp_date_start}&time_range[until]={cpp_date_end}")

    if user_id:
        append_redis_message_adsets(
            user_id, 
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fetching {level} insights from {cpp_date_start} to {cpp_date_end}"
        )

    debug_insights = {}  # Store detailed insight data for debugging
    
    while url:
        response_data = fetch_facebook_data(url, access_token)
        if "error" in response_data:
            error_msg = f"Error fetching {level} insights: {response_data['error'].get('message', 'Unknown error')}"
            logging.error(error_msg)
            if user_id:
                append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {error_msg}")
            break

        for item in response_data.get("data", []):
            entity_id = item.get(f"{level}_id")
            spend = float(item.get("spend", 0))
            impressions = float(item.get("impressions", 0))

            # Store debug information
            debug_insights[entity_id] = {
                "spend": spend,
                "impressions": impressions,
                "actions": {}
            }

            actions = item.get("actions", [])
            initiate_checkout_value = 0
            
            for action in actions:
                action_type = action.get("action_type")
                action_value = float(action.get("value", 0))
                debug_insights[entity_id]["actions"][action_type] = action_value
                
                if action_type == "omni_initiated_checkout":
                    initiate_checkout_value = action_value

            # Calculate CPP with proper handling of zero values
            if initiate_checkout_value > 0:
                cpp = spend / initiate_checkout_value
            else:
                cpp = float('inf')  # Use infinity to represent no checkouts
                
            cpp_data[entity_id] = cpp

        url = response_data.get("paging", {}).get("next")  # Pagination

    # Log detailed debug information about the fetched data
    if user_id:
        # Send summary of CPP data
        cpp_summary = {}
        for entity_id, cpp_value in cpp_data.items():
            if cpp_value == float('inf'):
                cpp_summary[entity_id] = "No checkouts"
            else:
                cpp_summary[entity_id] = f"${cpp_value:.2f}"
                
        append_redis_message_adsets(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {level.upper()} CPP VALUES: {json.dumps(cpp_summary, indent=2)}"
        )
        
        # Send detailed insights for debugging
        append_redis_message_adsets(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] DEBUG INSIGHTS: {json.dumps(debug_insights, indent=2)}"
        )

    return cpp_data

@shared_task
def fetch_adsets(user_id, ad_account_id, access_token, matched_schedule):
    """Fetch campaigns for an ad account, including CPP data, and store structured data."""
    lock_key = f"lock:fetch_campaign:{ad_account_id}"
    lock = redis_client_as.lock(lock_key, timeout=300)
    pending_schedules_key = f"pending_schedules:{ad_account_id}"

    logging.info(f"Schedule Data: {matched_schedule}")

    append_redis_message_adsets(
        user_id,
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fetching Campaign Data for {ad_account_id} schedule {matched_schedule}",
    )

    if not lock.acquire(blocking=False):
        logging.info(f"Fetch campaign already running for {ad_account_id}. Adding to queue...")
        redis_client_as.rpush(pending_schedules_key, json.dumps(matched_schedule))
        return f"Fetch already in progress for {ad_account_id}, queued process_scheduled_campaigns"

    try:
        campaign_data = {}

        # Extract date range from matched_schedule
        cpp_date_start = matched_schedule.get("cpp_date_start")
        cpp_date_end = matched_schedule.get("cpp_date_end")
        campaign_code = matched_schedule.get("campaign_code")

        if not cpp_date_start or not cpp_date_end:
            append_redis_message_adsets(
                user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error: Missing cpp_date_start or cpp_date_end in matched_schedule for {ad_account_id}"
            )
            logging.error("Missing cpp_date_start or cpp_date_end in matched_schedule")
            return f"Error: Missing date range for {ad_account_id}"

        # Check if using today's date and adjust if needed
        today = datetime.now().strftime("%Y-%m-%d")
        if cpp_date_start == today and cpp_date_end == today:
            # Use yesterday's date instead if using today
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            append_redis_message_adsets(
                user_id, 
                f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Warning: Using today's date may result in incomplete data. "
                f"Will try both today ({today}) and yesterday ({yesterday})."
            )
            
            # First try with today's date
            cpp_campaign_data_today = get_cpp_from_insights(
                ad_account_id, access_token, "campaign", today, today, user_id
            )
            
            # Then try with yesterday's date
            cpp_campaign_data_yesterday = get_cpp_from_insights(
                ad_account_id, access_token, "campaign", yesterday, yesterday, user_id
            )
            
            # Merge the results, preferring today's data if available
            cpp_campaign_data = cpp_campaign_data_today.copy()
            for campaign_id, cpp in cpp_campaign_data_yesterday.items():
                if campaign_id not in cpp_campaign_data or cpp_campaign_data[campaign_id] == float('inf'):
                    cpp_campaign_data[campaign_id] = cpp
            
            # Do the same for adsets
            cpp_adset_data_today = get_cpp_from_insights(
                ad_account_id, access_token, "adset", today, today, user_id
            )
            
            cpp_adset_data_yesterday = get_cpp_from_insights(
                ad_account_id, access_token, "adset", yesterday, yesterday, user_id
            )
            
            cpp_adset_data = cpp_adset_data_today.copy()
            for adset_id, cpp in cpp_adset_data_yesterday.items():
                if adset_id not in cpp_adset_data or cpp_adset_data[adset_id] == float('inf'):
                    cpp_adset_data[adset_id] = cpp
        else:
            # Use the dates from the schedule
            append_redis_message_adsets(
                user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fetching CPP Data for date range: {cpp_date_start} to {cpp_date_end}"
            )
            
            # Fetch CPP data for campaigns & adsets
            cpp_campaign_data = get_cpp_from_insights(
                ad_account_id, access_token, "campaign", cpp_date_start, cpp_date_end, user_id
            )
            cpp_adset_data = get_cpp_from_insights(
                ad_account_id, access_token, "adset", cpp_date_start, cpp_date_end, user_id
            )

        # Fetch Campaign & Adset data
        campaign_url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns?fields=id,name,status,adsets{{id,name,status}}"
        campaigns_data = fetch_facebook_data(campaign_url, access_token)

        if "error" in campaigns_data:
            error_msg = campaigns_data["error"].get("message", "Unknown error")
            logging.error(f"Facebook API Error: {error_msg}")
            append_redis_message_adsets(
                user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {error_msg}"
            )
            return f"Error fetching campaign data for {ad_account_id}: {error_msg}"

        for campaign in campaigns_data.get("data", []):
            campaign_id = campaign["id"]
            campaign_name = campaign["name"]
            campaign_status = campaign["status"]
            campaign_CPP = cpp_campaign_data.get(campaign_id, float('inf'))
            
            # Format campaign CPP for display
            campaign_CPP_display = f"${campaign_CPP:.2f}" if campaign_CPP != float('inf') else "No checkouts"

            # Check if campaign_name contains the campaign_code
            if campaign_code in campaign_name:
                # Add the campaign to the data structure if it matches the campaign_code
                campaign_data[campaign_id] = {
                    "campaign_name": campaign_name,
                    "STATUS": campaign_status,
                    "CPP": campaign_CPP,
                    "CPP_display": campaign_CPP_display,
                    "ADSETS": {},
                }

                # Display each campaign's CPP
                append_redis_message_adsets(
                    user_id, 
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign: {campaign_name}, CPP: {campaign_CPP_display}"
                )

                for adset in campaign.get("adsets", {}).get("data", []):
                    adset_id = adset["id"]
                    adset_name = adset["name"]
                    adset_status = adset["status"]
                    adset_CPP = cpp_adset_data.get(adset_id, float('inf'))
                    
                    # Format adset CPP for display
                    adset_CPP_display = f"${adset_CPP:.2f}" if adset_CPP != float('inf') else "No checkouts"
                    
                    campaign_data[campaign_id]["ADSETS"][adset_id] = {
                        "NAME": adset_name,
                        "STATUS": adset_status,
                        "CPP": adset_CPP,
                        "CPP_display": adset_CPP_display
                    }
                    
                    # Display each adset's CPP
                    append_redis_message_adsets(
                        user_id, 
                        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] └── Adset: {adset_name}, CPP: {adset_CPP_display}"
                    )

        logging.info(
            f"Successfully fetched campaigns for Ad Account {ad_account_id}. Data: {campaign_data}"
        )

        # Pass only the relevant campaigns (filtered by campaign_code) to the next Celery task
        process_adsets.apply_async(
            args=[user_id, ad_account_id, access_token, matched_schedule, campaign_data]
        )

        return f"Fetched campaign data for Ad Account {ad_account_id}"

    except Exception as e:
        logging.error(f"Error during campaign fetch: {e}")
        append_redis_message_adsets(
            user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error: {str(e)}"
        )
        return f"Error: {str(e)}"

    finally:
        lock.release()
        logging.info(f"Released lock for Ad Account {ad_account_id}")