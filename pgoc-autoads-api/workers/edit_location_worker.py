import json
import logging
import requests
import pytz
from datetime import datetime
from celery import shared_task

# Assuming your models and a new redis logger are accessible
from models.models import PHRegionTable, PHCityTable
from workers.on_off_functions.edit_location_message import append_redis_message_editlocation

# Constants
FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v22.0"
manila_tz = pytz.timezone("Asia/Manila")

# Logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def get_current_time():
    """Get current time in Manila timezone"""
    return datetime.now(manila_tz).strftime("%Y-%m-%d %H:%M:%S")

def get_location_keys(location_names: list[str]) -> tuple[list[dict], list[dict]]:
    """
    Queries the database to get region and city keys from a list of names.
    """
    region_keys = [{"key": str(r.region_key)} for r in PHRegionTable.query.filter(PHRegionTable.region_name.in_(location_names)).all()]
    city_keys = [{"key": str(c.city_key)} for c in PHCityTable.query.filter(PHCityTable.city_name.in_(location_names)).all()]
    logger.info(f"DB Query: Found {len(region_keys)} region keys and {len(city_keys)} city keys.")
    return region_keys, city_keys

def find_ad_set_ids_by_page_name(ad_account_id: str, page_name_input: str, access_token: str) -> list[str]:
    """
    Finds a campaign by matching the page name prefix, then returns all ad set IDs from that campaign.
    """
    # 1. Find the matching campaign
    campaigns_url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
    params = {"fields": "name", "limit": 1000, "access_token": access_token}
    normalized_page_name = page_name_input.lower().strip()
    matched_campaign_id = None

    try:
        campaigns_response = requests.get(campaigns_url, params=params)
        campaigns_response.raise_for_status()
        for campaign in campaigns_response.json().get("data", []):
            campaign_name_prefix = campaign.get("name", "").lower().split('-')[0].strip()
            if campaign_name_prefix == normalized_page_name:
                matched_campaign_id = campaign["id"]
                logger.info(f"Found matching campaign '{campaign['name']}' ({matched_campaign_id}) for page '{page_name_input}'.")
                break
        
        if not matched_campaign_id:
            logger.warning(f"No campaign found with page name prefix: '{page_name_input}'.")
            return []

        # 2. Get all ad sets from that campaign
        ad_sets_url = f"{FACEBOOK_GRAPH_URL}/{matched_campaign_id}/adsets"
        params = {"fields": "id", "limit": 1000, "access_token": access_token}
        ad_sets_response = requests.get(ad_sets_url, params=params)
        ad_sets_response.raise_for_status()
        
        ad_set_ids = [ad_set["id"] for ad_set in ad_sets_response.json().get("data", [])]
        logger.info(f"Found {len(ad_set_ids)} ad sets in campaign {matched_campaign_id}.")
        return ad_set_ids

    except requests.RequestException as e:
        logger.error(f"API Error finding ad sets by page name: {e}")
        return []

def update_ad_set_targeting(ad_set_id: str, access_token: str, targeting_payload: dict) -> bool:
    """
    Updates the targeting of a single ad set.
    """
    url = f"{FACEBOOK_GRAPH_URL}/{ad_set_id}"
    payload = {"targeting": json.dumps(targeting_payload), "access_token": access_token}
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return True
    except requests.RequestException:
        return False

@shared_task
def update_locations_by_page_name(user_id: str, ad_account_id: str, access_token: str, page_name: str, new_regions_city: list[str]) -> str:
    """
    Celery task to update locations for all ad sets in a campaign identified by its page name prefix.
    """
    start_msg = f"[{get_current_time()}] ⏳ Processing location update for page: '{page_name}'..."
    append_redis_message_editlocation(user_id, start_msg)

    # Step 1: Find all ad set IDs associated with the page name
    ad_set_ids = find_ad_set_ids_by_page_name(ad_account_id, page_name, access_token)
    if not ad_set_ids:
        error_msg = f"[{get_current_time()}] ❌ No matching campaign or ad sets found for page name '{page_name}'."
        append_redis_message_editlocation(user_id, error_msg)
        return error_msg
    
    append_redis_message_editlocation(user_id, f"[{get_current_time()}] Found {len(ad_set_ids)} ad sets to update.")

    # Step 2: Translate location names to API keys
    region_keys, city_keys = get_location_keys(new_regions_city)
    if not region_keys and not city_keys:
        error_msg = f"[{get_current_time()}] ❌ Could not find valid location keys for the names provided."
        append_redis_message_editlocation(user_id, error_msg)
        return error_msg
        
    # Step 3: Build the targeting payload once
    cities_with_radius = [{"key": c["key"], "radius": 25, "distance_unit": "mile"} for c in city_keys]
    targeting_payload = {
        "geo_locations": {"countries": ["PH"]},
        "excluded_geo_locations": {"regions": region_keys, "cities": cities_with_radius}
    }

    # Step 4: Loop through ad sets and update them
    success_count = 0
    failure_count = 0
    for ad_set_id in ad_set_ids:
        if update_ad_set_targeting(ad_set_id, access_token, targeting_payload):
            success_count += 1
            append_redis_message_editlocation(user_id, f"[{get_current_time()}]  → Successfully updated ad set {ad_set_id}")
        else:
            failure_count += 1
            append_redis_message_editlocation(user_id, f"[{get_current_time()}]  → ❌ Failed to update ad set {ad_set_id}")

    # Step 5: Final report
    final_msg = f"[{get_current_time()}] ✅ Finished. Successfully updated {success_count} ad sets. Failed to update {failure_count}."
    append_redis_message_editlocation(user_id, final_msg)
    return final_msg