from flask import jsonify, request
from workers.dashboard_worker import fetch_ad_spend_data
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
        task = fetch_ad_spend_data.apply_async(args=[user_id, access_token], countdown=0)

        # Wait for the task result, timeout in seconds
        dashboard_data = task.get(timeout=300)

    except Exception as e:
        return jsonify({"error": f"Task failed or timed out: {str(e)}"}), 500

    if isinstance(dashboard_data, dict) and dashboard_data.get("error"):
        return jsonify({"error": dashboard_data.get("error")}), 400

    # Validate the response structure
    if not isinstance(dashboard_data, dict) or "campaign_spending_data" not in dashboard_data:
        return jsonify({"error": "Invalid response structure from worker"}), 500

    campaign_data = dashboard_data.get("campaign_spending_data", {})
    if not isinstance(campaign_data, dict) or "campaigns" not in campaign_data:
        return jsonify({"error": "No campaigns data found"}), 500

    # Clean summary logging - only show totals
    campaigns = campaign_data.get("campaigns", [])
    print(f"🚀 Dashboard API response: {len(campaigns)} campaigns sent to frontend")

    updated_at = datetime.now(pytz.timezone("Asia/Manila")).isoformat()

    return jsonify({
        "dashboard_data": campaign_data,
        "data_updated_at": updated_at
    }), 200