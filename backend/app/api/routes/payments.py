from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import razorpay
from app.core.security import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.orm import User, PaymentLog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import hmac
import hashlib

router = APIRouter(prefix="/payments", tags=["Payments"])

class CreateOrderRequest(BaseModel):
    amount: int
    currency: str = "INR"

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

def get_razorpay_client():
    if not settings.RAZORPAY_KEY_ID or settings.RAZORPAY_KEY_ID == "placeholder_id":
        raise HTTPException(status_code=500, detail="Razorpay keys not configured")
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

@router.post("/create-order")
async def create_order(req: CreateOrderRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if settings.RAZORPAY_KEY_ID == "placeholder_id" or not settings.RAZORPAY_KEY_ID:
        # Mock response for local development without actual keys
        return {"id": "order_mock_" + user.id[:8], "amount": req.amount * 100, "currency": req.currency}
        
    client = get_razorpay_client()
    try:
        # Create Order
        data = {
            "amount": req.amount * 100, # Amount in paise
            "currency": req.currency,
            "receipt": f"receipt_{user.id}_{int(100000)}",
            "notes": {
                "user_id": user.id,
                "type": "premium_subscription"
            }
        }
        order = client.order.create(data=data)
        
        # Log it
        new_log = PaymentLog(event="order_created", data=order)
        db.add(new_log)
        await db.commit()
        
        return order
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify")
async def verify_payment(req: VerifyPaymentRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.razorpay_order_id.startswith("order_mock_") or settings.RAZORPAY_KEY_ID == "placeholder_id":
        # Mock verification
        await db.execute(update(User).where(User.id == user.id).values(is_premium=True))
        await db.commit()
        return {"status": "success", "message": "Mock payment verified and Premium unlocked!"}

    client = get_razorpay_client()
    try:
        # Verify Signature
        client.utility.verify_payment_signature({
            'razorpay_order_id': req.razorpay_order_id,
            'razorpay_payment_id': req.razorpay_payment_id,
            'razorpay_signature': req.razorpay_signature
        })
        
        # Mark user as premium
        await db.execute(update(User).where(User.id == user.id).values(is_premium=True))
        
        # Log it
        new_log = PaymentLog(event="payment_verified", data={"order_id": req.razorpay_order_id, "payment_id": req.razorpay_payment_id})
        db.add(new_log)
        await db.commit()
        
        return {"status": "success", "message": "Payment verified and Premium unlocked!"}
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
