import json
import logging
import pytz
import requests
from datetime import datetime
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from celery import shared_task

# Constants
FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v22.0"
manila_tz = pytz.timezone("Asia/Manila")

# Logging - Set to WARNING to reduce noise
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.WARNING)

# Session with connection pooling
session = requests.Session()
session.mount('https://', requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=50, max_retries=3))

def get_facebook_user_info(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me"
    params = {"access_token": access_token, "fields": "id,name"}
    try:
        response = session.get(url, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
        logger.error(f"User info error: {response.status_code}")
    except Exception as e:
        logger.error(f"Exception in get_facebook_user_info: {e}")
    return None

def get_ad_accounts(access_token):
    url = f"{FACEBOOK_GRAPH_URL}/me/adaccounts"
    params = {"access_token": access_token, "fields": "id,name", "limit": 1000}
    ad_accounts = []
    try:
        while url:
            response = session.get(url, params=params if '?' not in url else {}, timeout=15)
            if response.status_code != 200:
                logger.error(f"Ad accounts error: {response.status_code}")
                break
            data = response.json()
            for acc in data.get("data", []):
                ad_accounts.append({
                    "id": acc.get("id", "").replace("act_", ""),
                    "name": acc.get("name", "Unnamed Account")
                })
            url = data.get("paging", {}).get("next")
        return ad_accounts
    except Exception as e:
        logger.error(f"Exception in get_ad_accounts: {e}")
        return []

def determine_delivery_status(campaign_status, ad_effective_statuses):
    campaign_status = campaign_status.upper() if campaign_status else ""
    ad_statuses = [s.upper() for s in ad_effective_statuses if s]
    if not ad_statuses:
        return "INACTIVE"

    ACTIVE_STATUSES = {"ACTIVE"}
    NOT_DELIVERING_STATUSES = {
        "ADSET_PAUSED", "DISAPPROVED", "PENDING_REVIEW",
        "PREAPPROVED", "PENDING_BILLING_INFO", "WITH_ISSUES"
    }

    active_count = sum(1 for s in ad_statuses if s in ACTIVE_STATUSES)
    adset_paused_count = sum(1 for s in ad_statuses if s == "ADSET_PAUSED")
    disapproved_count = sum(1 for s in ad_statuses if s == "DISAPPROVED")

    if campaign_status == "ACTIVE":
        # If there are any active ads, campaign is active
        if active_count > 0:
            return "ACTIVE"
        # If all ads are disapproved, campaign is recently rejected
        if disapproved_count == len(ad_statuses):
            return "RECENTLY_REJECTED"
        # If all ads are paused, campaign is not delivering
        if adset_paused_count == len(ad_statuses):
            return "NOT_DELIVERING"
        # If there are no active ads and some are in not delivering state
        if active_count == 0 and any(s in NOT_DELIVERING_STATUSES for s in ad_statuses):
            return "NOT_DELIVERING"

    return "INACTIVE"

def _update_facebook_object_status(object_id, access_token, status, object_type):
    """
    Helper function to update the status of a Facebook object (campaign, adset, ad).
    """
    assert status in ["ACTIVE", "PAUSED"], "Status must be 'ACTIVE' or 'PAUSED'"

    url = f"{FACEBOOK_GRAPH_URL}/{object_id}"
    params = {
        "access_token": access_token,
        "status": status
    }

    try:
        response = session.post(url, data=params, timeout=10)
        if response.status_code == 200:
            return {"success": True, f"{object_type}_id": object_id, "new_status": status}
        else:
            logger.error(f"Failed to update {object_type} {object_id}. Status code: {response.status_code}, Response: {response.text}")
            try:
                error_details = response.json()
            except json.JSONDecodeError:
                error_details = {"message": response.text}

            error_message = error_details.get("error", {}).get("message", "Unknown Facebook API error.")
            if error_message == "Unknown Facebook API error." and "message" in error_details:
                 error_message = error_details["message"]

            return {"success": False, "error": error_message}
    except Exception as e:
        logger.error(f"Exception updating {object_type} status: {e}")
        return {"success": False, "error": str(e)}

def update_campaign_status(campaign_id, access_token, status):
    """
    Updates the status of a Facebook campaign.
    """
    return _update_facebook_object_status(campaign_id, access_token, status, "campaign")

def update_adset_status(adset_id, access_token, status):
    """
    Updates the status of a Facebook ad set.
    """
    return _update_facebook_object_status(adset_id, access_token, status, "adset")

def update_ad_status(ad_id, access_token, status):
    """
    Updates the status of a Facebook ad.
    """
    return _update_facebook_object_status(ad_id, access_token, status, "ad")

def process_single_account_batch(account_data):
    ad_account_id, ad_account_name, access_token, user_id = account_data
    try:
        batch = [
            {"method": "GET", "relative_url": f"act_{ad_account_id}/campaigns?fields=id,name,status,daily_budget,budget_remaining&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/adsets?fields=id,campaign_id,status,name,ads{{effective_status}}&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/ads?fields=id,name,status,effective_status,adset_id,campaign_id&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/insights?fields=campaign_id,campaign_name,spend&level=campaign&date_preset=today&limit=1000"}
        ]

        response = session.post(
            FACEBOOK_GRAPH_URL,
            data={"access_token": access_token, "batch": json.dumps(batch)},
            timeout=30
        )

        if response.status_code != 200:
            logger.error(f"Batch error for account {ad_account_id}: {response.status_code}")
            return None

        responses = response.json()
        if not isinstance(responses, list) or len(responses) != 4:
            return None

        campaigns_data = json.loads(responses[0].get("body", "{}")).get("data", [])
        adsets_data = json.loads(responses[1].get("body", "{}")).get("data", [])
        ads_data = json.loads(responses[2].get("body", "{}")).get("data", [])
        insights_data = json.loads(responses[3].get("body", "{}")).get("data", [])

        return {
            "ad_account_id": ad_account_id,
            "ad_account_name": ad_account_name,
            "campaigns": campaigns_data,
            "adsets": adsets_data,
            "ads": ads_data,
            "insights": insights_data
        }
    except Exception as e:
        logger.error(f"Error processing account {ad_account_id}: {e}")
        return None
    
@shared_task
def fetch_ad_spend_data(user_id, access_token, max_workers=10):
    try:
        user_info = get_facebook_user_info(access_token)
        if not user_info:
            return {"error": "Failed to get user info"}

        ad_accounts = get_ad_accounts(access_token)
        if not ad_accounts:
            return {"error": "No ad accounts found"}

        # Log summary info only
        print(f"📊 Processing {len(ad_accounts)} ad accounts for user {user_info.get('name', 'Unknown')}")

        account_data_list = [(acc['id'], acc['name'], access_token, user_id) for acc in ad_accounts]

        campaigns = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(process_single_account_batch, account_data_list))

        successful_accounts = 0
        total_campaigns = 0
        total_adsets = 0
        total_ads = 0

        for r in results:
            if not r:
                continue

            successful_accounts += 1

            campaign_spends = {
                i.get("campaign_id"): float(i.get("spend", "0"))
                for i in r.get("insights", []) if i.get("campaign_id")
            }

            adsets_by_campaign = defaultdict(list)
            for adset in r.get("adsets", []):
                cid = adset.get("campaign_id")
                if cid:
                    adsets_by_campaign[cid].append(adset)

            # Group ads by adset_id
            ads_by_adset = defaultdict(list)
            for ad in r.get("ads", []):
                adset_id = ad.get("adset_id")
                if adset_id:
                    ads_by_adset[adset_id].append(ad)

            # Also group ads by campaign_id for direct access
            ads_by_campaign = defaultdict(list)
            for ad in r.get("ads", []):
                campaign_id = ad.get("campaign_id")
                if campaign_id:
                    ads_by_campaign[campaign_id].append(ad)

            # Count totals for summary
            account_campaigns = len(r.get("campaigns", []))
            account_adsets = len(r.get("adsets", []))
            account_ads = len(r.get("ads", []))
            
            total_campaigns += account_campaigns
            total_adsets += account_adsets
            total_ads += account_ads

            for campaign in r.get("campaigns", []):
                cid = campaign.get("id")
                if not cid:
                    continue

                spend = campaign_spends.get(cid, 0.0)
                daily_budget = float(campaign.get("daily_budget", "0") or 0) / 100
                budget_remaining = float(campaign.get("budget_remaining", "0") or 0) / 100
                campaign_status = campaign.get("status", "").upper()
                
                # Debug: Log campaign status for troubleshooting
                if campaign_status:
                    print(f"Campaign {cid} ({campaign.get('name', '')}) status: {campaign_status}")

                # Collect ad set statuses for this campaign
                adset_statuses = []
                ad_statuses = []
                adset_details = []
                ad_details = []
                
                # Collect ad effective statuses for delivery status calculation
                ad_effective_statuses = []
                
                for adset in adsets_by_campaign.get(cid, []):
                    adset_status = adset.get("status", "").upper()
                    adset_statuses.append(adset_status)
                    
                    # Debug: Log adset status for troubleshooting
                    if adset_status:
                        print(f"  Adset {adset.get('id', '')} ({adset.get('name', '')}) status: {adset_status}")
                    
                    adset_detail = {
                        "name": adset.get("name", ""),
                        "status": adset_status
                    }
                    adset_details.append(adset_detail)
                    
                    # Collect ads for this ad set
                    adset_id = adset.get("id")
                    ads_in_adset = ads_by_adset.get(adset_id, [])
                    for ad in ads_in_adset:
                        ad_status = ad.get("effective_status", "").upper()
                        if ad_status:
                            ad_statuses.append(ad_status)
                            ad_effective_statuses.append(ad_status)
                            
                        # Debug: Log ad status for troubleshooting
                        if ad_status:
                            print(f"    Ad {ad.get('id', '')} ({ad.get('name', '')}) status: {ad_status}")
                            
                        ad_detail = {
                            "name": ad.get("name", ""),
                            "status": ad_status
                        }
                        ad_details.append(ad_detail)
                
                # Calculate delivery status
                delivery_status = determine_delivery_status(campaign_status, ad_effective_statuses)

                campaigns.append({
                    "campaign_id": cid,
                    "campaign_name": campaign.get("name", ""),
                    "status": campaign_status,
                    "delivery_status": delivery_status,
                    "account_id": r['ad_account_id'],
                    "account_name": r['ad_account_name'],
                    "adset_statuses": list(set(adset_statuses)),  # Remove duplicates
                    "ad_statuses": list(set(ad_statuses)),  # Remove duplicates
                    "adsets": adset_details,
                    "ads": ad_details
                })

        # Clean summary logging
        print(f"✅ Dashboard data processed successfully:")
        print(f"   • {successful_accounts}/{len(ad_accounts)} accounts processed")
        print(f"   • {total_campaigns} campaigns")
        print(f"   • {total_adsets} ad sets")
        print(f"   • {total_ads} ads")
        
        # Debug: Count statuses for summary
        status_counts = {}
        for campaign in campaigns:
            status = campaign.get('status', 'UNKNOWN')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"📊 Campaign status summary:")
        for status, count in status_counts.items():
            print(f"   • {status}: {count} campaigns")
        
        return {
            "campaign_spending_data": {
                "campaigns": campaigns,
                "user_name": user_info.get("name", ""),
                "total_campaigns": len(campaigns),
                "total_accounts": len(ad_accounts)
            }
        }

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(error_msg)
        return {"error": str(e)}