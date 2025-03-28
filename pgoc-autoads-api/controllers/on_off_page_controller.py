import time
from flask import Blueprint, request, jsonify
import redis
import json
from workers.on_off_page_worker import fetch_campaign_off

# Initialize Redis connection
redis_websocket_pn = redis.Redis(
    host="redisAds",
    port=6379,
    db=12,  
    decode_responses=True
)

def add_pagename_off(data):
    data = request.get_json()

    ad_account_id = data.get("ad_account_id")
    user_id = data.get("user_id")
    access_token = data.get("access_token")
    schedule_data = data.get("schedule_data")  # This will always have one entry

    if not (ad_account_id and user_id and access_token and schedule_data):
        return jsonify({"error": "Missing required fields"}), 400

    # Create WebSocket Redis key if it doesn’t exist
    websocket_key = f"{user_id}-key"
    if not redis_websocket_pn.exists(websocket_key):
        redis_websocket_pn.set(websocket_key, json.dumps({"message": ["User-Id Created"]}))

    # Since every call has only one schedule, directly process it
    schedule = schedule_data[0]
    page_name = schedule.get("page_name")

    if not page_name or not isinstance(page_name, str):
        return jsonify({"error": "Invalid or missing 'page_name'. It should be a non-empty string."}), 400

    if schedule["on_off"] not in ["ON", "OFF"]:
        return jsonify({"error": f"Invalid on_off value for '{page_name}'. Use 'ON' or 'OFF'."}), 400

    # Introduce a delay before calling Celery Task (delay of 3 seconds)
    fetch_campaign_off.apply_async(args=[user_id, ad_account_id, access_token, schedule_data[0]], countdown=2)

    return jsonify({"message": "Schedule will be processed after a short delay."}), 201