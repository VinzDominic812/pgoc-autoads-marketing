from flask import Blueprint, request, jsonify
from controllers.campaign_code_controller import create_campaign_code, get_campaign_code, update_campaign_code, delete_campaign_code
from controllers.access_token_controller import create_access_token, get_access_tokens, update_access_token, delete_access_token
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
    # Check if user exists for basic authentication
    try:
        user = User.query.filter_by(id=int(user_id)).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
    # Call controller to get all tokens, no user_id needed and no permission check
    # This allows all authenticated users to view the tokens
    return get_access_tokens()

@user_routes.route('/user/access-tokens', methods=['POST'])
def add_access_token():
    user_id = request.json.get('user_id')
    token = request.json.get('access_token')

    if not user_id or not token:
        return jsonify({"error": "Missing user_id or access_token"}), 400
        
    # Check if user has correct permissions to add tokens
    try:
        user = User.query.filter_by(id=int(user_id)).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        if user.user_role != 'superadmin' or user.user_level != 1:
            return jsonify({"error": "You do not have permission to add access tokens"}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Call controller without passing user_id
    return create_access_token(token)

@user_routes.route('/user/access-tokens/<int:token_id>', methods=['PUT'])
def update_token(token_id):
    user_id = request.json.get('user_id')
    
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400
    
    # Check if user has correct permissions to update tokens
    try:
        user = User.query.filter_by(id=int(user_id)).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        if user.user_role != 'superadmin' or user.user_level != 1:
            return jsonify({"error": "You do not have permission to update access tokens"}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    return update_access_token(token_id)

@user_routes.route('/user/access-tokens/<int:token_id>', methods=['DELETE'])
def remove_access_token(token_id):
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
        
    # Check if user has correct permissions to delete tokens
    try:
        user = User.query.filter_by(id=int(user_id)).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        if user.user_role != 'superadmin' or user.user_level != 1:
            return jsonify({"error": "You do not have permission to delete access tokens"}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Call controller without passing user_id
    return delete_access_token(token_id)