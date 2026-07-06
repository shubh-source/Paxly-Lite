from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.email_service import email_service
from app.core.config import settings

router = APIRouter(prefix="/health", tags=["Health & Monitoring"])

class ClientErrorReport(BaseModel):
    error: str
    componentStack: Optional[str] = None
    url: Optional[str] = None

@router.post("/report-client-error")
async def report_client_error(report: ClientErrorReport, background_tasks: BackgroundTasks):
    """Endpoint for React ErrorBoundary to report crashes in real-time."""
    admin_email = getattr(settings, "ADMIN_EMAIL", "vardaankatiyar0586@gmail.com")
    
    # Format the stack trace nicely
    stack = report.componentStack if report.componentStack else "No stack trace provided"
    url = report.url if report.url else "Unknown URL"
    
    formatted_stack = f"URL: {url}\n\nComponent Stack:\n{stack}"
    
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

