from flask import Blueprint, request, jsonify
from controllers.verify_ad_accounts_controllers import verify_ad_accounts

verify_ad_accounts_bp = Blueprint('verify_ad_accounts', __name__)

@verify_ad_accounts_bp.route('/verify', methods=['POST'])
def verify():
    data = request.json
    return verify_ad_accounts(data)
