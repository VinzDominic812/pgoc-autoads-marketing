import logging
import requests
import time
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

def fetch_entity_status(entity_id, access_token):
    """Fetch the current status of an entity from Facebook."""
    url = f"{FACEBOOK_GRAPH_URL}/{entity_id}?fields=status"
    try:
        response = requests.get(
            url, 
            headers={"Authorization": f"Bearer {access_token}"}, 
            timeout=10  # Increased timeout
        )
        response.raise_for_status()
        data = response.json()
        return data.get("status")
    except Exception as e:
        logging.error(f"Error fetching status for {entity_id}: {e}")
        return None

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

def update_facebook_status_with_retry(user_id, ad_account_id, entity_id, entity_name, new_status, access_token, max_retries=2):
    """Update Facebook entity status with retry logic and verification."""
    for attempt in range(max_retries + 1):  # +1 for the initial attempt
        if attempt > 0:
            # Log that we're retrying
            append_redis_message_adsets(
                user_id,
                f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Retry #{attempt} updating {entity_name} ({entity_id}) to {new_status}"
            )
        
        # Attempt the update
        success = update_facebook_status(user_id, ad_account_id, entity_id, new_status, access_token)
        
        if success:
            # Verify the status change
            time.sleep(1)  # Short delay to allow Facebook to process the change
            current_status = fetch_entity_status(entity_id, access_token)
            
            if current_status == new_status:
                append_redis_message_adsets(
                    user_id,
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Verified {entity_name} is now {new_status}"
                )
                return True
            else:
                logging.warning(
                    f"Status mismatch for {entity_id}: Expected {new_status}, got {current_status}"
                )
                append_redis_message_adsets(
                    user_id,
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Warning: {entity_name} status mismatch - Expected {new_status}, got {current_status}"
                )
        
        # If we're not on the last attempt, wait before retrying
        if attempt < max_retries:
            # Exponential backoff (2^attempt seconds)
            wait_time = 2 ** attempt
            time.sleep(wait_time)
    
    # If we get here, all retries failed
    append_redis_message_adsets(
        user_id,
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Failed to update {entity_name} to {new_status} after {max_retries + 1} attempts"
    )
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
        append_redis_message_adsets(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting adset processing - Campaign Code: {campaign_code}, CPP Metric: {cpp_metric}, Mode: {on_off}"
        )

        # Determine new status for adsets
        new_status = "ACTIVE" if on_off == "ON" else "PAUSED"

        if not campaigns_data:
            logging.warning(f"No campaigns data received for processing in Ad Account {ad_account_id}")
            append_redis_message_adsets(
                user_id,
                f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] No campaigns found for processing in Ad Account {ad_account_id}"
            )
            return f"No campaigns found for processing in Ad Account {ad_account_id}"

        update_success = False
        campaigns_processed = 0
        adsets_processed = 0
        adsets_updated = 0

        # Loop through each campaign in campaigns_data
        for campaign_id, campaign_info in campaigns_data.items():
            campaign_name = campaign_info.get("campaign_name", "")

            # ✅ Match by campaign code as a substring instead of strict suffix
            if campaign_code.lower() not in campaign_name.lower():
                logging.info(f"Skipping campaign {campaign_name} - doesn't contain {campaign_code}")
                continue  # Skip this campaign if it does not contain the campaign code

            campaigns_processed += 1
            adsets = campaign_info.get("ADSETS", {})
            
            logging.info(f"Processing campaign: {campaign_name} with {len(adsets)} adsets")
            append_redis_message_adsets(
                user_id,
                f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campaign: {campaign_name} - Found {len(adsets)} adsets"
            )

            # Track ad sets that couldn't be updated
            failed_updates = []

            for adset_id, adset_info in adsets.items():
                adset_cpp = adset_info.get("CPP", 0)
                adset_status = adset_info.get("STATUS", "")
                adset_name = adset_info.get("NAME", "Unknown")
                adsets_processed += 1

                # ✅ Log before evaluation
                logging.info(
                    f"Evaluating AdSet: {adset_name} ({adset_id}) | CPP: {adset_cpp} | "
                    f"Current: {adset_status} | Target: {new_status} | CPP Metric: {cpp_metric}"
                )

                # Check for infinite CPP values and handle them properly
                if adset_cpp == float('inf'):
                    adset_cpp_str = "No checkouts (infinite)"
                    # For 'ON' mode, we shouldn't turn on ad sets with no checkouts
                    if on_off == "ON":
                        should_update = False
                        reason = "No checkouts recorded"
                    else:  # For 'OFF' mode, treat as exceeding CPP threshold
                        should_update = True
                        reason = "No checkouts - treat as high CPP"
                # ✅ If CPP is zero or None, maintain current status (no change)
                elif adset_cpp == 0 or adset_cpp is None:
                    should_update = False
                    reason = "CPP is zero or None - insufficient data"
                    adset_cpp_str = "0 or None"
                # ✅ Determine if status update is needed based on CPP comparison
                else:
                    adset_cpp_str = f"${adset_cpp:.2f}"
                    if on_off == "ON":
                        # For ON command: Turn on adsets with CPP < cpp_metric
                        should_update = adset_cpp < cpp_metric
                        reason = f"CPP {adset_cpp_str} is " + ("below" if should_update else "above") + f" threshold (${cpp_metric})"
                    else:  # on_off == "OFF"
                        # For OFF command: Turn off adsets with CPP >= cpp_metric
                        should_update = adset_cpp >= cpp_metric
                        reason = f"CPP {adset_cpp_str} is " + ("above/equal to" if should_update else "below") + f" threshold (${cpp_metric})"

                # Log the evaluation
                append_redis_message_adsets(
                    user_id,
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Evaluating AdSet {adset_name} | CPP: {adset_cpp_str} | Current: {adset_status} | Reason: {reason}"
                )

                # Only update if current status is different from target status
                if should_update and adset_status != new_status:
                    logging.info(f"📢 Updating AdSet {adset_name} from {adset_status} to {new_status}")
                    append_redis_message_adsets(
                        user_id,
                        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Setting AdSet {adset_name} to {new_status} (Current CPP: {adset_cpp_str})"
                    )
                    
                    # Use the new retry function
                    success = update_facebook_status_with_retry(
                        user_id, ad_account_id, adset_id, adset_name, new_status, access_token
                    )
                    
                    if success:
                        adset_info["STATUS"] = new_status
                        update_success = True
                        adsets_updated += 1
                        append_redis_message_adsets(
                            user_id,
                            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ✅ Successfully updated AdSet {adset_name} to {new_status}"
                        )
                        logging.info(f"✅ Updated {adset_name} to {new_status}")
                    else:
                        failed_updates.append(adset_name)
                else:
                    if not should_update:
                        skip_reason = "CPP criteria not met"
                    else:
                        skip_reason = f"already in target state ({adset_status})"
                    
                    append_redis_message_adsets(
                        user_id,
                        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] AdSet {adset_name} remains {adset_status} - {skip_reason}"
                    )
                    logging.info(f"⏭ Skipped update for {adset_name}; {skip_reason}")

            # Report any failed updates for this campaign
            if failed_updates:
                append_redis_message_adsets(
                    user_id,
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ⚠️ Failed to update the following ad sets in campaign {campaign_name}: {', '.join(failed_updates)}"
                )

        # Summary message
        summary = (
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] "
            f"Summary: Processed {campaigns_processed} campaigns with {adsets_processed} adsets. "
            f"Updated {adsets_updated} adsets."
        )
        
        append_redis_message_adsets(user_id, summary)
        logging.info(summary)
        
        # Update database if needed with the new status information
        if update_success:
            campaign_entry = CampaignsScheduled.query.filter_by(ad_account_id=ad_account_id).first()
            if campaign_entry:
                # Store the updated campaign data
                campaign_entry.matched_campaign_data = campaigns_data
                flag_modified(campaign_entry, "matched_campaign_data")
                campaign_entry.last_time_checked = datetime.now(manila_tz)
                campaign_entry.last_check_status = "Success"
                campaign_entry.last_check_message = (
                    f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] "
                    f"Successfully updated {adsets_updated} adsets across {campaigns_processed} campaigns."
                )
                db.session.commit()
                logging.info(f"Updated database with new adset statuses for {ad_account_id}")

        return f"Processing {ad_account_id} completed - {adsets_updated}/{adsets_processed} adsets updated across {campaigns_processed} campaigns"

    except Exception as e:
        logging.error(f"Error processing schedule: {e}")
        append_redis_message_adsets(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ❌ Error processing schedule: {e}"
        )
        
        # Update database with error information
        try:
            campaign_entry = CampaignsScheduled.query.filter_by(ad_account_id=ad_account_id).first()
            if campaign_entry:
                campaign_entry.last_check_status = "Failed"
                campaign_entry.last_check_message = (
                    f"[{datetime.now(manila_tz).strftime('%Y-%m-%d %H:%M:%S')}] Error: {e}"
                )
                db.session.commit()
        except Exception as db_error:
            logging.error(f"Error updating database with failure status: {db_error}")
            
        return f"Error processing schedule: {e}"