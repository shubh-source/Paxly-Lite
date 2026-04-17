import razorpay
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from app.core.config import settings
from app.core.security import get_current_user
from app.core.database import get_db
from app.models.orm import User, TheatreBooking, PlaceBooking, Theatre, Place, PaymentLog
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import json
import uuid

router = APIRouter(prefix="/payments", tags=["payments"])

client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

class PaymentCreate(BaseModel):
    booking_id: str
    booking_type: str # theatre | restaurant

@router.post("/create-order")
async def create_order(data: PaymentCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.booking_type == "theatre":
        res = await db.execute(select(TheatreBooking, Theatre).join(Theatre, Theatre.id == TheatreBooking.theatre_id).filter(TheatreBooking.id == data.booking_id))
        booking, business = res.first()
    else:
        res = await db.execute(select(PlaceBooking, Place).join(Place, Place.id == PlaceBooking.place_id).filter(PlaceBooking.id == data.booking_id))
        booking, business = res.first()

    amount = int((booking.total_amount + booking.platform_fee) * 100)
    
    try:
        razorpay_order = client.order.create(data={
            "amount": amount,
            "currency": "INR",
            "receipt": booking.id,
            "payment_capture": 1
        })
        
        # Log event
        log = PaymentLog(booking_id=booking.id, booking_type=data.booking_type, event="order_created", data=razorpay_order)
        db.add(log)
        
        if data.booking_type == "theatre":
            await db.execute(update(TheatreBooking).where(TheatreBooking.id == data.booking_id).values(razorpay_order_id=razorpay_order['id']))
        else:
            await db.execute(update(PlaceBooking).where(PlaceBooking.id == data.booking_id).values(razorpay_order_id=razorpay_order['id']))
            
        await db.commit()
        return razorpay_order
    except Exception as e:
        raise HTTPException(400, f"Order creation failed: {str(e)}")

@router.post("/webhook")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    
    try:
        # Verify webhook signature
        client.utility.verify_webhook_signature(body.decode(), signature, settings.RAZORPAY_WEBHOOK_SECRET)
        data = json.loads(body)
        event = data.get("event")
        
        if event == "payment.captured" or event == "order.paid":
            payload = data['payload']['payment']['entity'] if 'payment' in data['payload'] else data['payload']['order']['entity']
            order_id = payload.get('order_id')
            
            # Find booking by order_id
            # Log event
            log = PaymentLog(booking_id=order_id, booking_type="webhook", event=f"webhook_{event}", data=data)
            db.add(log)
            
            # Process Theatre Booking
            res = await db.execute(select(TheatreBooking).filter(TheatreBooking.razorpay_order_id == order_id))
            booking = res.scalars().first()
            if booking and booking.status != "paid":
                # Finalize theatre booking
                res_b = await db.execute(select(Theatre).filter(Theatre.id == booking.theatre_id))
                business = res_b.scalars().first()
                commission = (booking.total_amount * business.commission_rate) / 100
                await db.execute(update(TheatreBooking).where(TheatreBooking.id == booking.id).values(
                    status="paid",
                    razorpay_payment_id=payload.get('id'),
                    commission_amount=commission,
                    paxly_gross_revenue=booking.platform_fee + commission,
                    payout_eligible_at=datetime.utcnow() + timedelta(hours=72)
                ))
            
            # Process Place Booking
            res = await db.execute(select(PlaceBooking).filter(PlaceBooking.razorpay_order_id == order_id))
            p_booking = res.scalars().first()
            if p_booking and p_booking.status != "paid":
                res_b = await db.execute(select(Place).filter(Place.id == p_booking.place_id))
                business = res_b.scalars().first()
                commission = (p_booking.total_amount * business.commission_rate) / 100
                await db.execute(update(PlaceBooking).where(PlaceBooking.id == p_booking.id).values(
                    status="paid",
                    razorpay_payment_id=payload.get('id'),
                    commission_amount=commission,
                    paxly_gross_revenue=p_booking.platform_fee + commission,
                    payout_eligible_at=datetime.utcnow() + timedelta(hours=72)
                ))
            
            await db.commit()
            
        return {"status": "ok"}
    except Exception as e:
        print(f"Webhook Error: {str(e)}")
        # Don't throw 400 to Razorpay, just log it internally
        return {"status": "error", "message": str(e)}

@router.post("/process-payout/{booking_id}")
async def process_payout(booking_id: str, booking_type: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.role != "admin": raise HTTPException(403, "Admin only")
    
    if booking_type == "theatre":
        res = await db.execute(select(TheatreBooking, User).join(Theatre, Theatre.id == TheatreBooking.theatre_id).join(User, User.id == Theatre.owner_id).filter(TheatreBooking.id == booking_id))
        result = res.first()
    else:
        res = await db.execute(select(PlaceBooking, User).join(Place, Place.id == PlaceBooking.place_id).join(User, User.id == Place.owner_id).filter(PlaceBooking.id == booking_id))
        result = res.first()

    if not result: raise HTTPException(404, "Booking not found")
    booking, partner = result

    if booking.payout_status == "settled": raise HTTPException(400, "Already settled")
    if booking.is_disputed: raise HTTPException(400, "Booking is disputed")
    if datetime.utcnow() < booking.payout_eligible_at: 
        diff = booking.payout_eligible_at - datetime.utcnow()
        raise HTTPException(400, f"Release protection active. Wait {int(diff.total_seconds()//3600)} more hours.")

    payout_amount = int((booking.total_amount - booking.commission_amount) * 100) # in paise

    try:
        # Final release log
        log = PaymentLog(booking_id=booking_id, booking_type=booking_type, event="payout_released", data={"amount": payout_amount, "partner": partner.name})
        db.add(log)
        
        if booking_type == "theatre":
            await db.execute(update(TheatreBooking).where(TheatreBooking.id == booking_id).values(payout_status="settled", payout_id="SIM_REL_"+str(uuid.uuid4())[:8]))
        else:
            await db.execute(update(PlaceBooking).where(PlaceBooking.id == booking_id).values(payout_status="settled", payout_id="SIM_REL_"+str(uuid.uuid4())[:8]))
        
        await db.commit()
        return {"status": "success", "message": f"₹{payout_amount/100} released to {partner.name}"}
    except Exception as e:
        raise HTTPException(500, f"Payout failed: {str(e)}")
