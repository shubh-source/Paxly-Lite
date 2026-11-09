from fastapi import APIRouter, Request, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.email_service import email_service
from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
from app.models.orm import SystemErrorLog
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/health", tags=["Health & Monitoring"])

class ClientErrorReport(BaseModel):
    error: str
    componentStack: Optional[str] = None
    url: Optional[str] = None

@router.get("/ping")
async def ping():
    """Lightweight endpoint to wake up and keep the server alive."""
    return {"status": "ok", "message": "Server is awake"}

@router.post("/report-client-error")
async def report_client_error(report: ClientErrorReport, request: Request, background_tasks: BackgroundTasks):
    """Endpoint for React ErrorBoundary to report crashes in real-time."""
    admin_email = getattr(settings, "ADMIN_EMAIL", "shubhkatiyar6513@gmail.com")
    
    # Format the stack trace nicely
    stack = report.componentStack if report.componentStack else "No stack trace provided"
    url = report.url if report.url else "Unknown URL"
    formatted_stack = f"URL: {url}\n\nComponent Stack:\n{stack}"
    client_ip = request.client.host if request.client else "unknown"

    # Save to Database in background or direct session
    try:
        async with AsyncSessionLocal() as db:
            new_log = SystemErrorLog(
                error_message=report.error,
                stack_trace=formatted_stack,
                source="Frontend (React)",
                url=url,
                ip_address=client_ip
            )
            db.add(new_log)
            await db.commit()
    except Exception as e:
        print(f"Failed to persist error log: {e}")
    
    # Dispatch alert email in background
    background_tasks.add_task(
        email_service.send_error_alert,
        admin_email=admin_email,
        error_message=report.error,
        stack_trace=formatted_stack,
        source="Frontend (React)"
    )
    
    return {"status": "reported"}

@router.get("/crash-test")
async def crash_test():
    """Endpoint to test the Sentry-style error monitor."""
    # This will trigger a ZeroDivisionError which should be caught by global_exception_handler
    return 1 / 0


import smtplib

@router.get("/smtp-diag")
async def smtp_diag(to: str = "shubhkatiyar0109@gmail.com"):
    """Diagnostic endpoint to test live SMTP connection on Render."""
    logs = []
    user = email_service.smtp_user
    pwd = email_service.smtp_password
    logs.append(f"User: {user}, Pwd length: {len(pwd) if pwd else 0}")
    
    from app.services.email_service import IPv4ForcedSocket
    # 1. Test Port 465
    try:
        with IPv4ForcedSocket():
            s465 = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10)
            s465.login(user, pwd)
            s465.quit()
        logs.append("Port 465 SSL Login (IPv4): SUCCESS")
    except Exception as e:
        logs.append(f"Port 465 SSL Login FAILED: {type(e).__name__}: {e}")

    # 2. Test Port 587
    try:
        with IPv4ForcedSocket():
            s587 = smtplib.SMTP("smtp.gmail.com", 587, timeout=10)
            s587.starttls()
            s587.login(user, pwd)
            s587.quit()
        logs.append("Port 587 STARTTLS Login (IPv4): SUCCESS")
    except Exception as e:
        logs.append(f"Port 587 STARTTLS Login FAILED: {type(e).__name__}: {e}")

    # 3. Test sending actual email
    try:
        await email_service.send_signup_otp(to, "Diagnostic Test", "999888")
        logs.append(f"send_signup_otp to {to}: DISPATCHED SUCCESSFULLY")
    except Exception as e:
        logs.append(f"send_signup_otp FAILED: {type(e).__name__}: {e}")

    return {"status": "diag_complete", "logs": logs}
    
