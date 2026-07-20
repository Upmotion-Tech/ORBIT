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
        logo_row = f"""\
            <tr>
              <td align="center" style="padding:36px 40px 20px 40px">
                <img src="cid:{LOGO_CID}" alt="Upmotion Tech" width="150" style="display:block;height:auto;border:0;outline:none;text-decoration:none" />
              </td>
            </tr>
""" if has_logo else ""

        # Table-based layout on purpose (not flex/grid) — this is an actual
        # email, not a browser page, and Outlook desktop's Word rendering
        # engine ignores modern CSS layout; tables + inline styles are the
        # one thing every major mail client renders consistently.
        html_body = f"""\
<div style="background:#F0F2F7;padding:32px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E5E7F0">
          <tr>
            <td style="background:linear-gradient(135deg,#4F46E5,#6366F1);height:6px;line-height:6px;font-size:0">&nbsp;</td>
          </tr>
{logo_row}
          <tr>
            <td style="padding:0 40px">
              <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111318">Welcome, {first_name}.</p>
              <p style="margin:0 0 8px;font-size:14.5px;line-height:1.6;color:#3A3D46">Welcome to Upmotion Tech — your ORBIT account has been created and is ready to use.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px 40px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F8FC;border:1px solid #E5E7F0;border-radius:10px">
                <tr>
                  <td style="padding:18px 22px">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A8DA0">Email</p>
                    <p style="margin:0 0 16px;font-size:14.5px;font-weight:600;color:#111318">{to_email}</p>
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A8DA0">Temporary Password</p>
                    <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:16px;font-weight:700;color:#4F46E5;letter-spacing:.03em">{temp_password}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 40px 8px 40px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:9px;background:#4F46E5">
                    <a href="{login_url}" style="display:inline-block;padding:13px 34px;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px">Log in to ORBIT</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:12.5px;color:#8A8DA0">or paste this link into your browser:<br>
                <a href="{login_url}" style="color:#4F46E5;text-decoration:none;word-break:break-all">{login_url}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 4px 40px">
              <p style="margin:0;font-size:12.5px;line-height:1.6;color:#8A8DA0">For security reasons, you will be required to change your password the first time you sign in.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px 40px;border-top:1px solid #EEF0F6">
              <p style="margin:20px 0 0;font-size:13.5px;color:#3A3D46">Regards,<br><strong style="color:#111318">Upmotion Tech</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
