import logging
import requests
from celery import shared_task
from models.models import db, CampaignsScheduled
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from pytz import timezone

from workers.on_off_functions.account_message import append_redis_message
from workers.on_off_functions.on_off_adsets import append_redis_message_adsets

# Manila timezone
manila_tz = timezone("Asia/Manila")

# Facebook API constants
FACEBOOK_API_VERSION = "v22.0"
FACEBOOK_GRAPH_URL = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}"

def update_facebook_status(user_id, ad_account_id, entity_id, new_status, access_token):
    """Update the status of a Facebook campaign or ad set using the Graph API."""
    url = f"{FACEBOOK_GRAPH_URL}/{entity_id}"
    payload = {"status": new_status}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        logging.info(f"Successfully updated {entity_id} to {new_status}")
        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Successfully updated {entity_id} to {new_status}")
        return True
    except requests.exceptions.RequestException as e:
        logging.error(f"Error updating {entity_id} to {new_status}: {e}")
        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error updating {entity_id} to {new_status}: {e}")
        return False

# def extract_campaign_code(campaign_name):
#     # Assuming campaign_code is part of the campaign_name (e.g., "Campaign XYZ-12345")
#     # You can adapt the logic here depending on how the campaign_code is embedded in the name
#     """Extract campaign_code from the campaign_name. Assuming the campaign_code is a part of the name."""
#     parts = campaign_name.split("-")  # Split by some delimiter like "-"
#     if len(parts) > 1:
#         return parts[-1].strip()  # Assuming the campaign_code is the last part
#     return None  # Return None if no campaign_code is found

def extract_campaign_code_from_db(campaign_entry):
    """
    Fetch the campaign_code directly from the database.
    """
    return campaign_entry.campaign_code

@shared_task
@shared_task
def process_scheduled_campaigns(user_id, ad_account_id, access_token, schedule_data):
    try:
        logging.info(f"Processing schedule: {schedule_data}")

        campaign_code = schedule_data["campaign_code"]
        watch = schedule_data["watch"]
        cpp_metric = int(schedule_data.get("cpp_metric", 0))
        on_off = schedule_data["on_off"]

        campaign_entry = CampaignsScheduled.query.filter_by(ad_account_id=ad_account_id).first()
        if not campaign_entry:
            logging.warning(f"No campaign data found for Ad Account {ad_account_id}")
            return f"No campaign data found for Ad Account {ad_account_id}"

        # Use the pre-matched campaigns
        campaign_data = campaign_entry.matched_campaign_data or {}

        if not campaign_data:
            logging.warning(f"No matched campaign data found for Ad Account {ad_account_id}")
            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] No matched campaign data found.")
            return f"No matched campaign data found for Ad Account {ad_account_id}"

        update_success = False
        if watch == "Campaigns":
            for campaign_id, campaign_info in campaign_data.items():
                current_status = campaign_info.get("STATUS", "")
                campaign_cpp = campaign_info.get("CPP", 0)
                campaign_name = campaign_info.get("campaign_name", "")

                # Decide whether to turn ON or OFF
                if on_off == "ON" and campaign_cpp < cpp_metric:
                    new_status = "ACTIVE"
                elif on_off == "OFF" and campaign_cpp >= cpp_metric:
                    new_status = "PAUSED"
                else:
                    logging.info(f"Campaign {campaign_id} remains {current_status}")
                    append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign {campaign_name} ID: {campaign_id} remains {current_status}")
                    continue

                if current_status != new_status:
                    success = update_facebook_status(user_id, ad_account_id, campaign_id, new_status, access_token)
                    if success:
                        campaign_info["STATUS"] = new_status
                        update_success = True
                        logging.info(f"Updated Campaign {campaign_id} -> {new_status}")
                        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated Campaign {campaign_name} ID: {campaign_id} -> {new_status}")

        if update_success:
            campaign_entry.matched_campaign_data = campaign_data
            flag_modified(campaign_entry, "matched_campaign_data")
            campaign_entry.last_time_checked = datetime.now(manila_tz)
            campaign_entry.last_check_status = "Success"
            campaign_entry.last_check_message = (
                f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] Successfully updated {watch} statuses."
            )
            db.session.commit()
            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Successfully updated {watch} statuses.")

        return f"Processed scheduled {watch} for Ad Account {ad_account_id}"

    except Exception as e:
        logging.error(f"Error processing scheduled {watch} for Ad Account {ad_account_id}: {e}")
        if campaign_entry:
            campaign_entry.last_check_status = "Failed"
            campaign_entry.last_check_message = (
                f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] Error: {e}"
            )
            db.session.commit()
        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error processing scheduled {watch}: {e}")
        return f"Error processing scheduled {watch} for Ad Account {ad_account_id}: {e}"
    
@shared_task
def process_adsets(user_id, ad_account_id, access_token, schedule_data, campaigns_data):
    try:
        logging.info(f"Processing schedule: {schedule_data}")

        # Extract schedule parameters
        campaign_code = schedule_data["campaign_code"]
        cpp_metric = int(schedule_data.get("cpp_metric", 0))
        on_off = schedule_data["on_off"].upper()  # "ON" or "OFF"

        logging.info(f"Campaign Code: {campaign_code}, CPP Metric: {cpp_metric}, On/Off: {on_off}")

        # Determine new status for adsets
        new_status = "ACTIVE" if on_off == "ON" else "PAUSED"

        if not campaigns_data:
            logging.warning(f"No campaigns data received for processing in Ad Account {ad_account_id}")
            return f"No campaigns found for processing in Ad Account {ad_account_id}"

        update_success = False

        # Loop through each campaign in campaigns_data
        for campaign_id, campaign_info in campaigns_data.items():
            campaign_name = campaign_info.get("campaign_name", "")
            
            # Only process campaigns whose name contains the campaign_code
            if campaign_code not in campaign_name:
                continue  # Skip this campaign if the code is not in the name

            adsets = campaign_info.get("ADSETS", {})

            for adset_id, adset_info in adsets.items():
                adset_cpp = adset_info.get("CPP", 0)
                adset_status = adset_info.get("STATUS", "")
                adset_name = adset_info.get("NAME", "Unknown")

                # Determine if we need to update the AdSet status based on CPP metric
                should_update = (on_off == "ON" and adset_cpp < cpp_metric) or (on_off == "OFF" and adset_cpp >= cpp_metric)

                if should_update and adset_status != new_status:
                    success = update_facebook_status(user_id, ad_account_id, adset_id, new_status, access_token)
                    if success:
                        adset_info["STATUS"] = new_status
                        update_success = True
                        append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated AdSet {adset_name} ({adset_id}) to {new_status}")
                else:
                    append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] AdSet {adset_name} ({adset_id}) remains {adset_status}")

        if update_success:
            append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing {ad_account_id} completed")

        return f"Processing {ad_account_id} completed"

    except Exception as e:
        logging.error(f"Error processing schedule: {e}")
        append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error processing schedule: {e}")
        return f"Error processing schedule: {e}"
