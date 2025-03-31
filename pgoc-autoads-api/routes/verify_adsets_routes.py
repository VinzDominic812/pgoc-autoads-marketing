from flask import Blueprint, request, jsonify
from controllers.verify_adsets_controller import verify_adsets_account

verify_adsets_accounts_bp = Blueprint('verify_adsets_accounts', __name__)

@verify_adsets_accounts_bp.route('/verify/adsets', methods=['POST'])
def verify_adsets():
    data = request.json
    return verify_adsets_account(data)