from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime
from typing import Optional, List
import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.models.orm import User, Place
from app.core.security import get_current_user
from app.core.database import get_db

router = APIRouter(prefix="/explore", tags=["Explore"])

SEED_PLACES = [
    {"name": "The Cozy Corner Café", "category": "cafe", "address": "MG Road, Bangalore", "rating": 4.5, "description": "Perfect for quiet mornings with your partner. Great filter coffee.", "latitude": 12.9758, "longitude": 77.6095},
    {"name": "Brewbird Coffee", "category": "cafe", "address": "Koramangala, Bangalore", "rating": 4.3, "description": "Artisan coffee and freshly baked pastries.", "latitude": 12.9352, "longitude": 77.6245},
    {"name": "The Reading Room", "category": "cafe", "address": "Indiranagar, Bangalore", "rating": 4.7, "description": "Books, coffee, and calm vibes. Perfect date spot.", "latitude": 12.9784, "longitude": 77.6408},
    {"name": "Candlelight Garden", "category": "restaurant", "address": "HSR Layout, Bangalore", "rating": 4.6, "description": "Open-air dining with fairy lights. Romantic evening setting.", "latitude": 12.9121, "longitude": 77.6446},
    {"name": "Spice Route", "category": "restaurant", "address": "JP Nagar, Bangalore", "rating": 4.4, "description": "Authentic Indian cuisine in a beautiful heritage setting.", "latitude": 12.9063, "longitude": 77.5857},
    {"name": "The Rooftop Kitchen", "category": "restaurant", "address": "Whitefield, Bangalore", "rating": 4.5, "description": "Panoramic city views with fusion food.", "latitude": 12.9698, "longitude": 77.7500},
    {"name": "Cubbon Park", "category": "park", "address": "Kasturba Road, Bangalore", "rating": 4.6, "description": "300 acres of lush greenery. Perfect for a morning walk together.", "latitude": 12.9763, "longitude": 77.5929},
    {"name": "Lalbagh Botanical Garden", "category": "park", "address": "Mavalli, Bangalore", "rating": 4.7, "description": "Beautiful botanical gardens with a glasshouse. Great for photos.", "latitude": 12.9507, "longitude": 77.5848},
    {"name": "Sankey Tank", "category": "park", "address": "Sadashivanagar, Bangalore", "rating": 4.3, "description": "Peaceful lake with walking path and evening views.", "latitude": 13.0048, "longitude": 77.5721},
    {"name": "PVR Cinemas", "category": "movie_theater", "address": "Forum Mall, Koramangala", "rating": 4.2, "description": "Premium cinema experience with recliner seats.", "latitude": 12.9341, "longitude": 77.6101},
    {"name": "INOX Garuda Mall", "category": "movie_theater", "address": "Magrath Road, Bangalore", "rating": 4.1, "description": "Great sound system and comfortable seating.", "latitude": 12.9716, "longitude": 77.6093},
    {"name": "Cinepolis", "category": "movie_theater", "address": "Nexus Mall, Whitefield", "rating": 4.3, "description": "Modern multiplex with the latest releases.", "latitude": 12.9648, "longitude": 77.7534},
]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

async def ensure_seeded(db: AsyncSession):
    # Check if any places exist
    res = await db.execute(select(func.count(Place.id)))
    count = res.scalar()
    if count == 0:
        for p in SEED_PLACES:
            new_p = Place(**p)
            db.add(new_p)
        await db.commit()

@router.get("/places")
async def get_places(
    category: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 50,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_seeded(db)
    query = select(Place)
    if category:
        query = query.filter(Place.category == category)
    
    result = await db.execute(query.limit(100))
    places = result.scalars().all()
    
    res_list = []
    for p in places:
        dist = None
        if lat is not None and lng is not None and p.latitude is not None and p.longitude is not None:
            dist = haversine(lat, lng, p.latitude, p.longitude)
            if dist > radius_km:
                continue
                
        res_list.append({
            "id": str(p.id),
            "name": p.name,
            "category": p.category,
            "address": p.address or "",
            "rating": p.rating,
            "description": p.description or "",
            "latitude": p.latitude,
            "longitude": p.longitude,
            "image_url": p.image_url,
            "distance_km": round(dist, 1) if dist is not None else None,
        })
        
    if lat is not None and lng is not None:
        res_list.sort(key=lambda x: x["distance_km"] or 999)
    else:
        res_list.sort(key=lambda x: x["rating"] or 0, reverse=True)
        
    return res_list

@router.get("/categories")
async def get_categories(cu: User = Depends(get_current_user)):
    return [
        {"key": "cafe",          "label": "Cafés",          "icon": "☕"},
        {"key": "restaurant",    "label": "Restaurants",    "icon": "🍽️"},
        {"key": "park",          "label": "Parks",          "icon": "🌿"},
        {"key": "movie_theater", "label": "Movie Theaters", "icon": "🎬"},
    ]

@router.get("/places/{place_id}")
async def get_place(place_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Place).filter(Place.id == place_id))
    p = result.scalars().first()
    if not p:
        raise HTTPException(404, "Place not found.")
    return {
        "id": str(p.id),
        "name": p.name,
        "category": p.category,
        "address": p.address or "",
        "rating": p.rating,
        "description": p.description or "",
        "latitude": p.latitude,
        "longitude": p.longitude,
        "image_url": p.image_url,
    }
