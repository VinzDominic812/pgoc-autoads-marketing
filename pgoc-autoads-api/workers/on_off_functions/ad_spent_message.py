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

def append_redis_message_adspent(user_id, new_message):
    """Append a new message for ad spending data.
    Ensure Redis key expires at 12 AM the next day.
    """
    redis_key = f"{user_id}-key"

    try:
        # Check if Redis is accessible
        if not redis_websocket_asr.ping():
            logging.error("Redis is not responding.")
            return

        # Format message if it's a dictionary
        if isinstance(new_message, dict):
            formatted_message = (
                f"Account: {new_message.get('account_name', 'Unknown')} | "
                f"Budget: ${new_message.get('total_daily_budget', 0):.2f} | "
                f"Remaining: ${new_message.get('total_budget_remaining', 0):.2f} | "
                f"Spent: ${new_message.get('total_spent', 0):.2f}"
            )
            data_dict = {"message": [formatted_message]}
        else:
            # Just store as a string for status messages
            data_dict = {"message": [str(new_message)]}

        # Store in Redis
        redis_websocket_asr.set(redis_key, json.dumps(data_dict, ensure_ascii=False))

        # Set Expiry Time to 12 AM Tomorrow
        now = datetime.now()
        midnight_tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        expiry_timestamp = int(midnight_tomorrow.timestamp())  # Convert to Unix timestamp

        redis_websocket_asr.expireat(redis_key, expiry_timestamp)  # Set exact expiration

        # Debugging: Verify Redis storage
        stored_data = redis_websocket_asr.get(redis_key)
        if stored_data is None:
            logging.error(f"Failed to write {redis_key} to Redis.")
        else:
            logging.info(f"Fetching report completed for Facebook ID {user_id}. Redis key {redis_key} successfully updated (expires at {midnight_tomorrow})")

    except Exception as e:
        logging.error(f"Error updating Redis key {redis_key}: {str(e)}")
