import asyncio
import logging
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "upmotion_logo.png"
LOGO_CID = "upmotion_logo"


class EmailService:
    """Thin SMTP wrapper (Hostinger). Every failure is caught and logged —
    a broken mailbox should never block employee creation, since the temp
    password is still returned to the caller as a fallback."""

    def _build_message(self, to_email: str, to_name: str, temp_password: str) -> MIMEMultipart:
        msg = MIMEMultipart("related")
        msg["Subject"] = "Welcome to ORBIT — your account has been created"
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = to_email

        login_url = settings.orbit_login_url
        first_name = (to_name or "").split(" ")[0] or to_name

        text_body = (
            f"Hello {first_name},\n\n"
            "Welcome to Upmotion Tech.\n\n"
            "Your ORBIT account has been created.\n\n"
            f"Login URL:\n{login_url}\n\n"
            f"Email:\n{to_email}\n\n"
            f"Temporary Password:\n{temp_password}\n\n"
            "For security reasons, you will be required to change your password the first time you sign in.\n\n"
            "Regards,\nUpmotion Tech"
        )

        has_logo = LOGO_PATH.exists()
        logo_html = (
            f'<img src="cid:{LOGO_CID}" alt="Upmotion Tech" style="height:38px;margin-bottom:22px;display:block" />'
            if has_logo else ""
        )
        # Deliberately plain — normal paragraphs, no card/button/gradient
        # template. Just the same text as the plain-text part, formatted.
        html_body = f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#1a1a2e;max-width:480px;margin:0 auto;padding:28px 4px">
  {logo_html}
  <p style="margin:0 0 14px">Hello {first_name},</p>
  <p style="margin:0 0 14px">Welcome to Upmotion Tech.</p>
  <p style="margin:0 0 18px">Your ORBIT account has been created.</p>
  <p style="margin:0 0 14px">Login URL:<br><a href="{login_url}" style="color:#4F46E5">{login_url}</a></p>
  <p style="margin:0 0 14px">Email:<br>{to_email}</p>
  <p style="margin:0 0 18px">Temporary Password:<br><strong>{temp_password}</strong></p>
  <p style="margin:0 0 18px">For security reasons, you will be required to change your password the first time you sign in.</p>
  <p style="margin:0">Regards,<br>Upmotion Tech</p>
</div>
"""

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(text_body, "plain"))
        alt.attach(MIMEText(html_body, "html"))
        msg.attach(alt)

        if has_logo:
            with open(LOGO_PATH, "rb") as f:
                logo = MIMEImage(f.read())
            logo.add_header("Content-ID", f"<{LOGO_CID}>")
            logo.add_header("Content-Disposition", "inline", filename="upmotion_logo.png")
            msg.attach(logo)

        return msg

    def _send_sync(self, to_email: str, to_name: str, temp_password: str) -> bool:
        if not (settings.smtp_host and settings.smtp_username and settings.smtp_password and settings.smtp_from_email):
            logger.warning("SMTP not configured — skipping welcome email to %s", to_email)
            return False

        msg = self._build_message(to_email, to_name, temp_password)
        try:
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                    server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                    server.starttls()
                    server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(msg)
            return True
        except Exception:
            logger.exception("Failed to send welcome email to %s", to_email)
            return False

    async def send_welcome_email(self, to_email: str, to_name: str, temp_password: str) -> bool:
        return await asyncio.to_thread(self._send_sync, to_email, to_name, temp_password)
