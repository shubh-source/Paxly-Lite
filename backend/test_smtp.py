import smtplib

try:
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.set_debuglevel(1)
    server.starttls()
    server.quit()
    print("SMTP Connection OK")
except Exception as e:
    print(f"SMTP Connection FAILED: {e}")
