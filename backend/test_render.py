from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = "vlynxly-premium-secret-key-12345"
ALGORITHM = "HS256"

expire = datetime.utcnow() + timedelta(minutes=100)
to_encode = {"sub": "1", "exp": expire}
encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

print("TOKEN:", encoded_jwt)

import urllib.request
import json

url = "https://paxly-lite.onrender.com/api/ai/chat"
headers = {
    "Authorization": f"Bearer {encoded_jwt}",
    "Content-Type": "application/json"
}
data = {
    "messages": [
        {"role": "system", "content": "You are a test."},
        {"role": "user", "content": "Hello"}
    ]
}

req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
try:
    with urllib.request.urlopen(req) as response:
        print("RESPONSE:", response.read().decode())
except Exception as e:
    print("ERROR:", str(e))
    if hasattr(e, 'read'):
        print(e.read().decode())
