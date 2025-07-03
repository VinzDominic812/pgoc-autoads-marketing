import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import os
import logging
import re

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
        # Add peso symbol to the budget value, formatted with commas
        try:
            budget_float = float(budget_remaining)
            budget_formatted = f"{budget_float:,.2f}"
        except Exception:
            budget_formatted = str(budget_remaining)
        budget_with_peso = f"₱{budget_formatted}"
        logger.info(f"Updating B4 with value: {budget_with_peso}")
        # Update A4, B4, and C4
        worksheet.update_acell("A4", "TO SPEND")
        worksheet.update_acell("B4", budget_with_peso)
        now = datetime.now()
        now_str = f"{now.month}/{now.day}/{now.year}, {now.strftime('%I:%M:%S %p').lstrip('0')}"
        worksheet.update_acell("C4", f"'{now_str}")

        # --- Add cell formatting to A4, B4, and C4 ---
        def get_col_row(cell):
            import re
            match = re.match(r"([A-Z]+)([0-9]+)", cell)
            if match:
                col_letters, row_str = match.groups()
                row = int(row_str) - 1  # 0-indexed for API
                col = sum([(ord(char) - ord('A') + 1) * (26 ** i) for i, char in enumerate(reversed(col_letters))]) - 1
                return row, col
            return None, None

        sheet_id = worksheet._properties['sheetId']
        row, col_a = get_col_row("A4")
        _, col_b = get_col_row("B4")
        _, col_c = get_col_row("C4")

        requests = [
            {  # A4: left-aligned
                "repeatCell": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": row,
                        "endRowIndex": row + 1,
                        "startColumnIndex": col_a,
                        "endColumnIndex": col_a + 1,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "horizontalAlignment": "LEFT",
                            "textFormat": {
                                "fontSize": 14,
                                "bold": True
                            }
                        }
                    },
                    "fields": "userEnteredFormat(horizontalAlignment,textFormat)"
                }
            },
            {  # B4: centered (no background)
                "repeatCell": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": row,
                        "endRowIndex": row + 1,
                        "startColumnIndex": col_b,
                        "endColumnIndex": col_b + 1,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "horizontalAlignment": "CENTER",
                            "textFormat": {
                                "fontSize": 14,
                                "bold": True
                            }
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,horizontalAlignment)"
                }
            },
            {  # C4: left-aligned, NOT bold, font size 10
                "repeatCell": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": row,
                        "endRowIndex": row + 1,
                        "startColumnIndex": col_c,
                        "endColumnIndex": col_c + 1,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "horizontalAlignment": "LEFT",
                            "textFormat": {
                                "fontSize": 10
                            }
                        }
                    },
                    "fields": "userEnteredFormat(horizontalAlignment,textFormat)"
                }
            }
        ]
        worksheet.spreadsheet.batch_update({"requests": requests})
        # --- End cell formatting ---

        logger.info(f"Successfully updated A4, B4, C4")
        return {"message": f"Budget updated successfully in Google Sheet at {TAB_NAME}!A4, B4, C4"}, 200
    except Exception as e:
        logger.error(f"Error updating Google Sheet: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return {"error": f"An error occurred: {str(e)}"}, 500 