from flask import Blueprint, request
from controllers.dashboard_controller import get_user_dashboard, update_campaign_status_controller, update_adset_status_controller, update_ad_status_controller # Import all new controller functions

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/dashboard", methods=["POST"])
def dashboard():
    return get_user_dashboard()

@dashboard_bp.route("/dashboard/update_campaign_status", methods=["POST"])
def update_campaign():
    return update_campaign_status_controller()

@dashboard_bp.route("/dashboard/update_adset_status", methods=["POST"])
def update_adset():
    return update_adset_status_controller()

@dashboard_bp.route("/dashboard/update_ad_status", methods=["POST"])
def update_ad():
    return update_ad_status_controller()