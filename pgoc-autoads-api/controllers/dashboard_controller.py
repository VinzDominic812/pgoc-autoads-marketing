# controllers/dashboard_controller.py
from flask import jsonify, request
from workers.dashboard_worker import fetch_ad_spend_data, update_campaign_status, update_adset_status, update_ad_status
import json
from datetime import datetime
import pytz
import logging # Import the logging module

# Configure logging (you can adjust the level as needed, INFO is good for detailed debugging)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO) # Temporarily set to INFO to see detailed logs

def get_user_dashboard():
    data = request.get_json()

    access_token = data.get("access_token")
    user_id = data.get("user_id")

    if not (user_id and access_token):
        logger.warning("Missing user_id or access_token for get_user_dashboard request.") # Added log
        return jsonify({"error": "Missing required fields"}), 400

    try:
        task = fetch_ad_spend_data.apply_async(args=[user_id, access_token], countdown=0)
        dashboard_data = task.get(timeout=300)

    except Exception as e:
        logger.error(f"Task failed or timed out for user {user_id}: {str(e)}") # Added log
        return jsonify({"error": f"Task failed or timed out: {str(e)}"}), 500

    if isinstance(dashboard_data, dict) and dashboard_data.get("error"):
        logger.error(f"Error fetching dashboard data for user {user_id}: {dashboard_data.get('error')}") # Added log
        return jsonify({"error": dashboard_data.get("error")}), 400

    if not isinstance(dashboard_data, dict) or "campaign_spending_data" not in dashboard_data:
        logger.error("Invalid response structure from worker for dashboard data.") # Added log
        return jsonify({"error": "Invalid response structure from worker"}), 500

    campaign_data = dashboard_data.get("campaign_spending_data", {})
    if not isinstance(campaign_data, dict) or "campaigns" not in campaign_data:
        logger.error("No campaigns data found in dashboard data.") # Added log
        return jsonify({"error": "No campaigns data found"}), 500

    campaigns = campaign_data.get("campaigns", [])
    print(f"🚀 Dashboard API response: {len(campaigns)} campaigns sent to frontend")

    updated_at = datetime.now(pytz.timezone("Asia/Manila")).isoformat()

    return jsonify({
        "dashboard_data": campaign_data,
        "data_updated_at": updated_at
    }), 200

def update_campaign_status_controller():
    data = request.get_json()
    logger.info(f"Received campaign update request: {data}") # ADDED LOG
    campaign_id = data.get("campaign_id")
    access_token = data.get("access_token")
    status = data.get("status")

    if not all([campaign_id, access_token, status]):
        logger.error(f"Missing fields for campaign update: campaign_id={campaign_id}, access_token={'<REDACTED>' if access_token else 'None'}, status={status}") # ADDED LOG
        return jsonify({"error": "Missing campaign_id, access_token, or status"}), 400

    if status not in ["ACTIVE", "PAUSED"]:
        logger.error(f"Invalid status for campaign update: {status}") # Added log
        return jsonify({"error": "Status must be 'ACTIVE' or 'PAUSED'"}), 400

    try:
        result = update_campaign_status(campaign_id, access_token, status)
        if result.get("success"):
            logger.info(f"Campaign {campaign_id} status updated to {status} successfully.") # ADDED LOG
            return jsonify({
                "success": True,
                "message": f"Campaign {campaign_id} status updated to {status}",
                "data": result
            }), 200
        else:
            error_msg = result.get("error", "Failed to update campaign status")
            logger.error(f"Failed to update campaign {campaign_id} status: {error_msg}") # ADDED LOG
            return jsonify({"error": error_msg}), 500
    except Exception as e:
        logger.exception(f"An exception occurred during campaign status update for {campaign_id}: {str(e)}") # Used logger.exception for full traceback
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

def update_adset_status_controller():
    data = request.get_json()
    logger.info(f"Received adset update request: {data}") # ADDED LOG: Logs the raw JSON data received
    adset_id = data.get("adset_id")
    access_token = data.get("access_token")
    status = data.get("status")

    if not all([adset_id, access_token, status]):
        # ADDED LOG: Explicitly logs which fields are missing/None
        logger.error(f"Missing fields for adset update: adset_id={adset_id}, access_token={'<REDACTED>' if access_token else 'None'}, status={status}")
        return jsonify({"error": "Missing adset_id, access_token, or status"}), 400

    if status not in ["ACTIVE", "PAUSED"]:
        logger.error(f"Invalid status for adset update: {status}") # Added log
        return jsonify({"error": "Status must be 'ACTIVE' or 'PAUSED'"}), 400

    try:
        result = update_adset_status(adset_id, access_token, status)
        if result.get("success"):
            logger.info(f"Ad Set {adset_id} status updated to {status} successfully.") # ADDED LOG: Success message
            return jsonify({
                "success": True,
                "message": f"Ad Set {adset_id} status updated to {status}",
                "data": result
            }), 200
        else:
            error_msg = result.get("error", "Failed to update ad set status")
            logger.error(f"Failed to update ad set {adset_id} status: {error_msg}") # ADDED LOG: Failure message
            return jsonify({"error": error_msg}), 500
    except Exception as e:
        logger.exception(f"An exception occurred during ad set status update for {adset_id}: {str(e)}") # ADDED LOG: Full traceback for exceptions
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

def update_ad_status_controller():
    data = request.get_json()
    logger.info(f"Received ad update request: {data}") # ADDED LOG: Logs the raw JSON data received
    ad_id = data.get("ad_id")
    access_token = data.get("access_token")
    status = data.get("status")

    if not all([ad_id, access_token, status]):
        # ADDED LOG: Explicitly logs which fields are missing/None
        logger.error(f"Missing fields for ad update: ad_id={ad_id}, access_token={'<REDACTED>' if access_token else 'None'}, status={status}")
        return jsonify({"error": "Missing ad_id, access_token, or status"}), 400

    if status not in ["ACTIVE", "PAUSED"]:
        logger.error(f"Invalid status for ad update: {status}") # Added log
        return jsonify({"error": "Status must be 'ACTIVE' or 'PAUSED'"}), 400

    try:
        result = update_ad_status(ad_id, access_token, status)
        if result.get("success"):
            logger.info(f"Ad {ad_id} status updated to {status} successfully.") # ADDED LOG: Success message
            return jsonify({
                "success": True,
                "message": f"Ad {ad_id} status updated to {status}",
                "data": result
            }), 200
        else:
            error_msg = result.get("error", "Failed to update ad status")
            logger.error(f"Failed to update ad {ad_id} status: {error_msg}") # ADDED LOG: Failure message
            return jsonify({"error": error_msg}), 500
    except Exception as e:
        logger.exception(f"An exception occurred during ad status update for {ad_id}: {str(e)}") # ADDED LOG: Full traceback for exceptions
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500