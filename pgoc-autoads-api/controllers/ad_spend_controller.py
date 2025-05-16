import time
from flask import Blueprint, request, jsonify
import redis
import json
from datetime import datetime
import pytz
from celery.result import AsyncResult
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

    # Create WebSocket Redis key if it doesn't exist
    websocket_key = f"{user_id}-key"
    if not redis_websocket_asr.exists(websocket_key):
        redis_websocket_asr.set(websocket_key, json.dumps({"message": ["User-Id Created"]}))

    # Call the Celery task asynchronously
    task = fetch_all_accounts_campaigns.delay(
        user_id=user_id, 
        access_token=access_token
    )

    try:
        campaign_spending_info = task.get(timeout=300)  # Increased timeout to 5 minutes
    except Exception as e:
        return jsonify({"error": f"Task failed: {str(e)}"}), 500

    # If there is an error in the campaign data
    if isinstance(campaign_spending_info, dict) and campaign_spending_info.get("error"):
        return jsonify({"error": campaign_spending_info["error"]}), 400

    # Add timestamp for when the data was last fetched
    updated_at = datetime.now(pytz.timezone("Asia/Manila")).isoformat()

    # Return the processed data with a timestamp
    return jsonify({
        "campaign_spending_data": campaign_spending_info,
        "data_updated_at": updated_at
    }), 200
