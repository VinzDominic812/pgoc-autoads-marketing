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
    
    # Get pagination parameters with defaults
    page_limit = data.get("page_limit", 50)
    max_account_pages = data.get("max_account_pages", None)
    
    # Validate pagination parameters
    try:
        if page_limit is not None:
            page_limit = int(page_limit)
            if page_limit <= 0:
                page_limit = 50
        
        if max_account_pages is not None:
            max_account_pages = int(max_account_pages)
            if max_account_pages <= 0:
                max_account_pages = None
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid pagination parameters"}), 400

    if not access_token:
        return jsonify({"error": "Missing access_token"}), 400

    # Create WebSocket Redis key if it doesn't exist
    websocket_key = f"{user_id}-key"
    if not redis_websocket_asr.exists(websocket_key):
        redis_websocket_asr.set(websocket_key, json.dumps({"message": ["User-Id Created"]}))

    # Call the Celery task asynchronously with pagination parameters
    task = fetch_all_accounts_campaigns.delay(
        user_id=user_id, 
        access_token=access_token,
        page_limit=page_limit,
        max_account_pages=max_account_pages
    )

    try:
        campaign_spending_info = task.get(timeout=60)  # Wait for task to complete
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
