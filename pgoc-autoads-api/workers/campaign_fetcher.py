import logging
import re
import redis
import pytz
import requests
import json
from celery import shared_task
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from models.models import db, CampaignsScheduled  
from workers.on_off_functions.account_message import append_redis_message
from workers.update_status import process_scheduled_campaigns

# Redis Client
redis_client = redis.StrictRedis(host="redisAds", port=6379, db=2, decode_responses=True)

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


def get_cpp_from_insights(ad_account_id, access_token, level):
    """
    Fetch CPP values from Facebook insights API.
    Returns a dictionary mapping campaign_id or adset_id to CPP values.
    """
    cpp_data = {}
    url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/insights?level={level}&fields={level}_id,actions,spend"

    while url:
        response_data = fetch_facebook_data(url, access_token)
        if "error" in response_data:
            logging.error(f"Error fetching {level} insights: {response_data['error'].get('message', 'Unknown error')}")
            break

        for item in response_data.get("data", []):
            entity_id = item.get(f"{level}_id")
            spend = float(item.get("spend", 0))

            actions = {action["action_type"]: float(action["value"]) for action in item.get("actions", [])}
            initiate_checkout_value = actions.get("onsite_conversion.initiate_checkout", actions.get("omni_initiated_checkout", 0))

            cpp_data[entity_id] = spend / initiate_checkout_value if initiate_checkout_value > 0 else 0

        url = response_data.get("paging", {}).get("next")  # Pagination

    return cpp_data


@shared_task
def fetch_campaign(user_id, ad_account_id, access_token, matched_schedule):
    """Fetch campaigns for an ad account and store structured data in CampaignsScheduled."""
    lock_key = f"lock:fetch_campaign:{ad_account_id}"
    lock = redis_client.lock(lock_key, timeout=300)
    pending_schedules_key = f"pending_schedules:{ad_account_id}"

    logging.info(f"Schedule Data: {matched_schedule}")

    append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fetching Campaign Data for {ad_account_id} schedule {matched_schedule}")

    if not lock.acquire(blocking=False):
        logging.info(f"Fetch campaign already running for {ad_account_id}. Adding to queue...")
        redis_client.rpush(pending_schedules_key, json.dumps(matched_schedule))
        return f"Fetch already in progress for {ad_account_id}, queued process_scheduled_campaigns"

    try:
        test_campaigns, regular_campaigns = {}, {}

        # Fetch Campaign & Adset data in one API call
        campaign_url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns?fields=id,name,status,adsets{{id,name,status}}"
        campaigns_data = fetch_facebook_data(campaign_url, access_token)

        if "error" in campaigns_data:
            error_msg = campaigns_data["error"].get("message", "Unknown error")
            logging.error(f"Facebook API Error: {error_msg}")
            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {error_msg}")
            return f"Error fetching campaign data for {ad_account_id}: {error_msg}"

        # Fetch CPP data before processing campaigns
        cpp_campaign_data = get_cpp_from_insights(ad_account_id, access_token, "campaign")
        cpp_adset_data = get_cpp_from_insights(ad_account_id, access_token, "adset")

        for campaign in campaigns_data.get("data", []):
            campaign_id = campaign["id"]
            campaign_name = campaign["name"]
            campaign_status = campaign["status"]
            campaign_CPP = cpp_campaign_data.get(campaign_id, 0)

            target_dict = test_campaigns if contains_test(campaign_name) else regular_campaigns if contains_regular(campaign_name) else None

            if target_dict is not None:
                target_dict[campaign_id] = {
                    "campaign_name": campaign_name,
                    "STATUS": campaign_status,
                    "CPP": campaign_CPP,
                    "ADSETS": {
                        adset["id"]: {
                            "NAME": adset["name"],
                            "STATUS": adset["status"],
                            "CPP": cpp_adset_data.get(adset["id"], 0),
                        }
                        for adset in campaign.get("adsets", {}).get("data", [])
                    },
                }

        # Update database
        campaign_entry = CampaignsScheduled.query.filter_by(ad_account_id=ad_account_id).first()

        if not campaign_entry:
            campaign_entry = CampaignsScheduled(
                ad_account_id=ad_account_id,
                test_campaign_data={},
                regular_campaign_data={},
                last_time_checked=datetime.now(),
                last_check_status="Ongoing",
                last_check_message=f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaigns saved successfully."
            )
            db.session.add(campaign_entry)

        campaign_entry.test_campaign_data = test_campaigns
        campaign_entry.regular_campaign_data = regular_campaigns
        campaign_entry.last_time_checked = datetime.now()
        campaign_entry.last_check_status = "Success"
        campaign_entry.last_check_message = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign data updated."

        flag_modified(campaign_entry, "test_campaign_data")
        flag_modified(campaign_entry, "regular_campaign_data")
        db.session.commit()

        logging.info(f"Successfully fetched and saved campaigns for Ad Account {ad_account_id}")
        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaigns updated successfully.")

        process_scheduled_campaigns.apply_async(args=[user_id, ad_account_id, access_token, matched_schedule])

        return f"Fetched campaign data for Ad Account {ad_account_id}"

    except Exception as e:
        logging.error(f"Error during campaign fetch: {e}")
        return f"Error: {str(e)}"

    finally:
        lock.release()
        logging.info(f"Released lock for Ad Account {ad_account_id}")
