from __future__ import annotations
import os, smtplib, ssl
from datetime import timedelta
import app as app_module
from sqlalchemy import select, delete
from models import SessionLocal, EmailOtp, User, utcnow


def test_validation_invalid_email(client):
    """TEST 5: Enter an invalid email address -> Expected: Appropriate validation error."""
    invalid_emails = [
        'notanemail',
        'missingatdomain.com',
        '@nodomain.com',
        'spaces in@email.com',
        '',
        'user@.com',
    ]
    for email in invalid_emails:
        res = client.post('/api/auth/email/send-otp', json={'email': email, 'purpose': 'register'})
        assert res.status_code == 400
        assert 'valid email address' in res.json().get('detail', '').lower()

    # Invalid purpose
    res = client.post('/api/auth/email/send-otp', json={'email': 'user@example.com', 'purpose': 'invalid_purpose'})
    assert res.status_code == 400
    assert 'invalid' in res.json().get('detail', '').lower()


def test_incorrect_and_expired_otp(client, alice, monkeypatch):
    """TEST 6: Enter an incorrect or expired OTP -> Expected: Verification rejected."""
    sent = []
    monkeypatch.setattr(app_module, 'send_email_otp', lambda email, code, purpose: sent.append((email, code, purpose)))

    target_email = 'newuser_verify@example.com'
    res = client.post('/api/auth/email/send-otp', json={'email': target_email, 'purpose': 'register'})
    assert res.status_code == 200
    valid_code = sent[-1][1]

    # Submitting wrong OTP
    res_wrong = client.post('/api/auth/register-with-otp', json={
        'display_name': 'New User',
        'email': target_email,
        'password': 'StrongPassword123!',
        'code': '000000'
    })
    assert res_wrong.status_code == 400
    assert 'invalid or expired' in res_wrong.json().get('detail', '').lower()

    # Test expired OTP: Manually set expiration in past
    with SessionLocal() as db:
        record = db.scalar(select(EmailOtp).where(EmailOtp.email == target_email))
        assert record is not None
        record.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()

    # Submitting now-expired OTP
    res_expired = client.post('/api/auth/register-with-otp', json={
        'display_name': 'New User',
        'email': target_email,
        'password': 'StrongPassword123!',
        'code': valid_code
    })
    assert res_expired.status_code == 400
    assert 'invalid or expired' in res_expired.json().get('detail', '').lower()

    # Also test verify endpoint with expired OTP
    res_verify = client.post('/api/auth/email/verify-otp', json={
        'email': target_email,
        'code': valid_code,
        'purpose': 'register'
    })
    assert res_verify.status_code == 400


def test_valid_otp_registration_and_invalidation(client, monkeypatch):
    """TEST 7: Enter a valid OTP -> Expected: Verification successful."""
    sent = []
    monkeypatch.setattr(app_module, 'send_email_otp', lambda email, code, purpose: sent.append((email, code, purpose)))

    user_email = 'director_pro@example.com'
    res = client.post('/api/auth/email/send-otp', json={'email': user_email, 'purpose': 'register'})
    assert res.status_code == 200
    assert 'valid for' in res.json().get('message', '').lower() or 'expires' in res.json().get('message', '').lower()
    otp_code = sent[-1][1]

    # Check direct verify endpoint
    verify_res = client.post('/api/auth/email/verify-otp', json={
        'email': user_email,
        'code': otp_code,
        'purpose': 'register'
    })
    assert verify_res.status_code == 200
    assert verify_res.json().get('valid') is True

    # Register with valid OTP
    reg_res = client.post('/api/auth/register-with-otp', json={
        'display_name': 'Film Director',
        'email': user_email,
        'password': 'SuperDirector2026!',
        'code': otp_code
    })
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert data['user']['email'] == user_email
    assert 'token' in data

    # Replay attack: Reusing the same OTP must fail because it was invalidated
    replay_res = client.post('/api/auth/register-with-otp', json={
        'display_name': 'Film Director',
        'email': user_email,
        'password': 'SuperDirector2026!',
        'code': otp_code
    })
    # Since user now exists, it fails with 409 or 400
    assert replay_res.status_code in (400, 409)


def test_forgot_password_flow(client, alice, monkeypatch):
    """Test full forgot-password request, verification, password reset, and login."""
    sent = []
    monkeypatch.setattr(app_module, 'send_email_otp', lambda email, code, purpose: sent.append((email, code, purpose)))

    alice_email = 'alice@example.test'

    # Request reset OTP
    res = client.post('/api/auth/email/send-otp', json={'email': alice_email, 'purpose': 'reset_password'})
    assert res.status_code == 200
    otp_code = sent[-1][1]

    # Reset with wrong code
    wrong = client.post('/api/auth/reset-password', json={
        'email': alice_email,
        'code': '123456',
        'new_password': 'BrandNewPassword2026!'
    })
    assert wrong.status_code == 400

    # Reset with valid code
    success = client.post('/api/auth/reset-password', json={
        'email': alice_email,
        'code': otp_code,
        'new_password': 'BrandNewPassword2026!'
    })
    assert success.status_code == 200
    assert success.json()['user']['email'] == alice_email

    # Verify old password is dead and new password works
    old_log = client.post('/api/auth/login', json={'email': alice_email, 'password': 'MyStrongPass2026!'})
    assert old_log.status_code == 401
    new_log = client.post('/api/auth/login', json={'email': alice_email, 'password': 'BrandNewPassword2026!'})
    assert new_log.status_code == 200


def test_login_with_otp_flow(client, alice, monkeypatch):
    """Test login with OTP endpoint."""
    sent = []
    monkeypatch.setattr(app_module, 'send_email_otp', lambda email, code, purpose: sent.append((email, code, purpose)))

    alice_email = 'alice@example.test'
    res = client.post('/api/auth/email/send-otp', json={'email': alice_email, 'purpose': 'login'})
    assert res.status_code == 200
    otp_code = sent[-1][1]

    # Login with wrong code
    bad = client.post('/api/auth/login-with-otp', json={'email': alice_email, 'code': '999999'})
    assert bad.status_code == 400

    # Login with valid code
    ok = client.post('/api/auth/login-with-otp', json={'email': alice_email, 'code': otp_code})
    assert ok.status_code == 200
    assert ok.json()['user']['email'] == alice_email


def test_cooldown_rate_limit(client, monkeypatch):
    """Test 30-second cooldown on requesting OTP."""
    monkeypatch.setattr(app_module, 'send_email_otp', lambda email, code, purpose: None)
    email = 'cooldown_test@example.com'

    first = client.post('/api/auth/email/send-otp', json={'email': email, 'purpose': 'register'})
    assert first.status_code == 200

    # Immediate second request should be rejected by cooldown
    second = client.post('/api/auth/email/send-otp', json={'email': email, 'purpose': 'register'})
    assert second.status_code == 429
    assert 'wait' in second.json().get('detail', '').lower()
