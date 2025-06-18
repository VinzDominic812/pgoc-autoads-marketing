from flask import Blueprint, request
from controllers.dashboard_controller import get_user_dashboard

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/dashboard", methods=["POST"])
def dashboard():
    return get_user_dashboard()