from flask import Blueprint, request, jsonify
from controllers.campaign_code_controller import create_campaign_code, get_campaign_code, update_campaign_code, delete_campaign_code
from controllers.access_token_controller import create_access_token, get_access_tokens, update_access_token, delete_access_token
from controllers.invite_code_controller import generate_invite_code, use_invite_code, get_invite_codes
from models.models import User

user_routes = Blueprint('user_routes', __name__)

# GET campaign codes for a specific user (by user_id)
@user_routes.route('/user/<string:user_id>/campaign-codes', methods=['GET'])
def fetch_campaign_codes(user_id):
    # Call the controller function to get campaign code for the user
    return get_campaign_code(user_id)

# POST a new campaign code for the user
@user_routes.route('/user/campaign-codes', methods=['POST'])
def add_campaign_code():
    user_id = request.json.get('user_id')
    campaign_code = request.json.get('campaign_code')

    # Validate input
    if not user_id or not campaign_code:
        return jsonify({"error": "Missing data"}), 400

    try:
        # Call the controller function which handles DB logic
        return create_campaign_code(user_id=user_id, campaign_code=campaign_code)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# PUT endpoint to update a campaign code
@user_routes.route('/user/campaign-codes/<int:code_id>', methods=['PUT'])
def put_campaign_code(code_id):
    return update_campaign_code(code_id)

@user_routes.route('/user/campaign-codes/<int:code_id>', methods=['DELETE'])
def delete_campaign_code_route(code_id):
    user_id = request.args.get('user_id')  # Get the user_id from the query parameter
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    try:
        return delete_campaign_code(code_id, user_id)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# === Access Token Routes ===

@user_routes.route('/user/<int:user_id>/access-tokens', methods=['GET'])
def fetch_access_tokens(user_id):
    return get_access_tokens(user_id)

@user_routes.route('/user/access-tokens', methods=['POST'])
def add_access_token():
    user_id = request.json.get('user_id')
    token = request.json.get('access_token')

    if not user_id or not token:
        return jsonify({"error": "Missing user_id or access_token"}), 400

    return create_access_token(user_id, token)

@user_routes.route('/user/access-tokens/<int:token_id>', methods=['DELETE'])
def remove_access_token(token_id):
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    return delete_access_token(token_id, int(user_id))

# === Invite Code Routes ===

@user_routes.route('/user/<int:superadmin_id>/invite-codes', methods=['GET'])
def fetch_invite_codes(superadmin_id):
    return get_invite_codes(superadmin_id)

@user_routes.route('/user/invite-codes', methods=['POST'])
def create_invite_code():
    superadmin_id = request.json.get('superadmin_id')
    if not superadmin_id:
        return jsonify({"error": "Missing superadmin_id"}), 400
    return generate_invite_code(superadmin_id)

@user_routes.route('/user/invite-codes/use', methods=['POST'])
def redeem_invite_code():
    invite_code = request.json.get('invite_code')
    user_id = request.json.get('user_id')
    
    if not invite_code or not user_id:
        return jsonify({"error": "Missing invite_code or user_id"}), 400
        
    return use_invite_code(invite_code, user_id)