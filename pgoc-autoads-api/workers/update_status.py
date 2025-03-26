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

@shared_task
def process_scheduled_campaigns(user_id, ad_account_id, access_token, schedule_data):
    """
    Process scheduled campaign updates based on `schedule_data`.
    """
    try:
        logging.info(f"Processing schedule: {schedule_data}")

        # Extract schedule parameters
        campaign_type = schedule_data["campaign_type"]
        what_to_watch = schedule_data["what_to_watch"]
        cpp_metric = int(schedule_data.get("cpp_metric"))  # Ensure conversion to int
        on_off = schedule_data["on_off"]

        # Fetch campaign data from the database
        campaign_entry = CampaignsScheduled.query.filter_by(ad_account_id=ad_account_id).first()
        if not campaign_entry:
            logging.warning(f"No campaign data found for Ad Account {ad_account_id}")
            campaign_entry.last_time_checked = datetime.now(manila_tz)
            campaign_entry.last_check_status = "Success"
            campaign_entry.last_check_message = (
                f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] "
                f"No campaign data found for Ad Account {ad_account_id}"
            )
            return f"No campaign data found for Ad Account {ad_account_id}"

        # Select the correct dataset based on campaign type
        campaign_data = (
            campaign_entry.regular_campaign_data if campaign_type == "REGULAR"
            else campaign_entry.test_campaign_data
        )

        if not campaign_data:
            logging.warning(f"No {campaign_type} campaigns available for processing.")
            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] No {campaign_type} campaigns available for processing.")
            return f"No {campaign_type} campaigns available for processing."

        update_success = False  # Track if any updates are successful

        if what_to_watch == "Campaigns":
            for campaign_id, campaign_info in campaign_data.items():
                current_status = campaign_info["STATUS"]
                campaign_cpp = campaign_info["CPP"]
                campaign_name = campaign_info["campaign_name"]

                # Determine the new status based on the CPP metric
                if on_off == "ON" and campaign_cpp < cpp_metric:
                    new_status = "ACTIVE"
                elif on_off == "OFF" and campaign_cpp >= cpp_metric:
                    new_status = "PAUSED"
                else:
                    logging.info(f"Campaign {campaign_id} remains {current_status}")
                    append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign {campaign_name} ID: {campaign_id}  Remains {current_status}")
                    continue  # Skip if no change is needed

                if current_status != new_status:
                    success = update_facebook_status(user_id, ad_account_id, campaign_id, new_status, access_token)
                    if success:
                        campaign_info["STATUS"] = new_status
                        update_success = True
                        logging.info(f"Updated Campaign {campaign_id} -> {new_status}")
                        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated Campaign {campaign_name} ID: {campaign_id}  -> {new_status}")

        elif what_to_watch == "AdSets":
            for campaign_id, campaign_info in campaign_data.items():
                adsets = campaign_info.get("ADSETS", {})  # Get AdSets dictionary

                for adset_id, adset_info in adsets.items():
                    current_status = adset_info["STATUS"]
                    adset_cpp = adset_info["CPP"]
                    adset_name = adset_info["NAME"]

                    # Determine the new status based on the CPP metric
                    if on_off == "ON" and adset_cpp < cpp_metric:
                        new_status = "ACTIVE"
                    elif on_off == "OFF" and adset_cpp >= cpp_metric:
                        new_status = "PAUSED"
                    else:
                        logging.info(f"AdSet {adset_id} remains {current_status}")
                        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Adset {adset_name} ID: {adset_id}  Remains {current_status}")
                        continue  

                    if current_status != new_status:
                        success = update_facebook_status(user_id, ad_account_id, adset_id, new_status, access_token)
                        if success:
                            adset_info["STATUS"] = new_status
                            update_success = True
                            logging.info(f"Updated AdSet {adset_id} -> {new_status}")
                            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated {adset_name} ID: {adset_id}  -> {new_status}")

        if update_success:
            if campaign_type == "REGULAR":
                campaign_entry.regular_campaign_data = campaign_data
                flag_modified(campaign_entry, "regular_campaign_data")
            else:
                campaign_entry.test_campaign_data = campaign_data
                flag_modified(campaign_entry, "test_campaign_data")

            campaign_entry.last_time_checked = datetime.now(manila_tz)
            campaign_entry.last_check_status = "Success"
            campaign_entry.last_check_message = (
                f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] "
                f"Successfully updated {what_to_watch} statuses."
            )

            db.session.commit()
            logging.info(f"Successfully saved updated {what_to_watch} statuses in DB.")
            append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Successfully updated {what_to_watch} statuses.")

        return f"Processed scheduled {what_to_watch} for Ad Account {ad_account_id}"

    except Exception as e:
        logging.error(f"Error processing scheduled {what_to_watch} for Ad Account {ad_account_id}: {e}")
        campaign_entry.last_check_status = "Failed"
        campaign_entry.last_check_message = (
                f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] "
                f"Error processing scheduled {what_to_watch} for Ad Account {ad_account_id}: {e}"
            )
        db.session.commit()
        append_redis_message(user_id, ad_account_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error processing scheduled {what_to_watch} for Ad Account {ad_account_id}: {e}")
        return f"Error processing scheduled {what_to_watch} for Ad Account {ad_account_id}: {e}"
    
@shared_task
def process_adsets(user_id, ad_account_id, access_token, schedule_data, campaigns_data):
    try:
        logging.info(f"Processing schedule: {schedule_data}")

        # Extract schedule parameters
        campaign_type = schedule_data.get("campaign_type", "").lower()  # "test" or "regular"
        what_to_watch = schedule_data.get("what_to_watch", "").lower()  # "campaigns" or "adsets"
        cpp_metric = int(schedule_data.get("cpp_metric", 0))  # Ensure it's an integer
        on_off = schedule_data.get("on_off", "").upper()  # "ON" or "OFF"

        logging.info(f"Campaign Type: {campaign_type}, Watch: {what_to_watch}, CPP Metric: {cpp_metric}, On/Off: {on_off}")

        # Determine new status
        new_status = "ACTIVE" if on_off == "ON" else "PAUSED"

        if not campaigns_data:
            logging.warning(f"No campaigns data received for processing in {campaign_type}")
            return f"No campaigns found for {campaign_type} in Ad Account {ad_account_id}"

        for campaign_id, campaign_info in campaigns_data.items():
            campaign_name = campaign_info.get("campaign_name", "Unknown")
            campaign_cpp = campaign_info.get("CPP", 0)
            campaign_status = campaign_info.get("STATUS", "")

            if what_to_watch == "campaigns":
                # Check if campaign meets CPP condition
                if (on_off == "ON" and campaign_cpp < cpp_metric) or (on_off == "OFF" and campaign_cpp >= cpp_metric):
                    if campaign_status != new_status:
                        success = update_facebook_status(user_id, ad_account_id, campaign_id, new_status, access_token)
                        if success:
                            logging.info(f"Updated Campaign {campaign_name} ({campaign_id}) to {new_status}")
                            append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated Campaign {campaign_name} ({campaign_id}) to {new_status}")
                    else:
                        logging.info(f"Campaign {campaign_name} ({campaign_id}) already in {new_status} status")
                        append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign {campaign_name} ({campaign_id}) already in {new_status} status")

            elif what_to_watch == "adsets":
                for adset_id, adset_info in campaign_info.get("ADSETS", {}).items():
                    adset_name = adset_info.get("NAME", "Unknown")
                    adset_cpp = adset_info.get("CPP", 0)
                    adset_status = adset_info.get("STATUS", "")

                    if (on_off == "ON" and adset_cpp < cpp_metric) or (on_off == "OFF" and adset_cpp >= cpp_metric):
                        if adset_status != new_status:
                            success = update_facebook_status(user_id, ad_account_id, adset_id, new_status, access_token)
                            if success:
                                logging.info(f"Updated AdSet {adset_name} ({adset_id}) to {new_status}")
                                append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated AdSet {adset_name} ({adset_id}) to {new_status}")
                        else:
                            logging.info(f"AdSet {adset_name} ({adset_id}) already in {new_status} status")
                            append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] AdSet {adset_name} ({adset_id}) already in {new_status} status")
        
        append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing {ad_account_id} Completed")
        return f"Processing {ad_account_id} Completed"

    except Exception as e:
        logging.error(f"Error processing schedule: {e}")
        append_redis_message_adsets(user_id, f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error processing schedule: {e}")
        return f"Error processing schedule: {e}"
