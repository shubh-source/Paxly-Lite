import requests
import json

BASE_URL = "https://paxly-lite.onrender.com/api"

def test_auth():
    print("--- TESTING SIGNUP ---")
    signup_data = {
        "name": "Test User",
        "email": "test_auth_final@vlynxly.com",
        "password": "Password123!",
        "role": "user"
    }
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json=signup_data)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
        
        if r.status_code in [201, 200] or "already registered" in r.text:
            print("\n--- TESTING LOGIN ---")
            login_data = {
                "email": "test_auth_final@vlynxly.com",
                "password": "Password123!"
            }
            rl = requests.post(f"{BASE_URL}/auth/login", json=login_data)
            print(f"Status: {rl.status_code}")
            print(f"Response: {rl.text}")
            
            if rl.status_code == 200:
                print("\n✅ RESULT: Signup and Login are working perfectly on Live Backend!")
            else:
                print("\n❌ RESULT: Login failed.")
        else:
            print("\n❌ RESULT: Signup failed.")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_auth()
