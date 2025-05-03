import json
import redis
import logging
from datetime import datetime, timedelta

# Set up Redis client
redis_websocket_asr = redis.Redis(
    host="redisAds",
    port=6379,
    db=9,
    decode_responses=True  # Ensures Redis returns strings
)

def append_redis_message_adspent_report( user_id, new_message):
    """Set a new message in Redis for a specific user.
    Ensure Redis key expires at 12 AM the next day.
    """
    redis_key = f"{user_id}-key"  # Use only user_id in the key

    try:
        if not redis_websocket_asr.ping():
            logging.error("⚠️ Redis is not responding. Unable to store message.")
            return

        data_dict = {"message": new_message}  # Store the new message

        # Store in Redis
        redis_websocket_asr.set(redis_key, json.dumps(data_dict, ensure_ascii=False))

        # Set expiry to 12 AM next day
        now = datetime.now()
        midnight_tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        expiry_timestamp = int(midnight_tomorrow.timestamp())

        redis_websocket_asr.expireat(redis_key, expiry_timestamp)

        logging.info(f"✅ Stored ad spend report in Redis for {redis_key}")

    except Exception as e:
        logging.error(f"🚨 Error storing Redis key {redis_key} for user {user_id}: {str(e)}")
