from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, or_
import stripe, uuid
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.models.orm import User, Product, Order, Wishlist
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/shop", tags=["Shop"])

def get_stripe():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe

# ── Product Models ─────────────────────────
class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    category: str
    emoji: Optional[str] = "🎁"
    stock: Optional[int] = 100
    images: Optional[List[str]] = []

class OrderCreate(BaseModel):
    product_id: str
    quantity: int = 1
    delivery_address: str
    gift_message: Optional[str] = ""
    is_surprise: Optional[bool] = False

# ── Products ───────────────────────────────
@router.get("/products")
async def get_products(category: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Product).filter(Product.active == True)
    if category:
        query = query.filter(Product.category == category)
    result = await db.execute(query.order_by(Product.created_at.desc()))
    return result.scalars().all()

@router.get("/products/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).filter(Product.id == product_id))
    p = result.scalars().first()
    if not p:
        raise HTTPException(404, "Product not found.")
    return p

# ── Admin: Add Product ─────────────────────
@router.post("/admin/products")
async def add_product(data: ProductCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    new_product = Product(
        id=str(uuid.uuid4()),
        **data.dict(),
        created_by=cu.id
    )
    db.add(new_product)
    await db.commit()
    await db.refresh(new_product)
    return new_product

@router.post("/orders")
async def place_order(data: OrderCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).filter(Product.id == data.product_id))
    p = result.scalars().first()
    if not p:
        raise HTTPException(404, "Product not found.")
    
    order_id = str(uuid.uuid4())[:8].upper()
    new_order = Order(
        id=order_id,
        couple_space_id=cu.couple_space_id,
        buyer_id=cu.id,
        buyer_name=cu.name,
        product_id=p.id,
        product_name=p.name,
        product_emoji=p.emoji,
        quantity=data.quantity,
        amount=p.price * data.quantity,
        delivery_address=data.delivery_address,
        gift_message=data.gift_message,
        is_surprise=data.is_surprise,
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)
    return new_order

@router.get("/orders")
async def get_orders(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(Order).filter(or_(Order.buyer_id == cu.id, Order.couple_space_id == cu.couple_space_id))
    result = await db.execute(query.order_by(Order.created_at.desc()))
    return result.scalars().all()

@router.post("/wishlist/{product_id}")
async def add_wishlist(product_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    new_item = Wishlist(user_id=cu.id, product_id=product_id)
    db.add(new_item)
    await db.commit()
    return {"ok": True}

@router.delete("/wishlist/{product_id}")
async def remove_wishlist(product_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Wishlist).filter(Wishlist.user_id == cu.id, Wishlist.product_id == product_id))
    await db.commit()
    return {"ok": True}

@router.get("/wishlist")
async def get_wishlist(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Wishlist).filter(Wishlist.user_id == cu.id))
    items = result.scalars().all()
    product_ids = [i.product_id for i in items]
    if not product_ids:
        return []
    result = await db.execute(select(Product).filter(Product.id.in_(product_ids)))
    return result.scalars().all()
