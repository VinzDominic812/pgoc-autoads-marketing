from flask import Blueprint, request, jsonify
from controllers.campaign_code_controller import create_campaign_code, get_campaign_code, update_campaign_code, delete_campaign_code

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