import requests

r_login = requests.post('https://paxly-lite.onrender.com/api/auth/login', json={"email": "vardaankatiyar0586@gmail.com", "password": "Password@123"})
print("Login status:", r_login.status_code)

if r_login.status_code == 200:
    token = r_login.json()["access_token"]
    r_me = requests.get('https://paxly-lite.onrender.com/api/auth/me', headers={"Authorization": f"Bearer {token}"})
    print("Me status:", r_me.status_code)
    print("Me response:", r_me.text)
else:
    print("Login failed:", r_login.text)
