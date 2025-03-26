from flask_sqlalchemy import SQLAlchemy
import pytz
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy import func, ForeignKey
from sqlalchemy.dialects.postgresql import JSON, BYTEA, ENUM, TIMESTAMP
from datetime import datetime

db = SQLAlchemy()

manila_tz = pytz.timezone("Asia/Manila")

class User(db.Model):
    __tablename__ = 'marketing_users'

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(50), unique=True, nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    full_name = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    gender = db.Column(ENUM('male', 'female', name='gender_enum'), nullable=False)
    userdomain = db.Column(db.String(100), nullable=False)
    profile_image = db.Column(BYTEA)
    user_status = db.Column(ENUM('active', 'inactive', name='status_enum'), default='active')
    
    # Set timezone-aware timestamp columns
    created_at = db.Column(
        TIMESTAMP(timezone=True),
        default=lambda: datetime.now(manila_tz)
    )
    last_active = db.Column(
        TIMESTAMP(timezone=True),
        default=lambda: datetime.now(manila_tz),
        onupdate=lambda: datetime.now(manila_tz)
    )

class Campaign(db.Model):
    __tablename__ = 'campaign_table'

    campaign_id = db.Column(db.BigInteger, primary_key=True)  # Primary key without autoincrement
    user_id = db.Column(db.BigInteger, ForeignKey('marketing_users.id'), nullable=False)  # Foreign key to user
    ad_account_id = db.Column(db.String(50), nullable=False)
    page_name = db.Column(db.String(255))
    sku = db.Column(db.String(50))
    material_code = db.Column(db.String(50))
    daily_budget = db.Column(db.Float)
    facebook_page_id = db.Column(db.String(50))
    video_url = db.Column(db.String(255))
    headline = db.Column(db.String(255))
    primary_text = db.Column(db.Text)
    image_url = db.Column(db.String(255))
    product = db.Column(db.String(50))
    interests_list = db.Column(JSON, nullable=True)
    exclude_ph_regions = db.Column(JSON, nullable=True)
    adsets_ads_creatives = db.Column(JSON, nullable=True)
    is_ai = db.Column(db.Boolean, nullable=False, default=False)  # Indicates if AI generated the adsets
    access_token = db.Column(db.Text, nullable=False)
    status = db.Column(ENUM('Failed', 'Generating', 'Created', name='campaign_status_enum'), default='Generating')
    last_server_message = db.Column(db.Text)
    created_at = db.Column(db.TIMESTAMP, server_default=func.now())

class CampaignsScheduled(db.Model):
    __tablename__ = 'campaigns_scheduled'

    ad_account_id = db.Column(db.String(50), primary_key=True)  # Primary key as requested
    user_id = db.Column(db.BigInteger, ForeignKey('marketing_users.id'), nullable=False)
    access_token = db.Column(db.Text, nullable=False)
    schedule_data = db.Column(MutableDict.as_mutable(JSON), nullable=False)
    added_at = db.Column(TIMESTAMP, server_default=func.now(), nullable=False)
    test_campaign_data = db.Column(MutableDict.as_mutable(JSON), nullable=True)
    regular_campaign_data = db.Column(MutableDict.as_mutable(JSON), nullable=True)  # Stores multiple campaign IDs
    last_time_checked = db.Column(TIMESTAMP, nullable=True, default=datetime.utcnow)
    last_check_status = db.Column(ENUM('Failed', 'Success', 'Ongoing', name='check_status_enum'), nullable=False, default='Success')  # Status for last check
    last_check_message = db.Column(db.Text, nullable=True)   # Tracks the last time campaigns were checked
    task_id = db.Column(db.String(255), nullable=True)

class CampaignOffOnly(db.Model):
    __tablename__ = 'campaign_off_only'

    ad_account_id = db.Column(db.String(50), primary_key=True)  # Primary key
    user_id = db.Column(db.BigInteger, ForeignKey('marketing_users.id'), nullable=False)
    access_token = db.Column(db.Text, nullable=False)
    schedule_data = db.Column(MutableDict.as_mutable(JSON), nullable=False)
    campaigns_data = db.Column(MutableDict.as_mutable(JSON), nullable=True)  # Single field for campaigns data
    added_at = db.Column(TIMESTAMP, server_default=func.now(), nullable=False)
    last_time_checked = db.Column(TIMESTAMP, nullable=True, default=datetime.utcnow)
    last_check_status = db.Column(ENUM('Failed', 'Success', 'Ongoing', name='campaign_off_status_enum'),
                                  nullable=False, default='Success')  # Updated ENUM name
    last_check_message = db.Column(db.Text, nullable=True)  # Tracks last check status message
    task_id = db.Column(db.String(255), nullable=True)  # Celery task tracking


class PHRegionTable(db.Model):
    __tablename__ = "ph_region_tables"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    region_name = db.Column(db.String(100), nullable=False)
    region_key = db.Column(db.Integer, unique=True, nullable=False)
    country_code = db.Column(db.String(10), nullable=False, default="PH")
