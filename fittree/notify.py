"""Delivering the weekly tree: Telegram (photo + caption + button) or email.

All credentials come from environment variables (GitHub Actions secrets):

  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_<KEY>
  SMTP_HOST, SMTP_PORT (465 = SSL, else STARTTLS), SMTP_USER, SMTP_PASSWORD,
  EMAIL_FROM (defaults to SMTP_USER), EMAIL_TO_<KEY>
"""
from __future__ import annotations

import html
import json
import mimetypes
import os
import smtplib
import ssl
import urllib.request
import uuid
from email.message import EmailMessage
from pathlib import Path
from typing import Optional


def _multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode()
        out += str(v).encode() + b"\r\n"
    for k, path in files.items():
        p = Path(path)
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        out += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{p.name}\"\r\n"
                f"Content-Type: {ctype}\r\n\r\n").encode()
        out += p.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def send_telegram(key: str, png: Path, caption: str, link: Optional[str] = None) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat = os.getenv(f"TELEGRAM_CHAT_ID_{key.upper()}")
    if not (token and chat):
        print(f"  telegram: skipped for {key} (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID_{key.upper()} not set)")
        return False
    fields = {"chat_id": chat, "caption": caption[:1024]}
    if link:
        fields["reply_markup"] = json.dumps({"inline_keyboard": [[{"text": "🌳 Open the living tree", "url": link}]]})
    body, ctype = _multipart(fields, {"photo": png})
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendPhoto", data=body,
                                 headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=60) as r:
        ok = json.loads(r.read()).get("ok", False)
    print(f"  telegram: {'sent' if ok else 'FAILED'} to {key}")
    return ok


def send_email(key: str, png: Path, story: dict, link: Optional[str] = None) -> bool:
    host, to = os.getenv("SMTP_HOST"), os.getenv(f"EMAIL_TO_{key.upper()}")
    user, pw = os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
    if not (host and to and user and pw):
        print(f"  email: skipped for {key} (SMTP_* / EMAIL_TO_{key.upper()} not set)")
        return False
    port = int(os.getenv("SMTP_PORT", "465"))
    msg = EmailMessage()
    msg["Subject"] = story["title"]
    msg["From"] = os.getenv("EMAIL_FROM", user)
    msg["To"] = to
    text = story["caption"] + (f"\n\nOpen the living tree: {link}" if link else "")
    msg.set_content(text)
    lines = "".join(f"<li>{html.escape(l)}</li>" for l in story["lines"])
    btn = (f'<p><a href="{html.escape(link)}" style="display:inline-block;background:#3f7d3a;color:#fff;'
           f'padding:10px 16px;border-radius:10px;text-decoration:none">🌳 Open the living tree</a></p>') if link else ""
    msg.add_alternative(f"""<div style="font:15px/1.5 system-ui,sans-serif;color:#2a2419;max-width:560px">
<h2 style="font-family:Georgia,serif">{html.escape(story['title'])}</h2>
<img src="cid:tree" alt="Your running tree" style="width:100%;border-radius:14px">
<ul>{lines}</ul><p style="background:#f4efe4;padding:10px 12px;border-radius:10px"><b>Next:</b> {html.escape(story['next'])}</p>
{btn}</div>""", subtype="html")
    msg.get_payload()[1].add_related(png.read_bytes(), maintype="image", subtype="png", cid="<tree>")
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=60) as s:
            s.login(user, pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=60) as s:
            s.starttls(context=ctx)
            s.login(user, pw)
            s.send_message(msg)
    print(f"  email: sent to {key}")
    return True
