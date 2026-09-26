import requests
r = requests.options('https://paxly-lite.onrender.com/api/auth/me', headers={'Origin': 'https://paxly-lite.vercel.app', 'Access-Control-Request-Method': 'GET'})
print(r.status_code)
print(r.headers)
