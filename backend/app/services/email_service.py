import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

class EmailService:
    @property
    def smtp_server(self):
        return os.environ.get("SMTP_SERVER", getattr(settings, "SMTP_SERVER", "smtp.gmail.com"))

    @property
    def smtp_port(self):
        try:
            return int(os.environ.get("SMTP_PORT", getattr(settings, "SMTP_PORT", 587)))
        except Exception:
            return 587

    @property
    def smtp_user(self):
        return os.environ.get("SMTP_USER") or getattr(settings, "SMTP_USER", "") or "vlynxlyofficial@gmail.com"

    @property
    def smtp_password(self):
        return os.environ.get("SMTP_PASSWORD") or getattr(settings, "SMTP_PASSWORD", "") or "esuzwnsyujgjlelc"

    @property
    def sender_email(self):
        return os.environ.get("SENDER_EMAIL") or getattr(settings, "SENDER_EMAIL", "") or self.smtp_user

    async def send_reset_link(self, email: str, name: str, reset_link: str):
        """Sends a beautiful recovery email to the user."""
        subject = "Secure Your Sanctuary: Password Recovery"
        if not self.smtp_user or not self.smtp_password:
            print(f"\n[DEV MODE PASSWORD RESET] To: {email} | Reset Link: {reset_link}\n", flush=True)
        
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

    async def send_signup_otp(self, email: str, name: str, otp: str):
        """Sends a 6-digit verification code to verify a new user's Gmail."""
        subject = f"{otp} is your Paxly verification code"
        if not self.smtp_user or not self.smtp_password:
            print(f"\n[DEV MODE SIGNUP OTP] To: {email} | OTP: {otp}\n", flush=True)

        html = f"""
        <div style="background-color: #050505; color: #fff; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center;">
            <h1 style="color: #c9a96e; font-size: 26px; letter-spacing: 3px; font-family: serif; margin-bottom: 5px;">PAXLY</h1>
            <p style="color: #c9a96e; letter-spacing: 2px; font-size: 11px; text-transform: uppercase; margin-top: 0;">Private World for Two</p>
            
            <div style="margin: 35px auto; max-width: 460px; padding: 32px; background: rgba(255,255,255,0.03); border: 1px solid rgba(201,169,110,0.25); border-radius: 20px;">
                <h2 style="font-weight: 300; font-size: 20px; color: #fff; margin-top: 0;">Verify Your Gmail Address</h2>
                <p style="color: rgba(255,255,255,0.65); line-height: 1.6; font-size: 14px;">
                    Hello <strong>{name or 'there'}</strong>,<br/>
                    Enter this 6-digit verification code to complete your signup and secure your account:
                </p>
                
                <div style="margin: 25px auto; padding: 16px 24px; background: #0d0b08; border: 1px dashed #c9a96e; border-radius: 12px; display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #c9a96e;">
                    {otp}
                </div>
                
                <p style="margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.4); line-height: 1.5;">
                    This code will expire in <strong>10 minutes</strong>.<br/>
                    If you did not request this, you can safely ignore this email.
                </p>
            </div>
            
            <p style="font-size: 11px; color: rgba(255,255,255,0.25); letter-spacing: 2px;">
                END-TO-END ENCRYPTED • PRIVACY BY DESIGN • PAXLY
            </p>
        </div>
        """
        await self._send_email(email, subject, html)

    async def _send_email(self, to_email: str, subject: str, html_content: str):
        """Core logic to send email using SMTP."""
        if not self.smtp_user or not self.smtp_password:
            print(f"DEBUG: Email would be sent to {to_email} with subject '{subject}'")
            return

        sender = self.sender_email or self.smtp_user or "vlynxlyofficial@gmail.com"
        msg = MIMEMultipart()
        msg['From'] = f"Paxly <{sender}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_content, 'html'))

        import asyncio
        
        def blocking_send():
            errors = []
            # Try Port 465 (SSL) first - standard for cloud environments
            try:
                print(f"DEBUG: Attempting SSL connection on port 465 to {self.smtp_server} for {to_email}...", flush=True)
                server = smtplib.SMTP_SSL(self.smtp_server, 465, timeout=12)
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
                server.quit()
                print(f"DEBUG: Email successfully sent to {to_email} via Port 465 SSL!", flush=True)
                return
            except Exception as e465:
                errors.append(f"Port 465 SSL failed: {e465}")
                print(f"DEBUG: Port 465 SSL failed ({e465}), trying Port 587...", flush=True)

            # Fallback to Port 587 (STARTTLS)
            try:
                server = smtplib.SMTP(self.smtp_server, 587, timeout=12)
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
                server.quit()
                print(f"DEBUG: Email successfully sent to {to_email} via Port 587 STARTTLS!", flush=True)
                return
            except Exception as e587:
                errors.append(f"Port 587 STARTTLS failed: {e587}")
                raise RuntimeError("; ".join(errors))

        try:
            await asyncio.to_thread(blocking_send)
        except Exception as e:
            err_msg = f"FAILED TO SEND EMAIL to {to_email}: {e}"
            print(err_msg, flush=True)
            try:
                from app.core.database import AsyncSessionLocal
                from app.models.orm import SystemErrorLog
                import traceback
                async with AsyncSessionLocal() as db_session:
                    db_session.add(SystemErrorLog(
                        error_message=err_msg,
                        stack_trace=traceback.format_exc(),
                        source="Backend (EmailService)"
                    ))
                    await db_session.commit()
            except Exception as log_err:
                print(f"Error saving to SystemErrorLog: {log_err}", flush=True)

email_service = EmailService()
