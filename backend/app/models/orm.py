from sqlalchemy import Column, String, Boolean, DateTime, Float, Integer, JSON, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
import uuid

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String)

    # Role & Premium
    role = Column(String, default="user")          # user | partner | admin
    is_premium = Column(Boolean, default=False)
    business_category = Column(String, nullable=True)  # theatre | restaurant | cafe

    # Device Binding
    device_id = Column(String, nullable=True)
    device_bound_at = Column(DateTime, nullable=True)
    avatar_url = Column(String, nullable=True)

    # Couple logic
    couple_space_id = Column(String, nullable=True)
    partner_id = Column(String, nullable=True)
    pending_link = Column(JSONB, nullable=True)

    # App Lock
    app_pin = Column(String, nullable=True)
    pin_set_at = Column(DateTime, nullable=True)
    pin_failed_attempts = Column(Integer, default=0)
    intruder_trigger = Column(Boolean, default=False)
    auto_lock_seconds = Column(Integer, default=30)

    # Payouts (encrypted)
    payout_method = Column(String, nullable=True)
    payout_upi_id = Column(String, nullable=True)
    payout_bank_acc = Column(String, nullable=True)
    payout_bank_ifsc = Column(String, nullable=True)

    # Premium Preferences
    stealth_mode = Column(Boolean, default=False)
    blur_sensitive = Column(Boolean, default=False)
    hide_activity = Column(Boolean, default=False)
    ai_personality = Column(String, default="compassionate")
    milestone_alerts = Column(Boolean, default=True)

    # Compassionate Archive
    is_archived = Column(Boolean, default=False)
    closure_requested = Column(Boolean, default=False)
    archived_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

class CoupleSpace(Base):
    __tablename__ = "couple_spaces"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user1_id = Column(String, ForeignKey("users.id"))
    user2_id = Column(String, ForeignKey("users.id"))
    allow_media_save = Column(Boolean, default=True)
    
    # NEW: Chat Appearance
    theme_id = Column(String, default="classic")
    chat_wallpaper = Column(String, nullable=True) # Custom photo URL
    
    created_at = Column(DateTime, default=datetime.utcnow)

class Invite(Base):
    __tablename__ = "invites"
    id = Column(String, primary_key=True)  # The 6-digit code
    created_by = Column(String, ForeignKey("users.id"))
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    sender_id = Column(String)
    sender_name = Column(String, nullable=True)
    message_type = Column(String, default="text")
    text = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    reactions = Column(JSONB, default={})
    is_once_view = Column(Boolean, default=False)
    view_limit = Column(Integer, default=1)
    views_used = Column(Integer, default=0)
    is_compromised = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class Mood(Base):
    __tablename__ = "moods"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    mood_type = Column(String)
    note = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Memory(Base):
    __tablename__ = "memories"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    date = Column(String)  # YYYY-MM-DD
    image_url = Column(String, nullable=True)
    created_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class OnceViewMessage(Base):
    __tablename__ = "once_view_messages"
    message_id = Column(String, primary_key=True)
    sender_id = Column(String)
    sender_name = Column(String)
    receiver_id = Column(String)
    content = Column(Text)
    message_type = Column(String)
    viewed = Column(Boolean, default=False)
    capture_attempted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    viewed_at = Column(DateTime, nullable=True)
    capture_attempted_at = Column(DateTime, nullable=True)

class DeviceOTPRequest(Base):
    __tablename__ = "device_otp_requests"
    request_id = Column(String, primary_key=True)
    requester_id = Column(String)
    requester_name = Column(String)
    partner_id = Column(String)
    device_id = Column(String)
    otp = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class IntruderLog(Base):
    __tablename__ = "intruder_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String)
    photo = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String)
    description = Column(Text)
    price = Column(Float)
    category = Column(String)
    emoji = Column(String, default="🎁")
    stock = Column(Integer, default=100)
    images = Column(JSON, default=[])
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String)

class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True)
    couple_space_id = Column(String, index=True)
    buyer_id = Column(String)
    buyer_name = Column(String)
    product_id = Column(String)
    product_name = Column(String)
    product_emoji = Column(String)
    quantity = Column(Integer, default=1)
    amount = Column(Float)
    delivery_address = Column(Text)
    gift_message = Column(Text, nullable=True)
    is_surprise = Column(Boolean, default=False)
    status = Column(String, default="pending") # pending | shipped | delivered
    created_at = Column(DateTime, default=datetime.utcnow)

class Wishlist(Base):
    __tablename__ = "wishlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, index=True)
    product_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, index=True)
    type = Column(String)
    title = Column(String)
    body = Column(Text)
    data = Column(JSONB, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    user_id = Column(String, primary_key=True)
    endpoint = Column(Text)
    keys = Column(JSONB)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Anniversary(Base):
    __tablename__ = "anniversaries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    couple_space_id = Column(String, index=True)
    title = Column(String)
    date = Column(String) # YYYY-MM-DD
    type = Column(String) # anniversary, birthday, first_date
    created_at = Column(DateTime, default=datetime.utcnow)

class AICounselingSession(Base):
    __tablename__ = "ai_counseling_sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    status = Column(String, default="analyzing_history") # analyzing_history | interviewing | finalizing | completed
    history_window_days = Column(Integer)
    
    # Internal context storage
    history_synopsis = Column(Text, nullable=True) # AI's summary of the chat logs
    partner_a_id = Column(String, nullable=True)
    partner_a_pov = Column(Text, nullable=True) # Summary of private interview A
    partner_b_id = Column(String, nullable=True)
    partner_b_pov = Column(Text, nullable=True) # Summary of private interview B
    
    final_report = Column(JSONB, nullable=True) # {pros: [], cons: [], core_issue: "", resolution: ""}
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class LovePage(Base):
    __tablename__ = "love_pages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    created_by = Column(String, ForeignKey("users.id"))
    
    # AI Engine Fields
    vibe_prompt = Column(Text) # The user's input: "Rainy evening vibe"
    blueprint = Column(JSONB)  # The AI-generated JSON: { theme, colors, font_pair, blocks: [] }
    
    title = Column(String, nullable=True)
    music_url = Column(String, nullable=True)
    
    status = Column(String, default="draft") # draft | published
    is_premium = Column(Boolean, default=False) # True if they paid for extra sites
    is_opened = Column(Boolean, default=False)  # Track unboxing
    
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

class BucketItem(Base):
    __tablename__ = "bucket_items"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    created_by = Column(String)
    created_by_name = Column(String)
    title = Column(String)
    description = Column(Text, nullable=True)
    emoji = Column(String, default="🎯")
    category = Column(String, default="adventure")
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Note(Base):
    __tablename__ = "notes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    created_by = Column(String)
    title = Column(String)
    content = Column(Text)
    color = Column(String, default="#ffffff")
    is_pinned = Column(Boolean, default=False)
    is_newly_shared = Column(Boolean, default=False)
    is_opened = Column(Boolean, default=False) # Track unboxing
    shared_display_until = Column(DateTime, nullable=True) # Banner disappears after this
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SurprisePage(Base):
    __tablename__ = "surprise_pages"
    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    user_name = Column(String)
    couple_space_id = Column(String, nullable=True)
    occasion = Column(String)
    recipient_name = Column(String)
    sender_name = Column(String)
    color_theme = Column(String)
    photos = Column(JSONB, default=[])
    videos = Column(JSONB, default=[])      # NEW
    voice_notes = Column(JSONB, default=[]) # NEW
    views = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class AppConfig(Base):
    __tablename__ = "app_configs"
    key = Column(String, primary_key=True)  # terms, privacy, app_name, logo_url
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PromoCode(Base):
    __tablename__ = "promo_codes"
    code = Column(String, primary_key=True)
    discount_percent = Column(Integer, default=100) # Full free for 100
    is_used = Column(Boolean, default=False)
    used_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Place(Base):
    __tablename__ = "places"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String)
    category = Column(String)
    address = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    image_url = Column(String, nullable=True)
    slots = Column(JSONB, default=[]) # Table slots management
    owner_id = Column(String, index=True, nullable=True)
    is_approved = Column(Boolean, default=False)
    commission_rate = Column(Float, default=10.0)
    created_at = Column(DateTime, default=datetime.utcnow)

class PlaceBooking(Base):
    __tablename__ = "place_bookings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    place_id = Column(Integer, index=True)
    user_id = Column(String, index=True)
    date = Column(String)
    slot = Column(String)
    guests = Column(Integer)
    total_amount = Column(Float)
    platform_fee = Column(Float, default=5.0)
    commission_amount = Column(Float)
    paxly_gross_revenue = Column(Float)
    razorpay_order_id = Column(String, nullable=True)
    razorpay_payment_id = Column(String, nullable=True)
    status = Column(String, default="pending") # pending, paid, cancelled
    payout_status = Column(String, default="pending") # pending | eligible | processing | settled | disputed
    payout_eligible_at = Column(DateTime, nullable=True) # booking_date + 24h
    is_disputed = Column(Boolean, default=False)
    payout_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Theatre(Base):
    __tablename__ = "theatres"
    id = Column(String, primary_key=True)
    name = Column(String)
    city = Column(String)
    address = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    description = Column(Text)
    capacity = Column(Integer)
    price_per_hour = Column(Float)
    images = Column(JSONB, default=[])
    amenities = Column(JSONB, default=[])
    snacks = Column(JSONB, default=[])
    slots = Column(JSONB, default=[])
    contact_phone = Column(String)
    contact_email = Column(String)
    contact_whatsapp = Column(String)
    rating = Column(Float)
    active = Column(Boolean, default=True)
    owner_id = Column(String, index=True, nullable=True)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class TheatreBooking(Base):
    __tablename__ = "theatre_bookings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, unique=True)
    theatre_id = Column(String, index=True)
    theatre_name = Column(String)
    user_id = Column(String, index=True)
    user_name = Column(String)
    couple_space_id = Column(String, nullable=True)
    date = Column(String)
    slot = Column(String)
    movie_name = Column(String)
    snacks = Column(JSONB, default=[])
    guests = Column(Integer)
    special_requests = Column(Text, nullable=True)
    decoration = Column(Boolean, default=False)
    total_amount = Column(Float)
    platform_fee = Column(Float, default=5.0)
    commission_amount = Column(Float)
    paxly_gross_revenue = Column(Float)
    razorpay_order_id = Column(String, nullable=True)
    razorpay_payment_id = Column(String, nullable=True)
    status = Column(String, default="pending") # pending, paid, cancelled
    payout_status = Column(String, default="pending") # pending | eligible | processing | settled | disputed
    payout_eligible_at = Column(DateTime, nullable=True) # booking_date + 24h
    is_disputed = Column(Boolean, default=False)
    payout_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class VoiceNote(Base):
    __tablename__ = "voice_notes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    sender_id = Column(String)
    url = Column(String)
    filename = Column(String)
    custom_name = Column(String, nullable=True)
    size = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class PaymentLog(Base):
    __tablename__ = "payment_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(String, index=True)
    booking_type = Column(String) # theatre | restaurant
    event = Column(String) # order_created, payment_captured, webhook_received, payout_released
    data = Column(JSONB, nullable=True) # Full response from Razorpay
    created_at = Column(DateTime, default=datetime.utcnow)

class BannedIP(Base):
    __tablename__ = "banned_ips"
    ip_address = Column(String, primary_key=True)
    reason = Column(String)
    banned_at = Column(DateTime, default=datetime.utcnow)

class AdminAudit(Base):
    __tablename__ = "admin_audits"
    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(String, index=True)
    action = Column(String)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class CallLog(Base):
    __tablename__ = "call_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    couple_space_id = Column(String, index=True)
    caller_id = Column(String)
    recipient_id = Column(String)
    call_type = Column(String, default="video")
    duration = Column(Integer, default=0) # in seconds
    recording_url = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class FailedLoginAttempt(Base):
    __tablename__ = "failed_login_attempts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ip_address = Column(String, index=True)
    email_attempted = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
