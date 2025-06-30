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

# Logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

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
        logger.error(f"User info error: {response.status_code}, {response.text}")
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
                logger.error(f"Ad accounts error: {response.status_code}, {response.text}")
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
    
def process_single_account_batch(account_data):
    ad_account_id, ad_account_name, access_token, user_id = account_data
    try:
        #append_message(user_id, f"🔄 Processing account: {ad_account_name} ({ad_account_id})")

        batch = [
            {"method": "GET", "relative_url": f"act_{ad_account_id}/campaigns?fields=id,name,status,daily_budget,budget_remaining&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/adsets?fields=id,campaign_id,status,name&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/ads?fields=id,name,status,effective_status,adset_id,campaign_id&limit=1000"},
            {"method": "GET", "relative_url": f"act_{ad_account_id}/insights?fields=campaign_id,campaign_name,spend&level=campaign&date_preset=today&limit=1000"}
        ]

        response = session.post(
            FACEBOOK_GRAPH_URL,
            data={"access_token": access_token, "batch": json.dumps(batch)},
            timeout=30
        )

        if response.status_code != 200:
            #append_message(user_id, f"❌ Batch error for {ad_account_id}: {response.status_code}")
            return None

        responses = response.json()
        if not isinstance(responses, list) or len(responses) != 4:
            return None

        campaigns_data = json.loads(responses[0].get("body", "{}")).get("data", [])
        adsets_data = json.loads(responses[1].get("body", "{}")).get("data", [])
        ads_data = json.loads(responses[2].get("body", "{}")).get("data", [])
        insights_data = json.loads(responses[3].get("body", "{}")).get("data", [])

        # Debug logging
        logger.info(f"Account {ad_account_id}: {len(campaigns_data)} campaigns, {len(adsets_data)} ad sets, {len(ads_data)} ads")

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
        #append_message(user_id, "🚀 Starting ad spend fetch")

        user_info = get_facebook_user_info(access_token)
        if not user_info:
            #append_message(user_id, "❌ Failed to get user info")
            return {"error": "Failed to get user info"}

        ad_accounts = get_ad_accounts(access_token)
        if not ad_accounts:
            #append_message(user_id, "❌ No ad accounts found")
            return {"error": "No ad accounts found"}

        account_data_list = [(acc['id'], acc['name'], access_token, user_id) for acc in ad_accounts]

        campaigns = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(process_single_account_batch, account_data_list))

        for r in results:
            if not r:
                continue

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

            logger.info(f"Processing account {r['ad_account_id']}: {len(r.get('adsets', []))} ad sets, {len(r.get('ads', []))} ads, {len(ads_by_adset)} ad sets with ads")

            for campaign in r.get("campaigns", []):
                cid = campaign.get("id")
                if not cid:
                    continue

                spend = campaign_spends.get(cid, 0.0)
                daily_budget = float(campaign.get("daily_budget", "0") or 0) / 100
                budget_remaining = float(campaign.get("budget_remaining", "0") or 0) / 100
                campaign_status = campaign.get("status", "").upper()

                # Collect ad set statuses for this campaign
                adset_statuses = []
                ad_statuses = []
                adset_details = []
                ad_details = []
                
                for adset in adsets_by_campaign.get(cid, []):
                    adset_status = adset.get("status", "").upper()
                    adset_statuses.append(adset_status)
                    
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
                            
                        ad_detail = {
                            "name": ad.get("name", ""),
                            "status": ad_status
                        }
                        ad_details.append(ad_detail)

                campaigns.append({
                    "campaign_id": cid,
                    "campaign_name": campaign.get("name", ""),
                    "status": campaign_status,
                    "account_id": r['ad_account_id'],
                    "account_name": r['ad_account_name'],
                    "adset_statuses": list(set(adset_statuses)),  # Remove duplicates
                    "ad_statuses": list(set(ad_statuses)),  # Remove duplicates
                    "adsets": adset_details,
                    "ads": ad_details
                })

        # Debug logging
        logger.info(f"Total campaigns processed: {len(campaigns)}")
        for campaign in campaigns:
            logger.info(f"Campaign {campaign['campaign_name']}: {len(campaign.get('adsets', []))} ad sets, {len(campaign.get('ads', []))} ads")
        
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
        #append_message(user_id, f"❌ {error_msg}")
        return {"error": str(e)}