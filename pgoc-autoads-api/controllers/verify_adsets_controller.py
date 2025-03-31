import requests
from flask import jsonify
from models.models import db, User

FACEBOOK_GRAPH_API_URL = "https://graph.facebook.com/v22.0"

def get_facebook_user_id(access_token):
    """Validate access token and return Facebook user ID or error."""
    url = f"{FACEBOOK_GRAPH_API_URL}/me?access_token={access_token}"
    response = requests.get(url).json()
    if "error" in response:
        return None, response["error"]["message"]
    return response["id"], None

def get_ad_accounts(fb_user_id, access_token):
    """Get associated ad accounts for the Facebook user ID."""
    url = f"{FACEBOOK_GRAPH_API_URL}/{fb_user_id}/adaccounts?access_token={access_token}"
    response = requests.get(url).json()
    if "error" in response:
        return None, response["error"]["message"]
    return [acc["account_id"] for acc in response.get("data", [])], None

def verify_adsets_account(data):
    """Verify ad account and access token with schedule data."""
    user_id = data.get("user_id")
    ad_account_id = data.get("ad_account_id")
    access_token = data.get("access_token")
    schedule_data = data.get("schedule_data", [])
    
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "Unauthorized: Not a user of Facebook-Marketing-Automation WebApp"}), 403
    
    fb_user_id, token_error = get_facebook_user_id(access_token)
    if token_error:
        return jsonify({
            "user_id": user_id,
            "verified_accounts": [{
                "ad_account_id": ad_account_id,
                "ad_account_status": "Not Verified",
                "ad_account_error": "Invalid access token",
                "access_token": access_token,
                "access_token_status": "Not Verified",
                "access_token_error": token_error,
                "schedule_data": schedule_data
            }]
        })
    
    ad_accounts, ad_error = get_ad_accounts(fb_user_id, access_token)
    ad_account_status = "Verified" if ad_accounts and ad_account_id in ad_accounts else "Not Verified"
    ad_account_error = None if ad_account_status == "Verified" else "Ad account not associated with this access token"
    
    verified_accounts = [{
        "ad_account_id": ad_account_id,
        "ad_account_status": ad_account_status,
        "ad_account_error": ad_account_error,
        "access_token": access_token,
        "access_token_status": "Verified" if not token_error else "Not Verified",
        "access_token_error": token_error,
        "schedule_data": schedule_data
    }]
    
    return jsonify({
        "user_id": user_id,
        "verified_accounts": verified_accounts
    })
