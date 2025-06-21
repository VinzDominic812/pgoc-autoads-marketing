import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the scope and credentials path
SCOPE = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]
# IMPORTANT: Make sure 'google_credentials.json' is in the same directory or provide a correct path
CREDS_FILE = "google_credentials.json"

# IMPORTANT: Replace this with your actual Google Spreadsheet ID
# You can find this in the URL of your spreadsheet: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
SPREADSHEET_ID = "1ami6l2YIkLXXYnoyRprhqYwdrjlkH3IBL9Dd1Go8yMc"

# IMPORTANT: Specify the tab name and cell where you want to insert the budget data
TAB_NAME = "testsheet"  # Replace with your actual tab name
TARGET_CELL = "A4"   # Replace with your desired cell (e.g., "B5", "C10", etc.)

def get_sheet():
    """Authorize and get the spreadsheet object."""
    try:
        # Check if credentials file exists
        if not os.path.exists(CREDS_FILE):
            logger.error(f"Credentials file '{CREDS_FILE}' not found in {os.getcwd()}")
            return None
            
        logger.info(f"Loading credentials from: {os.path.abspath(CREDS_FILE)}")
        creds = ServiceAccountCredentials.from_json_keyfile_name(CREDS_FILE, SCOPE)
        client = gspread.authorize(creds)
        
        logger.info(f"Attempting to access spreadsheet with ID: {SPREADSHEET_ID}")
        spreadsheet = client.open_by_key(SPREADSHEET_ID)
        
        logger.info(f"Attempting to access worksheet: {TAB_NAME}")
        # Get the specific worksheet/tab
        worksheet = spreadsheet.worksheet(TAB_NAME)
        logger.info(f"Successfully connected to worksheet: {TAB_NAME}")
        return worksheet
    except FileNotFoundError as e:
        logger.error(f"Credentials file not found: {e}")
        return None
    except Exception as e:
        logger.error(f"Error accessing Google Sheet: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return None

def update_budget(data):
    """Update the specific cell with the budget data."""
    logger.info(f"Starting update_budget with data: {data}")
    
    worksheet = get_sheet()
    if not worksheet:
        return {"error": "Could not connect to Google Sheet - check server logs for details"}, 500

    budget_remaining = data.get("budget_remaining")
    if budget_remaining is None:
        return {"error": "Missing 'budget_remaining' value"}, 400

    try:
        # Add peso symbol to the budget value
        budget_with_peso = f"₱{budget_remaining}"
        logger.info(f"Updating cell {TARGET_CELL} with value: {budget_with_peso}")
        
        # Update the specific cell with the budget value
        worksheet.update_acell(TARGET_CELL, budget_with_peso)
        
        logger.info(f"Successfully updated cell {TARGET_CELL}")
        return {"message": f"Budget updated successfully in Google Sheet at {TAB_NAME}!{TARGET_CELL}"}, 200
    except Exception as e:
        logger.error(f"Error updating Google Sheet: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return {"error": f"An error occurred: {str(e)}"}, 500 