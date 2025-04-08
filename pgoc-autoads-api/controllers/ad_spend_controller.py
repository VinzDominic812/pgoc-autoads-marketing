import time
from flask import Blueprint, request, jsonify
import redis
import json
from workers.ad_spent_worker import fetch_all_accounts_campaigns  # Make sure you're importing the new function

# Initialize Redis connection
redis_websocket_ads = redis.Redis(
    host="redisAds",
    port=6379,
    db=11,
    decode_responses=True
)

def ad_spent(data):
    access_token = data.get("access_token")
    if not access_token:
        return jsonify({"error": "Missing access_token"}), 400

    campaign_spending_info = fetch_all_accounts_campaigns(access_token=access_token)

    if isinstance(campaign_spending_info, dict) and campaign_spending_info.get("error"):
        return jsonify({"error": campaign_spending_info["error"]}), 400

    return jsonify({"campaign_spending_data": campaign_spending_info}), 200
