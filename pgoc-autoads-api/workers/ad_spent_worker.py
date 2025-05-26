import json
import logging
import re
import time
import pytz
import redis
import requests
from collections import defaultdict
from celery import shared_task
from datetime import datetime
from workers.on_off_functions.ad_spent_message import append_redis_message_adspent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis client
redis_client_asr = redis.Redis(
    host="redisAds",
    port=6379,
    db=9,
    decode_responses=True
)

# Constants
FACEBOOK_API_VERSION = "v22.0"
FACEBOOK_GRAPH_URL = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}"
NON_ALPHANUMERIC_REGEX = re.compile(r'[^a-zA-Z0-9]+')
manila_tz = pytz.timezone("Asia/Manila")

def normalize_name(name):
    return NON_ALPHANUMERIC_REGEX.sub(' ', name).lower().strip()

def normalize_text(text):
    return NON_ALPHANUMERIC_REGEX.sub(' ', text).lower().split()

def fetch_facebook_data(url, access_token, params=None):
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        logging.debug(f"Facebook API Response for {url}: {data}")
        if "error" in data:
            logging.error(f"Facebook API Error for {url}: {data['error']}")
            return {"error": data["error"]}
        return data
    except requests.exceptions.RequestException as e:
        logging.error(f"RequestException for {url}: {e}")
        return {"error": {"message": str(e), "type": "RequestException"}}
    except json.JSONDecodeError as e:
        logging.error(f"JSONDecodeError for {url}: {e}")
        return {"error": {"message": "Invalid JSON response", "type": "JSONDecodeError"}}

def get_facebook_user_info(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me?fields=id,name"
    data = fetch_facebook_data(url, access_token)
    if data and "id" in data and "name" in data:
        return {"id": data["id"], "name": data["name"]}
    return None

def process_paginated_results(url, access_token, process_func):
    results = []
    while url:
        data = fetch_facebook_data(url, access_token)
        if "data" in data:
            results.extend(process_func(data["data"]))
        url = data.get("paging", {}).get("next")
    return results

def get_ad_accounts(access_token):
    logger.info("Fetching ad accounts...")
    url = f"{FACEBOOK_GRAPH_URL}/me/adaccounts?fields=id,name&limit=1000"
    accounts = process_paginated_results(url, access_token, lambda data: [acc["id"].replace("act_", "") for acc in data])
    logger.info(f"Found {len(accounts)} ad accounts")
    return accounts

def get_campaigns(access_token, ad_account_id):
    logger.info(f"Fetching campaigns for ad account {ad_account_id}...")
    url = (
        f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/campaigns"
        f"?fields=id,name,status,daily_budget,budget_remaining&limit=1000"
    )
    campaigns = process_paginated_results(url, access_token, lambda data: data)
    logger.info(f"Found {len(campaigns)} campaigns")
    return campaigns

def get_campaign_spend_by_account(access_token, ad_account_id):
    logger.info(f"Fetching campaign spend for ad account {ad_account_id}...")
    url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/insights"
    params = {
        "fields": "campaign_id,campaign_name,spend",
        "level": "campaign",
        "date_preset": "today",
        "limit": 1000
    }

    data = fetch_facebook_data(url, access_token, params=params)
    if "error" in data:
        return {}

    campaign_spends = {}
    for item in data.get("data", []):
        campaign_spends[item["campaign_id"]] = item.get("spend", "0")

    return campaign_spends

def determine_delivery_status(campaign_status, ad_effective_statuses):
    """
    Determine delivery status based on campaign status and ad effective statuses.
    
    DELIVERY STATUS = ACTIVE
        CAMPAIGN = ACTIVE
        ADS EFFECTIVE_STATUS = ADSET_PAUSED & ACTIVE, or ALL ACTIVE
    
    DELIVERY STATUS = INACTIVE
        CAMPAIGN = ACTIVE or PAUSED
        ADS EFFECTIVE_STATUS = ADSET_PAUSED, CAMPAIGN_PAUSED, PAUSED, CAMPAIGN_GROUP_PAUSED, ARCHIVED, DELETED
    
    DELIVERY STATUS = NOT_DELIVERING
        CAMPAIGN = ACTIVE
        ADS EFFECTIVE_STATUS = ADSET_PAUSED, DISAPPROVED, PENDING_REVIEW, PREAPPROVED, PENDING_BILLING_INFO, WITH_ISSUES
    """
    campaign_status = campaign_status.upper() if campaign_status else ""
    ad_statuses = [status.upper() if status else "" for status in ad_effective_statuses]
    
    # If no ads, return INACTIVE
    if not ad_statuses:
        return "INACTIVE"
    
    # Define status categories
    ACTIVE_STATUSES = {"ACTIVE"}
    INACTIVE_STATUSES = {
        "ADSET_PAUSED", "CAMPAIGN_PAUSED", "PAUSED", 
        "CAMPAIGN_GROUP_PAUSED", "ARCHIVED", "DELETED"
    }
    NOT_DELIVERING_STATUSES = {
        "ADSET_PAUSED", "DISAPPROVED", "PENDING_REVIEW", 
        "PREAPPROVED", "PENDING_BILLING_INFO", "WITH_ISSUES"
    }
    
    # Count status types
    active_count = sum(1 for status in ad_statuses if status in ACTIVE_STATUSES)
    inactive_count = sum(1 for status in ad_statuses if status in INACTIVE_STATUSES)
    not_delivering_count = sum(1 for status in ad_statuses if status in NOT_DELIVERING_STATUSES)
    
    # DELIVERY STATUS = ACTIVE
    # CAMPAIGN = ACTIVE and (ADS = ALL ACTIVE or ADS = ADSET_PAUSED & ACTIVE)
    if campaign_status == "ACTIVE":
        # All ads are ACTIVE
        if active_count == len(ad_statuses):
            return "ACTIVE"
        
        # Mixed: Some ACTIVE and some ADSET_PAUSED (but no other statuses)
        adset_paused_count = sum(1 for status in ad_statuses if status == "ADSET_PAUSED")
        if active_count > 0 and adset_paused_count > 0 and (active_count + adset_paused_count) == len(ad_statuses):
            return "ACTIVE"
    
    # DELIVERY STATUS = NOT_DELIVERING
    # CAMPAIGN = ACTIVE and ADS have NOT_DELIVERING statuses (including ADSET_PAUSED)
    if campaign_status == "ACTIVE":
        # Check if any ads have NOT_DELIVERING statuses
        if any(status in NOT_DELIVERING_STATUSES for status in ad_statuses):
            # But exclude the case where we have ACTIVE + ADSET_PAUSED only (already handled above)
            adset_paused_count = sum(1 for status in ad_statuses if status == "ADSET_PAUSED")
            if not (active_count > 0 and adset_paused_count > 0 and (active_count + adset_paused_count) == len(ad_statuses)):
                return "NOT_DELIVERING"
    
    # DELIVERY STATUS = INACTIVE
    # CAMPAIGN = ACTIVE or PAUSED, and ADS have INACTIVE statuses
    # OR any other case not covered above
    return "INACTIVE"

def map_delivery_status(delivery, effective_status):
    delivery = delivery.upper() if delivery else ""
    effective_status = effective_status.upper() if effective_status else ""

    if delivery == "DELIVERING":
        return "ACTIVE"

    if delivery in ["NOT_DELIVERING", "PENDING_REVIEW"] or effective_status in [
        "PAUSED",
        "CAMPAIGN_PAUSED",
        "ADSET_PAUSED",
        "NO_BUDGET",
        "DISAPPROVED",
    ]:
        return "NOT_DELIVERING"

    if effective_status in ["INACTIVE", "PAUSED", "DELETED", "ARCHIVED"]:
        return "INACTIVE"

    return "INACTIVE"  # Default fallback

@shared_task
def fetch_ad_spend_data(user_id, access_token):
    try:
        logger.info("Starting ad spend data fetch task")

        user_info = get_facebook_user_info(access_token)
        if not user_info:
            logger.error("Failed to get user info")
            return {"error": "Failed to get user info"}

        ad_accounts = get_ad_accounts(access_token)
        if not ad_accounts:
            logger.error("No ad accounts found")
            return {"error": "No ad accounts found"}

        logger.info(f"User ID: {user_info['id']} - Found {len(ad_accounts)} ad accounts")

        result = {
            'user_id': user_info['id'],
            'user_name': user_info['name'],
            'timestamp': datetime.now(manila_tz).isoformat(),
            'summary': {
                'total_spend': 0.0,
                'total_active_campaigns': 0,
                'total_active_spend': 0.0,
                'total_active_daily_budget': 0.0
            },
            'campaigns': []
        }

        from concurrent.futures import ThreadPoolExecutor, as_completed
        import math

        batch_size = 5
        total_accounts = len(ad_accounts)
        total_batches = math.ceil(total_accounts / batch_size)

        append_redis_message_adspent(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing {total_accounts} ad accounts in {total_batches} batches..."
        )

        def process_account(ad_account_id):
            
            try:
                campaigns = get_campaigns(access_token, ad_account_id)

                # Fetch adsets with nested ads
                url = f"{FACEBOOK_GRAPH_URL}/act_{ad_account_id}/adsets"
                params = {
                    "fields": "id,name,campaign_id,status,ads{effective_status}",
                    "limit": 1000
                }
                adsets_response = fetch_facebook_data(url, access_token, params)
                adsets = adsets_response.get("data", []) if "data" in adsets_response else []

                adsets_by_campaign = defaultdict(list)
                for adset in adsets:
                    adsets_by_campaign[adset["campaign_id"]].append(adset)

                campaign_spends = get_campaign_spend_by_account(access_token, ad_account_id)

                account_spend = 0.0
                total_active_campaigns = 0
                total_active_spend = 0.0
                total_active_daily_budget = 0.0
                all_campaigns = []

                for campaign in campaigns:
                    campaign_id = campaign['id']
                    spend = campaign_spends.get(campaign_id, "0")
                    spend_float = float(spend)
                    account_spend += spend_float

                    daily_budget = float(campaign.get('daily_budget', '0')) / 100
                    budget_remaining = float(campaign.get('budget_remaining', '0')) / 100
                    campaign_status = campaign.get('status', '').upper()

                    # Get all ad effective statuses under this campaign
                    ad_effective_statuses = []
                    for adset in adsets_by_campaign.get(campaign_id, []):
                        ads = adset.get("ads", {}).get("data", [])
                        for ad in ads:
                            ad_status = ad.get("effective_status", "")
                            if ad_status:
                                ad_effective_statuses.append(ad_status)

                    # Determine delivery status using the updated logic
                    delivery_status = determine_delivery_status(campaign_status, ad_effective_statuses)

                    # Prepare campaign data
                    campaign_data = {
                        'campaign_id': campaign_id,
                        'campaign_name': campaign['name'],
                        'status': campaign_status,
                        'daily_budget': daily_budget,
                        'budget_remaining': budget_remaining,
                        'spend': spend_float,
                        'ad_account_id': ad_account_id,
                        'delivery_status': delivery_status,
                        'ad_statuses_summary': {
                            'total_ads': len(ad_effective_statuses),
                            'unique_statuses': list(set(ad_effective_statuses)) if ad_effective_statuses else []
                        }
                    }

                    all_campaigns.append(campaign_data)

                    if delivery_status == "ACTIVE":
                        total_active_campaigns += 1
                        total_active_spend += spend_float
                        total_active_daily_budget += daily_budget

                return {
                    'campaigns': all_campaigns,
                    'summary': {
                        'total_spend': account_spend,
                        'total_active_campaigns': total_active_campaigns,
                        'total_active_spend': total_active_spend,
                        'total_active_daily_budget': total_active_daily_budget
                    }
                }

            except Exception as e:
                logger.error(f"Error processing account {ad_account_id}: {str(e)}")
                return {
                    'campaigns': [],
                    'summary': {
                        'total_spend': 0.0,
                        'total_active_campaigns': 0,
                        'total_active_spend': 0.0,
                        'total_active_daily_budget': 0.0
                    }
                }

        campaign_index = 1

        for batch_num in range(total_batches):
            start = batch_num * batch_size
            end = start + batch_size
            batch_accounts = ad_accounts[start:end]

            append_redis_message_adspent(
                user_id,
                f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing batch {batch_num + 1} of {total_batches} ({len(batch_accounts)} accounts)..."
            )

            with ThreadPoolExecutor(max_workers=batch_size) as executor:
                futures = [executor.submit(process_account, acc) for acc in batch_accounts]
                batch_results = [f.result() for f in futures]

            for account_result in batch_results:
                for campaign in account_result['campaigns']:
                    campaign['index'] = campaign_index
                    result['campaigns'].append(campaign)
                    campaign_index += 1

                result['summary']['total_spend'] += account_result['summary']['total_spend']
                result['summary']['total_active_campaigns'] += account_result['summary']['total_active_campaigns']
                result['summary']['total_active_spend'] += account_result['summary']['total_active_spend']
                result['summary']['total_active_daily_budget'] += account_result['summary']['total_active_daily_budget']

        logger.info(f"Completed fetching. Total Active Spend: {result['summary']['total_active_spend']:.2f}, "
                    f"Total Active Daily Budget: {result['summary']['total_active_daily_budget']:.2f}")

        append_redis_message_adspent(
            user_id,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Completed fetching. Total Active Spend: {result['summary']['total_active_spend']:.2f}"
        )
        return result

    except Exception as e:
        logger.error(f"Unexpected error in fetch_ad_spend_data: {str(e)}")
        return {"error": str(e)}