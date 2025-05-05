import time
from flask import Blueprint, request, jsonify
import redis
import json
from workers.ad_spent_worker import fetch_all_accounts_campaigns

# Initialize Redis connection
redis_websocket_asr = redis.Redis(
    host="redisAds",
    port=6379,
    db=9,
    decode_responses=True
)

def ad_spent(data):
    data = request.get_json()
    access_token = data.get("access_token")
    user_id = data.get("user_id")
    
    if not access_token:
        return jsonify({"error": "Missing access_token"}), 400
    
    # Create WebSocket Redis key if it doesn’t exist
    websocket_key = f"{user_id}-key"
    if not redis_websocket_asr.exists(websocket_key):
        redis_websocket_asr.set(websocket_key, json.dumps({"message": ["User-Id Created"]}))

    # Fetch the campaign spending info (with only active campaigns already filtered in the worker)
    campaign_spending_info = fetch_all_accounts_campaigns(user_id=user_id,access_token=access_token)

    # If there is an error in the campaign data
    if isinstance(campaign_spending_info, dict) and campaign_spending_info.get("error"):
        return jsonify({"error": campaign_spending_info["error"]}), 400
    
    # Return the filtered and processed data
    return jsonify({"campaign_spending_data": campaign_spending_info}), 200
