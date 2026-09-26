import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from app.core.security import create_access_token
import requests

token = create_access_token({"sub": "87043256-a25c-4f51-a9d2-340163f35750"})
print(f"Token: {token}")

r = requests.get('https://paxly-lite.onrender.com/api/auth/me', headers={"Authorization": f"Bearer {token}"})
print(r.status_code)
print(r.text)
