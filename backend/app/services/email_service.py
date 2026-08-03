"""
Email service — uses Python's built-in smtplib.
All SMTP errors are caught and logged; they are NEVER propagated to HTTP clients.
This keeps a mis-configured mail server from breaking the registration flow.

Provider-agnostic: change SMTP_* env vars to switch between Gmail, SendGrid,
Mailgun, SES SMTP interface, etc. — no code change required.
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """
    Send a single HTML email.
    Returns True on success, False on any SMTP error (error is logged).
    """
    if not settings.smtp_username or not settings.smtp_password:
        # No SMTP credentials configured — log the OTP to console for dev convenience
        logger.warning(
            "[EMAIL STUB] No SMTP credentials configured. "
            "Would send to=%s subject=%r",
            to_email,
            subject,
        )
        logger.info("[EMAIL STUB] Body:\n%s", html_body)
        
        # Write to a file so the user can easily find it
        try:
            with open("LATEST_OTP.txt", "w", encoding="utf-8") as f:
                f.write(f"To: {to_email}\nSubject: {subject}\n\n{html_body}")
        except Exception as e:
            logger.error("Failed to write OTP to file: %s", e)
            
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)

        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())
        server.quit()

        logger.info("Email sent successfully to %s (subject: %r)", to_email, subject)
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed for %s. "
            "Check SMTP_USERNAME / SMTP_PASSWORD (for Gmail: use an App Password).",
            settings.smtp_username,
        )
    except smtplib.SMTPConnectError:
        logger.error(
            "Could not connect to SMTP server %s:%s",
            settings.smtp_host,
            settings.smtp_port,
        )
    except smtplib.SMTPException as exc:
        logger.error("SMTP error sending to %s: %s", to_email, exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected error sending email to %s: %s", to_email, exc)

    return False


def send_otp_email(to_email: str, otp_code: str, full_name: str = "") -> bool:
    """Send an OTP verification email."""
    greeting = f"Hi {full_name}," if full_name else "Hi,"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background:#0f1418; color:#dee3e8; margin:0; padding:0; }}
        .container {{ max-width:520px; margin:40px auto; background:#1b2026; border:1px solid #3e484f; border-radius:12px; overflow:hidden; }}
        .header {{ background:#0a0f12; padding:32px 40px; text-align:center; border-bottom:1px solid #3e484f; }}
        .logo {{ font-size:22px; font-weight:700; color:#dee3e8; letter-spacing:-0.02em; }}
        .logo span {{ color:#8ed5ff; }}
        .body {{ padding:40px; }}
        .greeting {{ font-size:14px; color:#bdc8d1; margin-bottom:16px; }}
        .message {{ font-size:14px; color:#bdc8d1; margin-bottom:32px; line-height:1.6; }}
        .otp-box {{ background:#0a0f12; border:1px solid #3e484f; border-radius:8px; padding:24px; text-align:center; margin-bottom:32px; }}
        .otp-code {{ font-family:'JetBrains Mono', monospace; font-size:36px; font-weight:700; letter-spacing:0.2em; color:#8ed5ff; }}
        .expiry {{ font-size:12px; color:#87929a; margin-top:12px; }}
        .footer {{ padding:24px 40px; border-top:1px solid #3e484f; text-align:center; font-size:11px; color:#87929a; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Dev<span>Pulse</span></div>
        </div>
        <div class="body">
          <div class="greeting">{greeting}</div>
          <div class="message">
            Use the verification code below to confirm your email address.
            This code expires in <strong>10 minutes</strong>.
          </div>
          <div class="otp-box">
            <div class="otp-code">{otp_code}</div>
            <div class="expiry">Expires in 10 minutes · Do not share this code</div>
          </div>
          <div class="message" style="font-size:12px; color:#87929a;">
            If you did not create a DevPulse account, you can safely ignore this email.
          </div>
        </div>
        <div class="footer">© 2026 DevPulse · For developers, by developers.</div>
      </div>
    </body>
    </html>
    """
    return send_email(to_email, "Your DevPulse verification code", html)


def send_password_reset_email(to_email: str, otp_code: str, full_name: str = "") -> bool:
    """Send an OTP email for password reset."""
    greeting = f"Hi {full_name}," if full_name else "Hi,"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background:#0f1418; color:#dee3e8; margin:0; padding:0; }}
        .container {{ max-width:520px; margin:40px auto; background:#1b2026; border:1px solid #3e484f; border-radius:12px; overflow:hidden; }}
        .header {{ background:#0a0f12; padding:32px 40px; text-align:center; border-bottom:1px solid #3e484f; }}
        .logo {{ font-size:22px; font-weight:700; color:#dee3e8; letter-spacing:-0.02em; }}
        .logo span {{ color:#8ed5ff; }}
        .body {{ padding:40px; }}
        .greeting {{ font-size:14px; color:#bdc8d1; margin-bottom:16px; }}
        .message {{ font-size:14px; color:#bdc8d1; margin-bottom:32px; line-height:1.6; }}
        .otp-box {{ background:#0a0f12; border:1px solid #3e484f; border-radius:8px; padding:24px; text-align:center; margin-bottom:32px; }}
        .otp-code {{ font-family:'JetBrains Mono', monospace; font-size:36px; font-weight:700; letter-spacing:0.2em; color:#8ed5ff; }}
        .expiry {{ font-size:12px; color:#87929a; margin-top:12px; }}
        .footer {{ padding:24px 40px; border-top:1px solid #3e484f; text-align:center; font-size:11px; color:#87929a; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Dev<span>Pulse</span></div>
        </div>
        <div class="body">
          <div class="greeting">{greeting}</div>
          <div class="message">
            Use the verification code below to reset your DevPulse password.
            This code expires in <strong>10 minutes</strong>.
          </div>
          <div class="otp-box">
            <div class="otp-code">{otp_code}</div>
            <div class="expiry">Expires in 10 minutes · Do not share this code</div>
          </div>
          <div class="message" style="font-size:12px; color:#87929a;">
            If you did not request a password reset, you can safely ignore this email.
          </div>
        </div>
        <div class="footer">© 2026 DevPulse · For developers, by developers.</div>
      </div>
    </body>
    </html>
    """
    return send_email(to_email, "DevPulse password reset code", html)
