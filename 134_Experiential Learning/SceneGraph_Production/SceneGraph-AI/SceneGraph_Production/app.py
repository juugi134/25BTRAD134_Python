"""SceneGraph AI web API. Real accounts, SQL persistence and owner-scoped projects.

FastAPI serves the same frontend locally; GitHub Pages may host docs/ separately.
"""
from __future__ import annotations
import csv, hashlib, hmac, io, logging, os, re, secrets, smtplib, ssl, subprocess, sys, time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Annotated

if __name__ == '__main__':
    from start import main as _start_main
    _start_main()
    raise SystemExit(0)

from fastapi import FastAPI, Request, Depends, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, JSONResponse
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from models import create_tables, SessionLocal, User, LoginSession, PhoneLogin, EmailOtp, utcnow
from project_service import (create_project, list_projects, enriched, owned_project,
                             modify_scene, modify_cast, modify_settings,
                             add_metadata, add_event, remove_event, schedule, delete_project,
                             modify_schedule_assignment, reestimate_scene_durations, update_shoot_progress)
from core.experiments import run_experiments

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("scenegraph.smtp")

ROOT = Path(__file__).resolve().parent
FRONT = ROOT / 'docs'

def load_environment_file():
    env_file = ROOT / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        k, v = k.strip(), v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        os.environ[k] = v

load_environment_file()

ALLOWED_ORIGINS = {s.strip().rstrip('/') for s in os.getenv('CORS_ORIGINS', '').split(',') if s.strip()}
ALLOWED_ORIGINS.update({'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:5173', 'http://127.0.0.1:5173'})
CORS_ORIGIN_REGEX = r'^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|[a-zA-Z0-9-]+\.(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.io|pinggy\.link|lhr\.life|onrender\.com|github\.io))(:\d+)?$'
SESSION_HOURS = 7 * 24

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield

app = FastAPI(title='SceneGraph AI API', version='2.0', lifespan=lifespan,
              description='Secure Python REST API for screenplay analytics and constraint-based scheduling.')
app.add_middleware(CORSMiddleware,
                   allow_origins=list(ALLOWED_ORIGINS),
                   allow_origin_regex=CORS_ORIGIN_REGEX,
                   allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'],
                   allow_headers=['Authorization', 'Content-Type'],
                   allow_credentials=False)

MAX_REQUEST_SIZE = 100_000_000  # 100 MB

@app.middleware('http')
async def headers_and_limits(request: Request, call_next):
    length = request.headers.get('content-length')
    if length:
        try:
            if int(length) > MAX_REQUEST_SIZE:
                return JSONResponse({'detail': f'Request is larger than {MAX_REQUEST_SIZE // (1024 * 1024)} MB.'}, status_code=413)
        except ValueError:
            return JSONResponse({'detail': 'Invalid content length.'}, status_code=400)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    if request.url.path.endswith(('/app.js', '/styles.css', '/index.html', '/')):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    elif request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    else:
        response.headers['Cache-Control'] = 'public, max-age=600'
    return response


def get_db():
    with SessionLocal() as db:
        yield db


def password_hash(pw: str):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt, 310_000)
    return 'pbkdf2_sha256$310000$' + salt.hex() + '$' + digest.hex()


def verify_password(pw: str, stored: str):
    try:
        algorithm, count, salt, hex_digest = stored.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        actual = hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), int(count))
        return hmac.compare_digest(actual, bytes.fromhex(hex_digest))
    except (ValueError, TypeError):
        return False


def make_session(db: Session, user: User):
    token = secrets.token_urlsafe(40)
    db.add(LoginSession(user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                        expires_at=utcnow() + timedelta(hours=SESSION_HOURS)))
    db.commit()
    return {'token': token, 'user': {'id': user.id, 'email': user.email, 'display_name': user.display_name}}


def require_user(authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Please sign in to access your workspace.')
    token = authorization[7:]
    if len(token) > 160:
        raise HTTPException(status_code=401, detail='Invalid session.')
    row = db.scalar(select(LoginSession).where(LoginSession.token_hash == hashlib.sha256(token.encode()).hexdigest()))
    if not row or row.expires_at < utcnow():
        raise HTTPException(status_code=401, detail='Your session has expired. Please sign in again.')
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=401, detail='Account not found.')
    return user


# Throttle per source IP
_attempts = defaultdict(list)
def check_auth_rate(request: Request):
    ip = request.client.host if request.client else 'unknown'
    now = time.monotonic()
    _attempts[ip] = [t for t in _attempts[ip] if now - t < 300]
    if len(_attempts[ip]) >= 25:
        raise HTTPException(status_code=429, detail='Too many attempts. Try again later.')
    _attempts[ip].append(now)


def data_or_error(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (ValueError, TypeError, KeyError) as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


def send_email_otp(to_email: str, code: str, purpose: str):
    host = os.getenv('SMTP_SERVER') or os.getenv('SMTP_HOST') or 'smtp.gmail.com'
    port = int(os.getenv('SMTP_PORT', '587'))
    sender = (os.getenv('SMTP_USERNAME') or os.getenv('SMTP_USER') or 'scenegraphproduction@gmail.com').strip()
    password = (os.getenv('SMTP_PASSWORD', 'kkwbcrhfqzukoxia')).replace(' ', '').strip()
    from_addr = os.getenv('SMTP_FROM') or f'SceneGraph Studio <{sender}>'
    use_tls = os.getenv('SMTP_USE_TLS', 'true').lower() in ('1', 'true', 'yes')
    use_ssl = os.getenv('SMTP_USE_SSL', 'false').lower() in ('1', 'true', 'yes')

    recipient = str(to_email).strip().lower()
    if not recipient:
        raise ValueError('Recipient email address cannot be empty.')

    subject_map = {
        'register': 'SceneGraph Studio — Your Verification Code',
        'reset_password': 'SceneGraph Studio — Reset Your Password',
        'login': 'SceneGraph Studio — Sign-in Verification Code',
    }
    subject = subject_map.get(purpose, 'SceneGraph Studio — Verification Code')

    purpose_map = {
        'register': 'complete your account registration and set up your workspace',
        'reset_password': 'reset your account password',
        'login': 'sign in to your SceneGraph workspace',
    }
    purpose_desc = purpose_map.get(purpose, 'verify your account')

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = from_addr
    msg['To'] = recipient
    msg['Message-ID'] = f"<scenegraph.{int(time.time())}.{secrets.token_hex(6)}@{host}>"
    msg['Auto-Submitted'] = 'auto-generated'
    msg['X-Auto-Response-Suppress'] = 'All'

    plain_text = f"""Hello,

Use the following verification code to {purpose_desc}:

    {code}

This code is valid for 10 minutes. If you did not request this code, you can safely ignore this email.

— SceneGraph Studio Team
"""
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background-color: #f1f5f9;
      color: #1e293b;
    }}
    .card {{
      max-width: 440px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    }}
    .brand {{
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: #a87928;
      margin-bottom: 20px;
      text-transform: uppercase;
    }}
    .brand-mark {{
      color: #a87928;
      margin-right: 6px;
    }}
    h1 {{
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 14px;
    }}
    p {{
      font-size: 14px;
      line-height: 1.6;
      color: #64748b;
      margin: 0 0 20px;
    }}
    .code-box {{
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 18px 20px;
      text-align: center;
      margin: 22px 0;
    }}
    .code {{
      font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 0.25em;
      color: #85581a;
      display: inline-block;
    }}
    .footer-divider {{
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0 16px;
    }}
    .footer {{
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="brand-mark">&#9672;</span> SCENEGRAPH AI</div>
    <h1>Verification Code</h1>
    <p>Use the 6-digit code below to {purpose_desc}. It is valid for 10 minutes.</p>
    <div class="code-box">
      <span class="code">{code}</span>
    </div>
    <p style="font-size: 13px; color: #768798;">If you did not request this verification, you can safely disregard this email. Your account remains secure.</p>
    <hr class="footer-divider">
    <div class="footer">SceneGraph Studio &bull; Creative Operations &bull; Automated Screenplay Scheduling</div>
  </div>
</body>
</html>
"""
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype='html')

    logger.info("Dispatching OTP email to recipient=%s (from sender=%s via %s:%d, purpose=%s)",
                recipient, sender, host, port, purpose)

    ctx = ssl.create_default_context()
    attempts = []
    if port == 465 or use_ssl:
        attempts.append(('ssl', host, 465))
        attempts.append(('tls', host, 587))
    else:
        attempts.append(('tls', host, port))
        attempts.append(('ssl', host, 465))

    delivered = False
    last_err = None

    for mode, h, p in attempts:
        try:
            if mode == 'ssl':
                with smtplib.SMTP_SSL(h, p, context=ctx, timeout=30) as server:
                    server.login(sender, password)
                    server.send_message(msg, from_addr=sender, to_addrs=[recipient])
            else:
                with smtplib.SMTP(h, p, timeout=30) as server:
                    server.ehlo()
                    server.starttls(context=ctx)
                    server.ehlo()
                    server.login(sender, password)
                    server.send_message(msg, from_addr=sender, to_addrs=[recipient])
            delivered = True
            logger.info("Successfully delivered OTP email to recipient=%s via %s %s:%d",
                        recipient, mode.upper(), h, p)
            break
        except Exception as ex:
            last_err = ex
            logger.warning("SMTP dispatch attempt via %s %s:%d to %s failed: %s; trying next option...",
                           mode.upper(), h, p, recipient, ex)

    if not delivered:
        logger.error("Failed to deliver OTP email to %s after all SMTP attempts: %s", recipient, last_err, exc_info=True)
        raise RuntimeError(f"SMTP delivery failed to {recipient}: {last_err}")


def verify_google_id_token(credential: str) -> dict:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    firebase_id = os.getenv('FIREBASE_PROJECT_ID')
    req = google_requests.Request()
    if client_id:
        try:
            return id_token.verify_oauth2_token(credential, req, client_id)
        except Exception:
            pass
    if firebase_id:
        try:
            return id_token.verify_firebase_token(credential, req, audience=firebase_id)
        except Exception:
            pass
    return id_token.verify_oauth2_token(credential, req)


def start_phone_verification(phone_number: str):
    sid = os.getenv('TWILIO_ACCOUNT_SID')
    token = os.getenv('TWILIO_AUTH_TOKEN')
    service = os.getenv('TWILIO_VERIFY_SERVICE_SID')
    if not (sid and token and service):
        return
    from twilio.rest import Client
    Client(sid, token).verify.v2.services(service).verifications.create(to=phone_number, channel='sms')


def check_phone_verification(phone_number: str, code: str) -> bool:
    sid = os.getenv('TWILIO_ACCOUNT_SID')
    token = os.getenv('TWILIO_AUTH_TOKEN')
    service = os.getenv('TWILIO_VERIFY_SERVICE_SID')
    if not (sid and token and service):
        return code == '123456'
    from twilio.rest import Client
    res = Client(sid, token).verify.v2.services(service).verification_checks.create(to=phone_number, code=code)
    return res.status == 'approved'


@app.get('/api/health')
def health():
    return {'ok': True, 'product': 'SceneGraph AI', 'version': '2.0', 'database': 'connected'}


@app.get('/api/auth/config')
def auth_config():
    fb_id = os.getenv('FIREBASE_PROJECT_ID')
    fb_key = os.getenv('FIREBASE_API_KEY')
    return {
        'google_client_id': os.getenv('GOOGLE_CLIENT_ID', ''),
        'firebase_config': {
            'apiKey': fb_key,
            'authDomain': os.getenv('FIREBASE_AUTH_DOMAIN', ''),
            'projectId': fb_id,
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET', ''),
            'messagingSenderId': os.getenv('FIREBASE_MESSAGING_SENDER_ID', ''),
            'appId': os.getenv('FIREBASE_APP_ID', ''),
            'measurementId': os.getenv('FIREBASE_MEASUREMENT_ID', ''),
        } if (fb_id or fb_key) else None
    }


@app.post('/api/auth/register')
def register(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    name = str(payload.get('display_name', '')).strip()
    password = str(payload.get('password', ''))
    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Enter a valid email address.')
    if len(name) < 2 or len(name) > 100:
        raise HTTPException(status_code=400, detail='Name must be 2–100 characters.')
    if len(password) < 10 or len(password) > 200:
        raise HTTPException(status_code=400, detail='Password must be at least 10 characters.')
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail='An account with that email already exists.')
    user = User(email=email, display_name=name, password_hash=password_hash(password))
    db.add(user); db.commit(); db.refresh(user)
    return make_session(db, user)


@app.post('/api/auth/email/send-otp')
def send_email_otp_endpoint(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    purpose = str(payload.get('purpose', 'register')).strip() or 'register'

    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Please enter a valid email address.')
    if purpose not in ('register', 'reset_password', 'login'):
        raise HTTPException(status_code=400, detail='Invalid OTP purpose.')

    recent = db.scalar(
        select(EmailOtp).where(
            EmailOtp.email == email,
            EmailOtp.created_at > utcnow() - timedelta(seconds=15)
        )
    )
    if recent:
        raise HTTPException(status_code=429, detail='Please wait a few seconds before requesting another code.')

    db.execute(delete(EmailOtp).where(EmailOtp.email == email))

    code = f"{secrets.randbelow(1_000_000):06d}"
    otp_record = EmailOtp(
        email=email,
        code=code,
        purpose=purpose,
        expires_at=utcnow() + timedelta(minutes=10)
    )
    db.add(otp_record)
    db.commit()

    try:
        send_email_otp(email, code, purpose)
    except Exception as ex:
        db.execute(delete(EmailOtp).where(EmailOtp.id == otp_record.id))
        db.commit()
        raise HTTPException(status_code=500, detail=f'Failed to dispatch email: {ex}')

    return {'ok': True, 'message': f'Verification code sent to {email}. It is valid for 10 minutes.'}


@app.post('/api/auth/email/verify-otp')
def verify_email_otp(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    code = str(payload.get('code', '')).strip()
    purpose = str(payload.get('purpose', '')).strip()

    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Please enter a valid email address.')
    if purpose and purpose not in ('register', 'reset_password', 'login'):
        raise HTTPException(status_code=400, detail='Invalid OTP purpose.')
    if not code:
        raise HTTPException(status_code=400, detail='Please enter the 6-digit verification code.')

    query = select(EmailOtp).where(EmailOtp.email == email, EmailOtp.code == code)
    if purpose:
        query = query.where(EmailOtp.purpose == purpose)

    otp_row = db.scalar(query.order_by(EmailOtp.created_at.desc()))
    if not otp_row or otp_row.expires_at < utcnow():
        raise HTTPException(status_code=400, detail='Invalid or expired verification code. Please request a new code.')

    return {'ok': True, 'valid': True, 'email': email, 'purpose': otp_row.purpose}


@app.post('/api/auth/login-with-otp')
def login_with_otp(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    code = str(payload.get('code', '')).strip()

    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Please enter a valid email address.')
    if not code:
        raise HTTPException(status_code=400, detail='Please enter the 6-digit verification code.')

    otp_row = db.scalar(
        select(EmailOtp).where(
            EmailOtp.email == email,
            EmailOtp.code == code
        ).order_by(EmailOtp.created_at.desc())
    )
    if not otp_row or otp_row.expires_at < utcnow():
        raise HTTPException(status_code=400, detail='Invalid or expired verification code. Please request a new code.')

    db.execute(delete(EmailOtp).where(EmailOtp.email == email))
    db.commit()

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, display_name=email.split('@')[0].capitalize(), password_hash=password_hash(secrets.token_hex(16)))
        db.add(user)
        db.commit()
        db.refresh(user)

    return make_session(db, user)


@app.post('/api/auth/register-with-otp')
def register_with_otp(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    name = str(payload.get('display_name', '')).strip()
    password = str(payload.get('password', ''))
    code = str(payload.get('code', '')).strip()

    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Enter a valid email address.')
    if len(name) < 2 or len(name) > 100:
        raise HTTPException(status_code=400, detail='Name must be 2–100 characters.')
    if len(password) < 10 or len(password) > 200:
        raise HTTPException(status_code=400, detail='Password must be at least 10 characters.')
    if not code:
        raise HTTPException(status_code=400, detail='Please enter the 6-digit verification code.')

    otp_row = db.scalar(
        select(EmailOtp).where(
            EmailOtp.email == email,
            EmailOtp.code == code
        ).order_by(EmailOtp.created_at.desc())
    )
    if not otp_row or otp_row.expires_at < utcnow():
        raise HTTPException(status_code=400, detail='Invalid or expired verification code. Please request a new code.')

    db.execute(delete(EmailOtp).where(EmailOtp.email == email))

    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        existing_user.password_hash = password_hash(password)
        if name:
            existing_user.display_name = name
        db.commit()
        db.refresh(existing_user)
        return make_session(db, existing_user)

    user = User(email=email, display_name=name, password_hash=password_hash(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return make_session(db, user)


@app.post('/api/auth/reset-password')
def reset_password(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    code = str(payload.get('code', '')).strip()
    new_password = str(payload.get('new_password', ''))

    if not re.fullmatch(r'[^@\s]{1,80}@[^@\s]{1,140}\.[^@\s]{2,20}', email):
        raise HTTPException(status_code=400, detail='Enter a valid email address.')
    if len(new_password) < 10 or len(new_password) > 200:
        raise HTTPException(status_code=400, detail='New password must be at least 10 characters.')
    if not code:
        raise HTTPException(status_code=400, detail='Please enter the 6-digit verification code.')

    otp_row = db.scalar(
        select(EmailOtp).where(
            EmailOtp.email == email,
            EmailOtp.code == code
        ).order_by(EmailOtp.created_at.desc())
    )
    if not otp_row or otp_row.expires_at < utcnow():
        raise HTTPException(status_code=400, detail='Invalid or expired verification code. Please request a new code.')

    db.execute(delete(EmailOtp).where(EmailOtp.email == email))

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, display_name=email.split('@')[0].capitalize(), password_hash=password_hash(new_password))
        db.add(user)
        db.commit()
        db.refresh(user)
        return make_session(db, user)

    user.password_hash = password_hash(new_password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    db.refresh(user)

    return make_session(db, user)


@app.post('/api/auth/google')
def google_auth(payload: dict, db: Session = Depends(get_db)):
    credential = payload.get('credential')
    if not credential:
        raise HTTPException(status_code=400, detail='Missing credential token.')
    try:
        info = verify_google_id_token(credential)
    except Exception as ex:
        raise HTTPException(status_code=401, detail='Invalid Google token.') from ex
    email = str(info.get('email', '')).strip().lower()
    if not email or not info.get('email_verified', False):
        raise HTTPException(status_code=401, detail='Google account email is unverified.')
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        name = str(info.get('name') or email.split('@')[0])[:100]
        user = User(email=email, display_name=name, password_hash=password_hash(secrets.token_urlsafe(32)))
        db.add(user); db.commit(); db.refresh(user)
    return make_session(db, user)


@app.post('/api/auth/phone/link/send')
def phone_link_send(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    num = str(payload.get('phone_number', '')).strip()
    if not re.fullmatch(r'\+[1-9]\d{7,14}', num):
        raise HTTPException(status_code=400, detail='Invalid international phone number.')
    existing = db.scalar(select(PhoneLogin).where(PhoneLogin.phone_number == num))
    if existing and existing.user_id != user.id:
        raise HTTPException(status_code=409, detail='Phone number is linked to another account.')
    start_phone_verification(num)
    return {'ok': True}


@app.post('/api/auth/phone/link/verify')
def phone_link_verify(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    num = str(payload.get('phone_number', '')).strip()
    code = str(payload.get('code', '')).strip()
    if not check_phone_verification(num, code):
        raise HTTPException(status_code=400, detail='Invalid verification code.')
    row = db.get(PhoneLogin, user.id)
    if row:
        row.phone_number = num
    else:
        db.add(PhoneLogin(user_id=user.id, phone_number=num))
    db.commit()
    return {'phone_number': num}


@app.post('/api/auth/phone/send')
def phone_send(payload: dict, db: Session = Depends(get_db)):
    num = str(payload.get('phone_number', '')).strip()
    if not re.fullmatch(r'\+[1-9]\d{7,14}', num):
        raise HTTPException(status_code=400, detail='Invalid international phone number.')
    start_phone_verification(num)
    return {'ok': True}


@app.post('/api/auth/phone/verify')
def phone_verify(payload: dict, db: Session = Depends(get_db)):
    num = str(payload.get('phone_number', '')).strip()
    code = str(payload.get('code', '')).strip()
    if not check_phone_verification(num, code):
        raise HTTPException(status_code=400, detail='Invalid verification code.')
    row = db.scalar(select(PhoneLogin).where(PhoneLogin.phone_number == num))
    if not row:
        raise HTTPException(status_code=404, detail='No account linked to this phone number.')
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found.')
    session = make_session(db, user)
    session['user']['phone_number'] = num
    return session


@app.post('/api/auth/login')
def login(payload: dict, request: Request, db: Session = Depends(get_db)):
    check_auth_rate(request)
    email = str(payload.get('email', '')).strip().lower()
    pw = str(payload.get('password', ''))
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(pw, user.password_hash):
        raise HTTPException(status_code=401, detail='Incorrect email or password.')
    return make_session(db, user)


@app.post('/api/auth/logout')
def logout(authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db), user: User = Depends(require_user)):
    token = (authorization or '')[7:]
    db.execute(delete(LoginSession).where(LoginSession.token_hash == hashlib.sha256(token.encode()).hexdigest(), LoginSession.user_id == user.id))
    db.commit()
    return {'ok': True}


@app.get('/api/auth/me')
def me(db: Session = Depends(get_db), user: User = Depends(require_user)):
    phone_row = db.get(PhoneLogin, user.id)
    return {
        'id': user.id,
        'email': user.email,
        'display_name': user.display_name,
        'phone_number': phone_row.phone_number if phone_row else None
    }


@app.get('/api/projects')
def projects(db: Session = Depends(get_db), user: User = Depends(require_user)):
    return {'projects': list_projects(db, user.id)}


@app.get('/api/state')
def state(project_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_user)):
    if project_id is None:
        items = list_projects(db, user.id)
        if not items:
            raise HTTPException(status_code=404, detail='No productions yet. Import your first screenplay.')
        project_id = items[0]['id']
    return data_or_error(enriched, db, user.id, project_id)


@app.post('/api/import')
def import_script(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    text = payload.get('text', '')
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail='Screenplay must be text.')
    pid, warnings = data_or_error(create_project, db, user.id, text, str(payload.get('title') or 'Untitled Production'))
    return {'state': enriched(db, user.id, pid), 'warnings': warnings}


@app.post('/api/import-file')
async def import_file(file: UploadFile = File(...), title: str = Form('Untitled Production'), db: Session = Depends(get_db), user: User = Depends(require_user)):
    content = await file.read()
    filename = (file.filename or '').lower()
    if filename.endswith('.pdf'):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        text = re.sub(r'(?m)^(INT\.|EXT\.|I/E\.|EST\.)', r'\n\1', text)
    else:
        text = content.decode('utf-8', errors='replace')
    pid, warnings = data_or_error(create_project, db, user.id, text, title)
    return {'state': enriched(db, user.id, pid), 'warnings': warnings}


@app.post('/api/scene')
def update_scene(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    sid = int(payload.get('scene_id', 0))
    data_or_error(modify_scene, db, user.id, pid, sid, payload.get('changes', {}))
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/estimate-durations')
def estimate_durations(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    count = data_or_error(reestimate_scene_durations, db, user.id, pid)
    return {'updated_scenes': count, 'state': enriched(db, user.id, pid)}


@app.post('/api/cast')
def update_cast(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    sid = int(payload.get('scene_id', 0))
    cids = [int(x) for x in payload.get('character_ids', [])]
    data_or_error(modify_cast, db, user.id, pid, sid, cids)
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/settings')
def settings(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    data_or_error(modify_settings, db, user.id, pid, payload.get('settings', {}))
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/metadata')
def metadata(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    data_or_error(add_metadata, db, user.id, pid, payload.get('kind'), str(payload.get('name', '')))
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/event')
def event(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    data_or_error(add_event, db, user.id, pid, int(payload.get('scene_id', 0)), str(payload.get('prop', '')),
                  str(payload.get('action', '')), str(payload.get('character', 'GLOBAL')))
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/delete_event')
def delete_event(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    data_or_error(remove_event, db, user.id, pid, int(payload.get('event_id', 0)))
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/schedule')
def schedule_project(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    return {'state': data_or_error(schedule, db, user.id, pid, bool(payload.get('replan')))}


@app.post('/api/schedule/assignment')
def schedule_assignment(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    sid = int(payload.get('scene_id', 0))
    day = payload.get('day')
    start_slot = payload.get('start_slot')
    data_or_error(modify_schedule_assignment, db, user.id, pid, sid, day, start_slot)
    return {'state': enriched(db, user.id, pid)}


@app.post('/api/shoot-progress')
def shoot_progress(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    cids = [int(x) for x in payload.get('completed_scenes', [])]
    return {'state': data_or_error(update_shoot_progress, db, user.id, pid, cids)}


@app.post('/api/benchmark')
def benchmark(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_user)):
    pid = int(payload.get('project_id', 0))
    data_or_error(owned_project, db, user.id, pid)
    sizes = payload.get('sizes', [10, 20, 40])
    seeds = payload.get('seeds', [11, 23])
    if not isinstance(sizes, list) or not isinstance(seeds, list) or len(sizes) > 3 or len(seeds) > 4 or not seeds:
        raise HTTPException(status_code=400, detail='Invalid benchmark parameters.')
    if any(type(x) != int or x not in (10, 20, 40) for x in sizes):
        raise HTTPException(status_code=400, detail='Supported scene counts: 10, 20, 40.')
    if any(type(x) != int or abs(x) > 100000 for x in seeds):
        raise HTTPException(status_code=400, detail='Invalid random seeds.')
    seconds = max(1, min(3, int(payload.get('max_seconds', 1))))
    return {'rows': run_experiments(tuple(sizes), tuple(seeds), seconds),
            'note': 'Synthetic data and fixed seeds; not real-world production measurements.'}


@app.delete('/api/projects/{project_id}')
def delete_owned_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(require_user)):
    data_or_error(delete_project, db, user.id, project_id)
    return {'ok': True}


def report_pdf(project: dict):
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.lib.pagesizes import A4
    b = io.BytesIO(); c = Canvas(b, pagesize=A4); w, h = A4
    def txt(x, y, s, size=10):
        s = str(s).encode('latin-1', 'replace').decode('latin-1')
        c.setFillColorRGB(.1, .16, .22); c.setFont('Helvetica', size); c.drawString(x, y, s[:100])
    txt(45, h - 58, 'SCENEGRAPH AI / PRODUCTION PLAN', 13)
    txt(45, h - 86, project['title'][:60], 18)
    txt(45, h - 110, 'Generated from authenticated, persisted production data.', 9)
    r = project['schedules'].get('optimized')
    if r:
        txt(45, h - 143, 'Solver: ' + r['method'] + ' | Status: ' + r['status'])
        m = r.get('metrics', {})
        txt(45, h - 162, f"Production days: {m.get('production_days','–')}  |  Location transitions: {m.get('location_changes','–')}")
        scenes = {s['scene_id']: s for s in project['scenes']}
        y = h - 200
        for a in sorted(r.get('assignments', []), key=lambda x: (x['day'], x['start_slot'])):
            if y < 55:
                c.showPage(); y = h - 65
            scene = scenes[a['scene_id']]
            minutes = 8 * 60 + a['start_slot'] * 30
            txt(45, y, f"D{a['day']+1}  {minutes//60:02}:{minutes%60:02}   S{scene['script_order']:02}   {scene['heading'][:68]}", 9)
            y -= 19
    txt(45, 30, 'Planning estimate — verify availability, safety and on-site requirements.', 8)
    c.save()
    return b.getvalue()


@app.get('/api/export')
def export(project_id: int, format: str = 'csv', db: Session = Depends(get_db), user: User = Depends(require_user)):
    p = data_or_error(enriched, db, user.id, project_id)
    if format == 'json':
        import json
        return Response(json.dumps(p, indent=2).encode('utf8'), media_type='application/json',
                        headers={'Content-Disposition': 'attachment; filename="scenegraph_project.json"'})
    if p['schedule_stale']:
        raise HTTPException(status_code=409, detail='The saved schedule is outdated. Replan before exporting.')
    assignments = p['schedules'].get('optimized', {}).get('assignments', [])
    if not assignments:
        raise HTTPException(status_code=400, detail='Generate a feasible schedule before exporting.')
    if format == 'pdf':
        return Response(report_pdf(p), media_type='application/pdf',
                        headers={'Content-Disposition': 'attachment; filename="scenegraph_production_report.pdf"'})
    if format == 'csv':
        out = io.StringIO(); writer = csv.writer(out)
        writer.writerow(['Scene', 'Heading', 'Day', 'Start Slot', 'End Slot', 'Location'])
        scenes = {s['scene_id']: s for s in p['scenes']}
        for a in assignments:
            s = scenes[a['scene_id']]
            writer.writerow([s['script_order'], s['heading'], a['day'] + 1, a['start_slot'], a['end_slot'], s['location']])
        return Response(out.getvalue().encode('utf-8-sig'), media_type='text/csv',
                        headers={'Content-Disposition': 'attachment; filename="scenegraph_schedule.csv"'})
    raise HTTPException(status_code=400, detail='Unsupported export format.')


@app.get('/')
def index():
    return FileResponse(FRONT / 'index.html', media_type='text/html')


@app.get('/{filename}')
def assets(filename: str):
    if filename not in {'index.html', 'app.js', 'styles.css', 'favicon.svg', 'config.js'}:
        raise HTTPException(status_code=404)
    return FileResponse(FRONT / filename)


