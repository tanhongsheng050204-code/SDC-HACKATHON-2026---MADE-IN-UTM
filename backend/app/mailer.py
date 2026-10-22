"""Sends email through SMTP (a team Gmail with an app password). Without SMTP settings nothing is
sent: callers check settings.email_available first, and tests replace send() with a recorder.

Every message carries List-Unsubscribe and List-Unsubscribe-Post headers, so Gmail and others show
their own one-click unsubscribe button, which posts to the API without a login.
"""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.config import get_settings


class EmailUnavailable(RuntimeError):
    pass


def build(to: str, subject: str, text: str, html: str, unsubscribe_url: str) -> EmailMessage:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = formataddr(("Laluan", settings.mail_from))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=(settings.mail_from.split("@")[-1] or "laluan.local"))
    message["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


def send(message: EmailMessage) -> None:
    settings = get_settings()
    if not settings.email_available:
        raise EmailUnavailable("Email is not set up on this server")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
