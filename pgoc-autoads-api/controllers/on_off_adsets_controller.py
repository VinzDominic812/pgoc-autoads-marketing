import time
from flask import Blueprint, request, jsonify
import redis
import json
from workers.on_off_adsets_worker import fetch_adsets

# Initialize Redis connection
redis_websocket_as = redis.Redis(
    host="redisAds",
    port=6379,
    db=15,  
    decode_responses=True
)

def add_adset_off(data):
    data = request.get_json()

    if not isinstance(data, list):
        return jsonify({"error": "Expected a list of data"}), 400

    # Iterate through each entry in the provided list of data
    for entry in data:
        ad_account_id = entry.get("ad_account_id")
        user_id = entry.get("user_id")
        access_token = entry.get("access_token")
        schedule_data = entry.get("schedule_data")  # This will always have one entry per item in the list

        if not (ad_account_id and user_id and access_token and schedule_data):
            return jsonify({"error": "Missing required fields in one or more entries"}), 400

        # Create WebSocket Redis key if it doesn’t exist
        websocket_key = f"{user_id}-key"
        if not redis_websocket_as.exists(websocket_key):
            redis_websocket_as.set(websocket_key, json.dumps({"message": ["User-Id Created"]}))

        # Process each schedule entry in the list of schedules
        for schedule in schedule_data:
            if schedule["on_off"] not in ["ON", "OFF"]:
                return jsonify({"error": f"Invalid on_off value in entry with ad_account_id {ad_account_id}. Use 'ON' or 'OFF'"}), 400

            # Introduce a delay before calling Celery Task (2-second delay)
            fetch_adsets.apply_async(args=[user_id, ad_account_id, access_token, schedule], countdown=2)

    return jsonify({"message": "Adset schedules will be processed."}), 201
