import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

class EmailService:
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER if hasattr(settings, "SMTP_SERVER") else "smtp.gmail.com"
        self.smtp_port = settings.SMTP_PORT if hasattr(settings, "SMTP_PORT") else 587
        self.smtp_user = settings.SMTP_USER if hasattr(settings, "SMTP_USER") else ""
        self.smtp_password = settings.SMTP_PASSWORD if hasattr(settings, "SMTP_PASSWORD") else ""
        self.sender_email = settings.SENDER_EMAIL if hasattr(settings, "SENDER_EMAIL") else "support@vlynxly.com"

    async def send_reset_link(self, email: str, name: str, reset_link: str):
        """Sends a beautiful recovery email to the user."""
        subject = "Secure Your Sanctuary: Password Recovery"
        
        # HTML Content in Vlynxly Premium Style
        html = f"""
        <div style="background-color: #050505; color: #fff; padding: 40px; font-family: serif; text-align: center;">
            <h1 style="color: #c9a96e; font-size: 28px;">Vlynxly</h1>
            <p style="color: #c9a96e; letter-spacing: 3px; font-size: 12px; text-transform: uppercase;">Together We Better</p>
            
            <div style="margin-top: 40px; margin-bottom: 40px; padding: 30px; background: rgba(255,255,255,0.03); border: 1px solid rgba(201,169,110,0.2); border-radius: 20px;">
                <h2 style="font-weight: 200;">Hello {name},</h2>
                <p style="color: rgba(255,255,255,0.6); line-height: 1.6;">
                    We received a request to recover access to your private space. <br/>
                    Click the gold button below to set a new secure password.
                </p>
                <a href="{reset_link}" style="display: inline-block; margin-top: 20px; padding: 15px 30px; background-color: #c9a96e; color: #000; text-decoration: none; border-radius: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                    Reset Password
                </a>
                <p style="margin-top: 30px; font-size: 11px; color: rgba(255,255,255,0.3);">
                    This link will expire in 30 minutes. If you didn't request this, please ignore this email.
                </p>
            </div>
            
            <p style="font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 2px;">
                E2E ENCRYPTED • PRIVATE BY DESIGN • VLYNXLY
            </p>
        </div>
        """
        await self._send_email(email, subject, html)

    async def send_password_change_confirmation(self, email: str, name: str):
        """Sends a success notification after a successful password reset."""
        subject = "Security Alert: Password Successfully Updated"
        
        html = f"""
        <div style="background-color: #050505; color: #fff; padding: 40px; font-family: serif; text-align: center;">
            <h1 style="color: #c9a96e; font-size: 28px;">Vlynxly</h1>
            <p style="color: #c9a96e; letter-spacing: 3px; font-size: 12px; text-transform: uppercase;">Together We Better</p>
            
            <div style="margin-top: 40px; margin-bottom: 40px; padding: 30px; background: rgba(255,255,255,0.03); border: 1px solid rgba(201,169,110,0.2); border-radius: 20px;">
                <h2 style="font-weight: 200; color: #c9a96e;">✓ Password Changed</h2>
                <p style="color: rgba(255,255,255,0.6); line-height: 1.6;">
                    Hello {name}, <br/><br/>
                    This is a confirmation that your Vlynxly password has been successfully updated. <br/>
                    Your sanctuary remains secure and encrypted.
                </p>
                <p style="margin-top: 30px; font-size: 11px; color: rgba(255,255,255,0.3);">
                    If you did not perform this action, please contact Vlynxly Support immediately to secure your account.
                </p>
            </div>
            
            <p style="font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 2px;">
                YOUR PRIVATE OASIS • VLYNXLY SECURITY
            </p>
        </div>
        </div>
        """
        await self._send_email(email, subject, html)

    async def send_error_alert(self, admin_email: str, error_message: str, stack_trace: str, source: str):
        """Sends a critical error alert to the admin with the exact stack trace."""
        subject = f"🚨 VLYNXLY ALERT: Critical Crash in {source}"
        
        # Convert stack trace to HTML safe format
        import html as html_lib
        safe_stack_trace = html_lib.escape(stack_trace).replace('\\n', '<br>')
        
        html = f"""
        <div style="background-color: #1a0505; color: #fff; padding: 30px; font-family: monospace;">
            <h2 style="color: #ff4d4d; border-bottom: 1px solid #ff4d4d; padding-bottom: 10px;">🚨 CRITICAL APP CRASH ({source})</h2>
            <p style="font-size: 16px; color: #ff9999;"><strong>Error:</strong> {html_lib.escape(error_message)}</p>
            <div style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; border: 1px solid #333; margin-top: 20px; overflow-x: auto;">
                <p style="color: #888; font-size: 12px; margin-bottom: 10px;">Exact Stack Trace & Line Number:</p>
                <code style="color: #f0f0f0; font-size: 13px; line-height: 1.5;">{safe_stack_trace}</code>
            </div>
            <p style="margin-top: 30px; font-size: 11px; color: #666;">Automated by Vlynxly Real-Time Sentry Monitor</p>
        </div>
        """
        await self._send_email(admin_email, subject, html)

    async def _send_email(self, to_email: str, subject: str, html_content: str):
        """Core logic to send email using SMTP."""
        if not self.smtp_user or not self.smtp_password:
            print(f"DEBUG: Email would be sent to {to_email} with subject '{subject}'")
            return

        msg = MIMEMultipart()
        msg['From'] = self.sender_email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_content, 'html'))

        import asyncio
        
        def blocking_send():
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            server.send_message(msg)
            server.quit()

        try:
            await asyncio.to_thread(blocking_send)
        except Exception as e:
            print(f"FAILED TO SEND EMAIL: {e}")

email_service = EmailService()
