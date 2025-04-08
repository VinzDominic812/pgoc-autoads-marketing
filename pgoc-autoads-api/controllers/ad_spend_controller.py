import time
from flask import Blueprint, request, jsonify
import redis
import json
from workers.ad_spent_worker import fetch_campaign_spending

# Initialize Redis connection
redis_websocket_ads = redis.Redis(
    host="redisAds",
    port=6379,
    db=11,  
    decode_responses=True
)

def ad_spent(data):
    # Extract fields from the JSON body
    ad_account_id = data.get("ad_account_id")
    access_token = data.get("access_token")
    status = data.get("status")

    # Validate the required fields
    if not (ad_account_id and access_token and status):
        return jsonify({"error": "Missing required fields"}), 400

    # Validate status value
    if status not in ["ACTIVE", "PAUSED", "INACTIVE"]:
        return jsonify({"error": f"Invalid status value. Use 'ACTIVE', 'PAUSED', or 'INACTIVE'"}), 400

    # Fetch campaign spending data (blocking the request until the result is returned)
    campaign_spending_info = fetch_campaign_spending(user_id=None, ad_account_id=ad_account_id, access_token=access_token, status_filter=status)

    if isinstance(campaign_spending_info, dict) and campaign_spending_info.get("error"):
        return jsonify(campaign_spending_info), 400  # Return error from the task if any

    # Return the fetched campaign spending data
    return jsonify({"campaign_spending_data": campaign_spending_info}), 200
