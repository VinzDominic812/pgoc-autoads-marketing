from flask import jsonify, request
from workers.dashboard_worker import fetch_dashboard_data
import json
from datetime import datetime
import pytz

def get_user_dashboard():
    data = request.get_json()

    access_token = data.get("access_token")
    user_id = data.get("user_id")

    if not (user_id and access_token):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # Pass parameters in the correct order as defined in the worker
        task = fetch_dashboard_data.apply_async(args=[access_token, user_id], countdown=0)

        # Wait for the task result, timeout in seconds
        dashboard_data = task.get(timeout=300)

    except Exception as e:
        return jsonify({"error": f"Task failed or timed out: {str(e)}"}), 500

    if isinstance(dashboard_data, dict) and dashboard_data.get("status") == "error":
        return jsonify({"error": dashboard_data.get("message")}), 400

    updated_at = datetime.now(pytz.timezone("Asia/Manila")).isoformat()

    return jsonify({
        "dashboard_data": dashboard_data.get("data"),
        "data_updated_at": updated_at
    }), 200
