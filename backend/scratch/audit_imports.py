import os
import re

routes_dir = r"c:\projects\ros2\backend\app\api\routes"
files = [f for f in os.listdir(routes_dir) if f.endswith(".py")]

keywords = ["Optional", "List", "Dict", "Any", "Union"]
fastapi_keywords = ["File", "UploadFile", "Form", "Body", "Header", "Cookie", "BackgroundTasks"]

results = []

for filename in files:
    path = os.path.join(routes_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    missing = []
    
    # Check typing
    for kw in keywords:
        if re.search(fr"\b{kw}\b", content) and f"import {kw}" not in content and f", {kw}" not in content:
             missing.append(kw)
    
    # Check fastapi
    for kw in fastapi_keywords:
         if re.search(fr"\b{kw}\b", content) and f"import {kw}" not in content and f", {kw}" not in content:
             missing.append(kw)
             
    if missing:
        results.append((filename, missing))

for file, miss in results:
    print(f"FILE: {file} | MISSING: {', '.join(miss)}")
