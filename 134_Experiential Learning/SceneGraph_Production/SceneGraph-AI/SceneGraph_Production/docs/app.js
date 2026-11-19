/* SceneGraph Studio — bespoke, dependency-free frontend. No Streamlit and no frontend build step. */
const app = { state: null, view: 'overview', bench: null, busy: false, userId: null, user: null, projects: [], trackerFilter: 'all' };
const $ = q => document.querySelector(q);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const asNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const labels = { overview: 'OVERVIEW', studio: 'SCRIPT STUDIO', planner: 'PRODUCTION PLANNER', tracker: 'SHOOT TRACKER', graph: 'KNOWLEDGE GRAPH', continuity: 'CONTINUITY LAB', analytics: 'ANALYTICS LAB' };
function toast(msg, isError = false) { const el = document.createElement('div'); el.className = 'toast-item' + (isError ? ' error' : ''); el.textContent = msg; $('#toast').append(el); setTimeout(() => el.remove(), 4200) }
const loadingOperations = new Map();
let loadingOperationId = 0;
function beginLoading(message) {
  const id = ++loadingOperationId;
  loadingOperations.set(id, message);
  $('#loadingMessage').textContent = message;
  $('#loadingOverlay').setAttribute('aria-busy', 'true');
  $('#loadingOverlay').hidden = false;
  return () => { loadingOperations.delete(id); const latest = [...loadingOperations.values()].pop(); if (latest) { $('#loadingMessage').textContent = latest } else { $('#loadingOverlay').hidden = true; $('#loadingOverlay').setAttribute('aria-busy', 'false') } };
}
function apiLoadingMessage(path) {
  if (path.includes('/import')) return 'Importing and analyzing screenplay...';
  if (path.includes('/estimate-durations')) return 'Estimating scene times...';
  if (path.includes('/schedule')) return 'Optimizing production schedule...';
  if (path.includes('/benchmark')) return 'Running production benchmarks...';
  if (path.includes('/auth/google')) return 'Verifying Google sign-in...';
  if (path.includes('/auth/email/send-otp')) return 'Sending verification code...';
  if (path.includes('/auth/register-with-otp')) return 'Verifying code & setting up workspace...';
  if (path.includes('/auth/reset-password')) return 'Resetting password...';
  return 'Loading your workspace...';
}
function projectStorageKey() { return app.userId ? `scenegraph_project_${app.userId}` : null }
function rememberProject(id) { const key = projectStorageKey(); if (key) localStorage.setItem(key, String(id)) }
let API_BASE = (window.SCENEGRAPH_API_BASE || sessionStorage.getItem('scenegraph_api') || '').replace(/\/$/, '');
let authToken = sessionStorage.getItem('scenegraph_token') || '';
let authMode = 'login';
const isGithubPages = location.hostname.endsWith('.github.io');
function hasBackendConnection(){return Boolean(API_BASE)||(!isGithubPages&&location.protocol!=='file:')}
async function api(path, body) {
  const finishLoading = beginLoading(apiLoadingMessage(path));
  try {
    const headers = { 'Authorization': 'Bearer ' + authToken };
    const opts = body === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let res;
    try { res = await fetch(API_BASE + path, opts) } catch { throw new Error('Cannot connect to Python API. Check the backend URL, CORS_ORIGINS and server status.') }
    let data; try { data = await res.json() } catch { throw new Error('Server returned an invalid response') }
    if (!res.ok) { if (res.status === 401 && authToken) { authToken = ''; sessionStorage.removeItem('scenegraph_token'); showAuth() } throw new Error(data.detail || data.error || 'Request failed') }
    return data;
  } finally { finishLoading() }
}
function resetAuthForm() {
  const form = $('#authForm');
  if (form) form.reset();
  if ($('#authName')) $('#authName').value = '';
  if ($('#authEmail')) $('#authEmail').value = '';
  if ($('#authOtp')) $('#authOtp').value = '';
  if ($('#authPassword')) $('#authPassword').value = '';
  if ($('#authConfirmPassword')) $('#authConfirmPassword').value = '';
  if ($('#authError')) {
    $('#authError').textContent = '';
    $('#authError').hidden = true;
  }
  if ($('#authSuccess')) {
    $('#authSuccess').textContent = '';
    $('#authSuccess').hidden = true;
  }
  if (typeof otpCooldownInterval !== 'undefined' && otpCooldownInterval) {
    clearInterval(otpCooldownInterval);
    otpCooldownInterval = null;
  }
  const sendOtpBtn = $('#sendOtpBtn');
  if (sendOtpBtn) {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = 'SEND CODE';
  }
  setAuthMode('login');
}
function showAuth(keepForm = false) {
  if (!keepForm) resetAuthForm();
  document.querySelector('#authBackdrop').classList.remove('hidden');
  const showBackendConfig = !API_BASE && (isGithubPages || location.protocol === 'file:');
  document.querySelector('#serverConfig').hidden = !showBackendConfig;
  document.querySelector('#localServerHint').hidden = location.protocol !== 'file:';
  document.querySelector('#remoteServerConfig').hidden = location.protocol === 'file:';
}
function hideAuth() { document.querySelector('#authBackdrop').classList.add('hidden') }
function setAuthMode(mode) {
  authMode = mode;
  const isReg = mode === 'register';
  const isForgot = mode === 'forgot';

  // Clear inputs on switch so previous password / codes don't cause mismatches
  if ($('#authPassword')) $('#authPassword').value = '';
  if ($('#authConfirmPassword')) $('#authConfirmPassword').value = '';
  if ($('#authOtp')) $('#authOtp').value = '';

  $('#nameField').style.display = isReg ? 'block' : 'none';
  $('#otpField').style.display = (isReg || isForgot) ? 'block' : 'none';
  $('#passwordField').style.display = 'block';
  $('#confirmPasswordField').style.display = (isReg || isForgot) ? 'block' : 'none';

  const forgotBtn = $('#forgotPwBtn');
  if (forgotBtn) forgotBtn.style.display = mode === 'login' ? 'inline-block' : 'none';

  if (isReg) {
    $('#authHeading').textContent = 'Start something extraordinary.';
    $('#authDesc').textContent = 'Verify your email to create a secure SceneGraph workspace.';
    $('#passwordLabel').textContent = 'CREATE PASSWORD (MIN. 10 CHARS)';
    $('#confirmPasswordLabel').textContent = 'CONFIRM PASSWORD';
    $('#authSubmit').textContent = 'VERIFY & CREATE WORKSPACE ↗';
    $('#authToggleWrap').firstChild.textContent = 'Already have an account? ';
    $('#authToggle').textContent = 'Sign in';
    $('#authPassword').autocomplete = 'new-password';
    if ($('#authProviderDivider')) $('#authProviderDivider').style.display = '';
    const gp = document.querySelector('.google-provider');
    if (gp) gp.style.display = '';
  } else if (isForgot) {
    $('#authHeading').textContent = 'Reset your password.';
    $('#authDesc').textContent = 'Enter your email, click SEND CODE, then set your new password.';
    $('#passwordLabel').textContent = 'NEW PASSWORD (MIN. 10 CHARS)';
    $('#confirmPasswordLabel').textContent = 'CONFIRM NEW PASSWORD';
    $('#authSubmit').textContent = 'VERIFY CODE & RESET PASSWORD ↗';
    $('#authToggleWrap').firstChild.textContent = 'Remember your password? ';
    $('#authToggle').textContent = 'Sign in';
    $('#authPassword').autocomplete = 'new-password';
    if ($('#authProviderDivider')) $('#authProviderDivider').style.display = 'none';
    const gp = document.querySelector('.google-provider');
    if (gp) gp.style.display = 'none';
  } else {
    $('#authHeading').textContent = 'Welcome back.';
    $('#authDesc').textContent = 'Your productions. Your private workspace.';
    $('#passwordLabel').textContent = 'PASSWORD';
    $('#authSubmit').textContent = 'SIGN IN TO STUDIO ↗';
    $('#authToggleWrap').firstChild.textContent = 'New to SceneGraph? ';
    $('#authToggle').textContent = 'Create an account';
    $('#authPassword').autocomplete = 'current-password';
    if ($('#authProviderDivider')) $('#authProviderDivider').style.display = '';
    const gp = document.querySelector('.google-provider');
    if (gp) gp.style.display = '';
  }

  $('#authError').hidden = true;
  if ($('#authSuccess')) $('#authSuccess').hidden = true;

  // Reset password inputs visibility
  document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (input) input.type = 'password';
    const openEye = btn.querySelector('.eye-open');
    const closedEye = btn.querySelector('.eye-closed');
    if (openEye && closedEye) {
      openEye.style.display = 'block';
      closedEye.style.display = 'none';
    }
  });
}
function setCurrentUser(user) { app.user = user; app.userId = user.id; $('#accountBtn').hidden = false }
async function completeSignIn(session, message) { authToken = session.token; setCurrentUser(session.user); sessionStorage.setItem('scenegraph_token', authToken); resetAuthForm(); hideAuth(); await loadState(); toast(message) }
function initializeGoogleSignIn(clientId) {
  const renderButton = () => {
    if (!window.google?.accounts?.id) { $('#authProviderNotice').hidden = false; return $('#authProviderNotice').textContent = 'Google Sign-In could not be loaded. Check your network and Google client ID.'; }
    window.google.accounts.id.initialize({
      client_id: clientId, callback: async response => {
        try { await completeSignIn(await api('/api/auth/google', { credential: response.credential }), 'Signed in with Google.') }
        catch (ex) { $('#authError').textContent = ex.message; $('#authError').hidden = false }
      }
    });
    window.google.accounts.id.renderButton($('#googleSignIn'), { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'rectangular', width: 320 });
  };
  if (window.google?.accounts?.id) { renderButton(); return }
  const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true;
  script.onload = renderButton; script.onerror = () => { $('#authProviderNotice').hidden = false; $('#authProviderNotice').textContent = 'Google Sign-In could not be loaded. Check your network connection.' }; document.head.append(script);
}
let _firebaseAuthInstance = null;
async function getFirebaseAuth(fbConfig) {
  if (_firebaseAuthInstance) return _firebaseAuthInstance;
  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.append(s);
  });
  if (!window.firebase?.initializeApp) {
    await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  }
  if (!window.firebase?.auth) {
    await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
  }
  if (!firebase.apps?.length) {
    firebase.initializeApp(fbConfig);
  }
  if (fbConfig.measurementId && !window.firebase?.analytics) {
    try {
      await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics-compat.js');
      if (firebase.analytics) firebase.analytics();
    } catch (e) { }
  }
  _firebaseAuthInstance = firebase.auth();
  return _firebaseAuthInstance;
}
function initializeFirebaseSignIn(fbConfig) {
  const container = $('#googleSignIn');
  container.innerHTML = `<button class="button google-signin-button" id="firebaseGoogleSignInBtn" type="button" style="width:100%;max-width:320px;display:flex;align-items:center;justify-content:center;gap:10px;background:#13181d;border:1px solid #39434a;color:#fff;font-weight:600;padding:10px 16px;cursor:pointer;border-radius:6px;"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg><span>CONTINUE WITH GOOGLE</span></button>`;
  const btn = $('#firebaseGoogleSignInBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const finishLoading = beginLoading('Signing in with Google...');
    $('#authError').hidden = true;
    try {
      const auth = await getFirebaseAuth(fbConfig);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const result = await auth.signInWithPopup(provider);
      const credential = await result.user.getIdToken();
      await completeSignIn(await api('/api/auth/google', { credential }), 'Signed in with Google.');
    } catch (ex) {
      if (ex.code !== 'auth/popup-closed-by-user' && ex.code !== 'auth/cancelled-popup-request') {
        if (ex.code === 'auth/unauthorized-domain') {
          $('#authError').textContent = `Domain "${location.hostname}" is not authorized in Firebase. Add "${location.hostname}" in Firebase Console > Authentication > Settings > Authorized domains, or open http://localhost:8000/`;
        } else {
          $('#authError').textContent = ex.message || 'Google sign-in failed.';
        }
        $('#authError').hidden = false;
      }
    } finally {
      finishLoading();
      btn.disabled = false;
    }
  });
}
async function loadAuthProviders() {
  const googleStatus = $('#googleProviderStatus');
  if (!hasBackendConnection()) {
    const message = location.protocol === 'file:'
      ? 'This file page cannot connect to the sign-in API. Open http://127.0.0.1:8000/ instead.'
      : 'Connect your deployed Python backend below to check provider setup.';
    if (googleStatus) googleStatus.textContent = message;
    return;
  }
  try {
    const config = await api('/api/auth/config');
    const fbConfig = config?.firebase_config || window.FIREBASE_CONFIG;
    const hasFb = Boolean(fbConfig && fbConfig.projectId);
    if (hasFb) {
      if (googleStatus) { googleStatus.textContent = ''; googleStatus.hidden = true; }
      initializeFirebaseSignIn(fbConfig);
    } else if (config.google_client_id) {
      if (googleStatus) { googleStatus.textContent = ''; googleStatus.hidden = true; }
      $('#googleSignIn').innerHTML = '';
      initializeGoogleSignIn(config.google_client_id);
    } else {
      if (googleStatus) { googleStatus.textContent = ''; googleStatus.hidden = true; }
    }
    if ($('#authProviderNotice')) $('#authProviderNotice').hidden = true;
  } catch (ex) {
    const fbConfig = window.FIREBASE_CONFIG;
    if (fbConfig && fbConfig.projectId) {
      if (googleStatus) { googleStatus.textContent = ''; googleStatus.hidden = true; }
      initializeFirebaseSignIn(fbConfig);
    } else {
      if (googleStatus) { googleStatus.textContent = ''; googleStatus.hidden = true; }
    }
    if ($('#authProviderNotice')) $('#authProviderNotice').hidden = true;
  }
}
async function startAuth() { if (isGithubPages && !API_BASE) showAuth(); if (!authToken) { showAuth(); return } try { const me = await api('/api/auth/me'); setCurrentUser(me); $('#logoutBtn').title = 'Sign out ' + me.display_name; hideAuth(); await loadState() } catch (ex) { app.user = null; app.userId = null; $('#accountBtn').hidden = true; showAuth(); $('#authError').textContent = ex.message; $('#authError').hidden = false; } }
const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let otpCooldownInterval = null;

function startOtpCooldown(seconds = 30) {
  const btn = $('#sendOtpBtn');
  if (!btn) return;
  clearInterval(otpCooldownInterval);
  btn.disabled = true;
  let remaining = seconds;
  btn.textContent = `RESEND IN ${remaining}S`;
  otpCooldownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(otpCooldownInterval);
      btn.disabled = false;
      btn.textContent = 'RESEND CODE';
    } else {
      btn.textContent = `RESEND IN ${remaining}S`;
    }
  }, 1000);
}

async function handleSendOtp() {
  const emailInput = $('#authEmail');
  const email = (emailInput?.value || '').trim();
  const errorEl = $('#authError');
  const successEl = $('#authSuccess');
  errorEl.hidden = true;
  if (successEl) successEl.hidden = true;

  if (!email || !reEmail.test(email)) {
    errorEl.textContent = 'Please enter a valid email address first to receive your code.';
    errorEl.hidden = false;
    emailInput?.focus();
    return;
  }

  const btn = $('#sendOtpBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'SENDING...';

  const purpose = authMode === 'forgot' ? 'reset_password' : 'register';
  try {
    const res = await fetch(API_BASE + '/api/auth/email/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Failed to send verification code.');

    if (successEl) {
      successEl.textContent = data.message || `Verification code sent to ${email}. Check your inbox and spam folder.`;
      successEl.hidden = false;
    }
    startOtpCooldown(30);
    $('#authOtp')?.focus();
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to send verification code. Please try again.';
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const btn = $('#authSubmit');
  btn.disabled = true;
  $('#authError').hidden = true;
  if ($('#authSuccess')) $('#authSuccess').hidden = true;

  const email = ($('#authEmail').value || '').trim();
  const password = $('#authPassword').value;
  const confirmPassword = $('#authConfirmPassword')?.value || '';
  const name = ($('#authName')?.value || '').trim();
  const otpCode = ($('#authOtp')?.value || '').replace(/\D/g, '').trim();

  let loadingMsg = 'Signing in...';
  if (authMode === 'register') loadingMsg = 'Verifying and creating workspace...';
  else if (authMode === 'forgot') loadingMsg = 'Resetting password...';

  const finishLoading = beginLoading(loadingMsg);
  try {
    if (!hasBackendConnection()) throw new Error(location.protocol === 'file:' ? 'Open http://127.0.0.1:8000/ to sign in.' : 'Set your Python backend URL below first.');

    if (!email || !reEmail.test(email)) {
      throw new Error('Please enter a valid email address.');
    }

    if (authMode === 'register') {
      if (name.length < 2) {
        throw new Error('Please enter your full name (at least 2 characters).');
      }
      if (!otpCode || otpCode.length !== 6) {
        throw new Error('Please click "SEND CODE" and enter the 6-digit verification code sent to your email.');
      }
      if (password.length < 10) {
        throw new Error('Password must be at least 10 characters.');
      }
      if (!confirmPassword) {
        throw new Error('Please confirm your password.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match. Please re-enter.');
      }

      let res;
      try {
        res = await fetch(API_BASE + '/api/auth/register-with-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: name, email, password, code: otpCode })
        });
      } catch {
        throw new Error('Cannot reach the Python backend. Verify its public URL.');
      }
      const info = await res.json();
      if (!res.ok) throw new Error(info.detail || 'Registration failed');
      await completeSignIn(info, 'Welcome to SceneGraph, ' + info.user.display_name + '! Your account is verified.');
    } else if (authMode === 'forgot') {
      if (!otpCode || otpCode.length !== 6) {
        throw new Error('Please click "SEND CODE" and enter the 6-digit verification code sent to your email.');
      }
      if (password.length < 10) {
        throw new Error('New password must be at least 10 characters.');
      }
      if (!confirmPassword) {
        throw new Error('Please confirm your new password.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match. Please re-enter.');
      }

      let res;
      try {
        res = await fetch(API_BASE + '/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: otpCode, new_password: password })
        });
      } catch {
        throw new Error('Cannot reach the Python backend. Verify its public URL.');
      }
      const info = await res.json();
      if (!res.ok) throw new Error(info.detail || 'Password reset failed');
      await completeSignIn(info, 'Password reset successfully! Welcome back, ' + info.user.display_name + '.');
    } else {
      if (!password) {
        throw new Error('Please enter your password.');
      }
      let res;
      try {
        res = await fetch(API_BASE + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
      } catch {
        throw new Error('Cannot reach the Python backend. Verify its public URL.');
      }
      const info = await res.json();
      if (!res.ok) throw new Error(info.detail || 'Incorrect email or password.');
      await completeSignIn(info, 'Welcome back, ' + info.user.display_name + '!');
    }
  } catch (ex) {
    $('#authError').textContent = ex.message;
    $('#authError').hidden = false;
  } finally {
    finishLoading();
    btn.disabled = false;
  }
}

$('#authForm').addEventListener('submit', handleAuthSubmit);
$('#authToggle').addEventListener('click', () => {
  if (authMode === 'login') setAuthMode('register');
  else setAuthMode('login');
});
const forgotBtn = $('#forgotPwBtn');
if (forgotBtn) forgotBtn.addEventListener('click', () => setAuthMode('forgot'));
const sendOtpBtn = $('#sendOtpBtn');
if (sendOtpBtn) sendOtpBtn.addEventListener('click', handleSendOtp);

function setupPasswordToggles() {
  document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      const openEye = btn.querySelector('.eye-open');
      const closedEye = btn.querySelector('.eye-closed');
      if (openEye && closedEye) {
        openEye.style.display = isPass ? 'none' : 'block';
        closedEye.style.display = isPass ? 'block' : 'none';
      }
      btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  });
}
setupPasswordToggles();
$('#saveServerBtn').addEventListener('click', () => { const url = $('#serverUrl').value.trim().replace(/\/$/, ''); if (!/^https:\/\/[^\s]+$/.test(url)) return toast('Use a valid HTTPS backend URL.', true); API_BASE = url; sessionStorage.setItem('scenegraph_api', url); loadAuthProviders(); toast('API backend configured in this browser.'); });
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', {}) } catch { }
  authToken = '';
  app.state = null;
  app.user = null;
  app.userId = null;
  $('#accountBtn').hidden = true;
  sessionStorage.removeItem('scenegraph_token');
  resetAuthForm();
  showAuth();
  toast('Signed out.');
});
$('#deleteProjectBtn').addEventListener('click', async () => { if (!app.state) return; if (!confirm('Permanently delete production "' + app.state.title + '" and all its data?')) return; const finishLoading = beginLoading('Deleting production...'); try { const res = await fetch(API_BASE + '/api/projects/' + app.state.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } }); if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Delete failed') } await loadState(); toast('Production deleted.') } catch (ex) { toast(ex.message, true) } finally { finishLoading() } });

function updateProjectDropdown() {
  const wrap = $('#projectDropdown');
  if (!wrap) return;
  if (!app.state) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  let list = app.projects || [];
  if (!list.length && app.state) {
    list = [{ id: app.state.id, title: app.state.title }];
  }
  const current = list.find(x => String(x.id) === String(app.state.id)) || { id: app.state.id, title: app.state.title };
  const labelEl = $('#projectDropdownLabel');
  if (labelEl) {
    labelEl.textContent = current.title || 'Untitled Screenplay';
    labelEl.title = current.title || '';
  }
  const menu = $('#projectDropdownMenu');
  if (menu) {
    menu.innerHTML = list.map(p => {
      const isSel = String(p.id) === String(app.state.id);
      return `<div class="project-menu-item${isSel ? ' active' : ''}" role="option" aria-selected="${isSel}" data-id="${p.id}" tabindex="0">
        <span class="project-menu-title">${esc(p.title)}</span>
        <span class="project-menu-check">${isSel ? '✓' : ''}</span>
      </div>`;
    }).join('');
  }
}
function setupProjectDropdown() {
  const wrap = $('#projectDropdown');
  const btn = $('#projectDropdownBtn');
  const menu = $('#projectDropdownMenu');
  if (!wrap || !btn || !menu || btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';
  function closeMenu() {
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu(e) {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    if (isOpen) {
      closeMenu();
    } else {
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  }
  btn.addEventListener('click', toggleMenu);
  menu.addEventListener('click', e => {
    const item = e.target.closest('.project-menu-item');
    if (!item) return;
    const id = item.dataset.id;
    closeMenu();
    if (id && String(id) !== String(app.state?.id)) {
      loadState(id);
    }
  });
  menu.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.project-menu-item');
      if (item) {
        e.preventDefault();
        item.click();
      }
    }
  });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && wrap.classList.contains('open')) {
      closeMenu();
      btn.focus();
    }
  });
}
function showEmptyWorkspace() { app.state = null; app.projects = []; $('#projectSelect').innerHTML = ''; $('#projectSelect').hidden = true; if ($('#projectDropdown')) $('#projectDropdown').hidden = true; $('#deleteProjectBtn').hidden = true; $('#exportBtn').hidden = true; $('#currentCrumb').textContent = 'NEW PROJECT'; $('#content').innerHTML = `${sectionTitle('YOUR NEW PRODUCTION', 'Start with a screenplay.', 'Create your first production by importing a Fountain screenplay.')}<div class="card layout-stack"><div class="field"><label>PRODUCTION TITLE</label><input class="input" id="scriptTitle" value="Untitled Production"></div><div class="field"><label>FOUNTAIN SOURCE</label><textarea class="textarea" id="scriptSource" placeholder="INT. STUDIO - DAY&#10;&#10;MIRA&#10;Action!"></textarea></div><div class="footer-actions" style="margin-top:6px"><label class="file-label">CHOOSE FILE <input type="file" id="scriptFile" accept=".fountain,.txt,.pdf,text/plain,application/pdf"></label><button class="button button-primary" data-action="import">PARSE & CREATE PRODUCTION ↗</button></div></div>`; }
async function loadState(pid) { try { const result = await api('/api/projects'); if (!result.projects.length) { showEmptyWorkspace(); return } const savedId = pid ?? (projectStorageKey() ? localStorage.getItem(projectStorageKey()) : null); if (pid && !result.projects.some(project => String(project.id) === String(pid))) throw new Error('That production is no longer available. Refresh your project list.'); const selected = result.projects.find(project => String(project.id) === String(savedId)); app.state = await api('/api/state' + (selected ? '?project_id=' + encodeURIComponent(selected.id) : '')); rememberProject(app.state.id); await loadProjects(result.projects); render() } catch (e) { if (e.message.includes('No productions yet')) { showEmptyWorkspace(); return } toast(e.message, true); $('#content').innerHTML = '<div class="empty">Unable to load this production. Check your API connection or try refreshing.</div>' } }
async function loadProjects(projects) { const result = projects ? { projects } : await api('/api/projects'); app.projects = result.projects || []; const picker = $('#projectSelect'); if (picker) { picker.innerHTML = app.projects.map(x => `<option value="${x.id}">${esc(x.title)}</option>`).join(''); picker.hidden = true; if (app.state) picker.value = String(app.state.id); } updateProjectDropdown(); }
function setView(view) { app.view = view; render(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
function sectionTitle(kicker, title, sub, right = '') { return `<div class="page-intro"><div><p class="eyebrow">${kicker}</p><h1 class="page-title">${title}</h1><p class="page-subtitle">${sub}</p></div>${right}</div>` }
function stat(label, n, meta, color = 'mint') { return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-number text-${color}">${esc(n)}</div><div class="stat-meta">${esc(meta)}</div></div>` }
function badge(status) { const ok = ['OPTIMAL', 'FEASIBLE', 'HEURISTIC_FEASIBLE'].includes(status); return `<span class="pill ${ok ? '' : 'orange'}">${esc(status || 'NOT RUN')}</span>` }
function nowResult() { return app.state?.schedules?.optimized }
function completedStorageKey(pid) { return `scenegraph_completed_scenes_${pid}` }
function getCompletedSceneSet(s = app.state) {
  if (!s || !s.scenes) return new Set();
  const valid = new Set(s.scenes.map(sc => Number(sc.scene_id)));
  let raw = Array.isArray(s.completed_scenes) ? s.completed_scenes : null;
  try {
    const localRaw = localStorage.getItem(completedStorageKey(s.id));
    if (localRaw !== null) {
      const parsed = JSON.parse(localRaw);
      if (Array.isArray(parsed)) raw = parsed;
    }
  } catch { }
  return new Set((raw || []).map(Number).filter(id => valid.has(id)));
}
async function updateCompletedScenes(nextSet, triggerWrapModal = true) {
  const s = app.state;
  if (!s || !s.scenes) return;
  const valid = new Set(s.scenes.map(sc => Number(sc.scene_id)));
  const arr = [...nextSet].map(Number).filter(id => valid.has(id)).sort((a, b) => a - b);
  s.completed_scenes = arr;
  try { localStorage.setItem(completedStorageKey(s.id), JSON.stringify(arr)) } catch { }
  const scrollY = window.scrollY;
  render();
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  if (triggerWrapModal && s.scenes.length > 0 && arr.length === s.scenes.length) {
    openWrapCelebrationModal(s);
  }
  try {
    fetch(API_BASE + '/api/shoot-progress', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: s.id, completed_scenes: arr })
    }).catch(() => {});
  } catch { }
}
function openWrapCelebrationModal(s = app.state, step = 'celebrate') {
  if (!s) return;
  const r = nowResult();
  const prodDays = r?.metrics?.production_days || s.settings?.days || '—';
  const colors = ['#e5aa6e', '#77dbcb', '#f4d06f', '#8daeee', '#ef988e', '#b7dfa9'];
  const confettiHtml = Array.from({ length: 30 }, (_, i) => {
    const left = ((i * 31) % 96) + 2;
    const delay = ((i * 0.12) % 2.2).toFixed(2);
    const dur = (2.4 + (i % 5) * 0.4).toFixed(2);
    const color = colors[i % colors.length];
    const shape = i % 3 === 0 ? 'confetti-star' : i % 2 === 0 ? 'confetti-circle' : 'confetti-rect';
    return `<span class="wrap-confetti ${shape}" style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;--c:${color}"></span>`;
  }).join('');

  const heroGraphic = step === 'theaters' ? `
    <div class="wrap-clapper-stage">
      <div class="wrap-clap-burst">★ HOUSEFULL PREMIERE ★</div>
      <svg class="wrap-clapper-svg" viewBox="0 0 160 104">
        <rect x="12" y="10" width="136" height="78" rx="9" fill="#182028" stroke="#f4d06f" stroke-width="2.4"/>
        <rect x="20" y="20" width="120" height="48" rx="5" fill="#111820" stroke="#77dbcb" stroke-width="1.4"/>
        <circle cx="28" cy="15" r="2" fill="#f4d06f"/><circle cx="48" cy="15" r="2" fill="#f4d06f"/><circle cx="68" cy="15" r="2" fill="#f4d06f"/><circle cx="92" cy="15" r="2" fill="#f4d06f"/><circle cx="112" cy="15" r="2" fill="#f4d06f"/><circle cx="132" cy="15" r="2" fill="#f4d06f"/>
        <text x="80" y="40" text-anchor="middle" fill="#f4d06f" font-size="8.5" font-weight="800" letter-spacing="1.6">NOW SHOWING</text>
        <text x="80" y="57" text-anchor="middle" fill="#77dbcb" font-size="11" font-weight="800" letter-spacing="0.8">IN THEATERS 🍿</text>
        <text x="80" y="80" text-anchor="middle" fill="#e5aa6e" font-size="7.5" font-weight="800" letter-spacing="1.4">★ GRAND RELEASE ★</text>
      </svg>
    </div>
  ` : `
    <div class="wrap-clapper-stage">
      <div class="wrap-clap-burst">★ CLAP! IT’S A WRAP ★</div>
      <svg class="wrap-clapper-svg" viewBox="0 0 160 104">
        <defs>
          <clipPath id="clapperBarClip">
            <rect x="14" y="12" width="132" height="16" rx="4"/>
          </clipPath>
        </defs>
        <g class="clapper-top-bar">
          <rect x="14" y="12" width="132" height="16" rx="4" fill="#232c35" stroke="#e5aa6e" stroke-width="2"/>
          <g clip-path="url(#clapperBarClip)">
            <path d="M24 10 L38 30 M52 10 L66 30 M80 10 L94 30 M108 10 L122 30 M134 10 L148 30" stroke="#e5aa6e" stroke-width="6" stroke-linecap="butt"/>
          </g>
          <rect x="14" y="12" width="132" height="16" rx="4" fill="none" stroke="#e5aa6e" stroke-width="2"/>
        </g>
        <rect x="14" y="30" width="132" height="64" rx="8" fill="#182028" stroke="#77dbcb" stroke-width="2.2"/>
        <line x1="14" y1="49" x2="146" y2="49" stroke="#31404e" stroke-width="1.5"/>
        <text x="80" y="43" text-anchor="middle" fill="#e5aa6e" font-size="7.2" font-weight="800" letter-spacing="1.1">SCENEGRAPH STUDIO</text>
        <text x="80" y="69" text-anchor="middle" fill="#77dbcb" font-size="11.5" font-weight="800" letter-spacing="0.8">100% FILMED ✓</text>
        <text x="80" y="85" text-anchor="middle" fill="#b7bec7" font-size="7.2" font-weight="700" letter-spacing="1.1">SHOOTING DONE!</text>
      </svg>
    </div>
  `;

  let stepBody = '';
  if (step === 'celebrate') {
    stepBody = `
      <div class="wrap-clapper-badge">🎉 YAAAY! SHOOTING IS 100% DONE!</div>
      <h2 class="wrap-headline">“That’s a Wrap on <em>${esc(s.title)}</em>!”</h2>
      <div class="wrap-mini-pills">
        <span>✓ <strong>${s.scenes.length}</strong> Scenes Filmed</span>
        <span>•</span>
        <span><strong>${prodDays}</strong> Shoot Days</span>
        <span>•</span>
        <span><strong>${s.characters.length}</strong> Cast</span>
        <span>•</span>
        <span><strong>${s.locations.length}</strong> Sets</span>
      </div>
      <div class="wrap-message-box">
        <p class="wrap-msg-highlight">🎉 <strong>Yaaay, shooting is 100% done</strong> — all <strong>${s.scenes.length} scenes</strong> are officially filmed, which means it’s time for the real plot twist: <strong>Post-Production & Editing!</strong></p>
      </div>
      <p class="wrap-prompt-question">How are you feeling about jumping into the Editing Room right now?</p>
      <div class="wrap-choice-row">
        <button type="button" class="wrap-choice-btn choice-pumped" data-action="wrap-step" data-step="pumped">
          <span class="choice-emoji">🔥</span>
          <div>
            <strong>Yaaay! Let’s go do the editing!</strong>
            <small>Bring on the cutting room & sound mix</small>
          </div>
        </button>
        <button type="button" class="wrap-choice-btn choice-tired" data-action="wrap-step" data-step="motivation">
          <span class="choice-emoji">😮‍💨</span>
          <div>
            <strong>Honestly exhausted / overwhelmed…</strong>
            <small>Shooting took everything out of me</small>
          </div>
        </button>
      </div>
    `;
  } else if (step === 'motivation') {
    stepBody = `
      <div class="wrap-clapper-badge">💪 DIRECTOR’S PEP TALK • YOU’VE GOT THIS!</div>
      <h2 class="wrap-headline">“You Can Manage This!”</h2>
      <div class="wrap-message-box motivation-glow">
        <p class="wrap-msg-highlight">🌟 Finishing <strong>${s.scenes.length} scenes</strong> on set is a massive achievement, so take a well-deserved breather—if you conquered the shoot, you can easily manage the editing room one cut at a time!</p>
      </div>
      <div class="footer-actions" style="justify-content:center;margin-top:16px">
        <button type="button" class="button button-primary" data-action="wrap-step" data-step="theaters">🍿 NEXT STOP: THEATERS! ➔</button>
      </div>
    `;
  } else if (step === 'pumped') {
    stepBody = `
      <div class="wrap-clapper-badge">✂️ NEXT CHAPTER • POST-PRODUCTION & EDITING</div>
      <h2 class="wrap-headline">“Now the Real Magic Begins!”</h2>
      <div class="wrap-message-box pumped-glow">
        <p class="wrap-msg-highlight">✂️ You conquered all <strong>${s.scenes.length} scenes</strong> on set, and now you get to bring your story to life—have the best time shaping the cut, music, and color in the editing room!</p>
      </div>
      <div class="footer-actions" style="justify-content:center;margin-top:16px">
        <button type="button" class="button button-primary" data-action="wrap-step" data-step="theaters">🍿 NEXT STOP: THE BIG SCREEN! ➔</button>
      </div>
    `;
  } else {
    stepBody = `
      <div class="wrap-clapper-badge">🍿 GRAND FINALE • BIG SCREEN BOUND</div>
      <h2 class="wrap-headline">“See <em>${esc(s.title)}</em> in Theaters!”</h2>
      <div class="wrap-message-box theater-glow">
        <p class="wrap-msg-highlight">🍿 Wishing the entire cast and crew all the very best for post-production—may every show run <strong>HOUSEFULL</strong>, and <strong>see your movie on the big screen in theaters soon!</strong></p>
        <div class="wrap-signoff">★ LIGHTS DOWN • CURTAIN UP • SEE YOU AT THE PREMIERE ★</div>
      </div>
      <div class="footer-actions" style="justify-content:center;margin-top:16px">
        ${r && r.assignments?.length && !s.schedule_stale ? '<button type="button" class="button button-mint" data-action="export" data-format="pdf">⇩ WRAP REPORT (PDF)</button>' : ''}
        <button type="button" class="button button-primary" data-action="close-modal">🎬 BACK TO STUDIO</button>
      </div>
    `;
  }

  openModal('🎬 PRODUCTION WRAP CELEBRATION', `
    <div class="wrap-celebration-modal">
      <div class="wrap-confetti-layer" aria-hidden="true">${confettiHtml}</div>
      <div class="wrap-hero-graphics" aria-hidden="true">
        <div class="wrap-spotlight spot-left"></div>
        <div class="wrap-spotlight spot-right"></div>
        <svg class="wrap-reel-svg reel-left" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="#171f27" stroke="#e5aa6e" stroke-width="2.5"/><circle cx="32" cy="32" r="7" fill="#e5aa6e"/>
          <circle cx="32" cy="14" r="5" fill="#26323f" stroke="#77dbcb" stroke-width="1.5"/><circle cx="32" cy="50" r="5" fill="#26323f" stroke="#77dbcb" stroke-width="1.5"/>
          <circle cx="14" cy="32" r="5" fill="#26323f" stroke="#77dbcb" stroke-width="1.5"/><circle cx="50" cy="32" r="5" fill="#26323f" stroke="#77dbcb" stroke-width="1.5"/>
        </svg>
        ${heroGraphic}
        <svg class="wrap-reel-svg reel-right" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="#171f27" stroke="#77dbcb" stroke-width="2.5"/><circle cx="32" cy="32" r="7" fill="#77dbcb"/>
          <circle cx="32" cy="14" r="5" fill="#26323f" stroke="#e5aa6e" stroke-width="1.5"/><circle cx="32" cy="50" r="5" fill="#26323f" stroke="#e5aa6e" stroke-width="1.5"/>
          <circle cx="14" cy="32" r="5" fill="#26323f" stroke="#e5aa6e" stroke-width="1.5"/><circle cx="50" cy="32" r="5" fill="#26323f" stroke="#e5aa6e" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="wrap-step-dots" aria-hidden="true">
        <span class="wrap-dot ${step === 'celebrate' ? 'active' : ''}"></span>
        <span class="wrap-dot ${step === 'pumped' || step === 'motivation' ? 'active' : ''}"></span>
        <span class="wrap-dot ${step === 'theaters' ? 'active' : ''}"></span>
      </div>
      ${stepBody}
    </div>
  `);
}
function renderShootCalendarCard(s, r, fullPage = false) {
  const completed = getCompletedSceneSet(s);
  const total = s.scenes.length;
  const doneCount = completed.size;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;
  const sceneMap = Object.fromEntries(s.scenes.map(sc => [sc.scene_id, sc]));
  const hasAssignments = Boolean(r?.assignments?.length);
  const filter = app.trackerFilter || 'all';

  let calendarBody = '';
  if (hasAssignments) {
    const allDays = [...new Set(r.assignments.map(a => a.day))].sort((a, b) => a - b);
    const wrappedDays = allDays.filter(day => {
      const dayItems = r.assignments.filter(a => a.day === day);
      return dayItems.length > 0 && dayItems.every(a => completed.has(Number(a.scene_id)));
    }).length;

    const visibleDays = allDays.filter(day => {
      if (filter === 'all') return true;
      const dayItems = r.assignments.filter(a => a.day === day);
      const isDayWrapped = dayItems.length > 0 && dayItems.every(a => completed.has(Number(a.scene_id)));
      return filter === 'wrapped' ? isDayWrapped : !isDayWrapped;
    });

    calendarBody = `
      <div class="shoot-calendar-meta">
        <div class="graph-filters">
          <button type="button" class="graph-filter-btn ${filter === 'all' ? 'active' : ''}" data-action="tracker-filter" data-filter="all">ALL DAYS (${allDays.length})</button>
          <button type="button" class="graph-filter-btn ${filter === 'pending' ? 'active' : ''}" data-action="tracker-filter" data-filter="pending">REMAINING DAYS (${allDays.length - wrappedDays})</button>
          <button type="button" class="graph-filter-btn ${filter === 'wrapped' ? 'active' : ''}" data-action="tracker-filter" data-filter="wrapped">WRAPPED DAYS (${wrappedDays})</button>
        </div>
        <span>🎬 Click any scene or day card to mark it as Done Shooting</span>
      </div>
      ${visibleDays.length ? `<div class="shoot-calendar-grid ${fullPage ? 'full-page-grid' : ''}">
        ${visibleDays.map(day => {
          const dayItems = r.assignments.filter(a => a.day === day).sort((a, b) => a.start_slot - b.start_slot);
          const dayDoneCount = dayItems.filter(a => completed.has(Number(a.scene_id))).length;
          const isDayWrapped = dayItems.length > 0 && dayDoneCount === dayItems.length;
          const hours = (dayItems.reduce((acc, a) => acc + (a.end_slot - a.start_slot), 0) / 2).toLocaleString();
          return `
            <div class="shoot-day-card ${isDayWrapped ? 'day-wrapped' : ''}">
              <div class="shoot-day-header">
                <div>
                  <span class="shoot-day-title">DAY ${day + 1}</span>
                  <small class="shoot-day-sub">${dayDoneCount}/${dayItems.length} shot · ${hours}h</small>
                </div>
                <button type="button" class="small-button ${isDayWrapped ? 'btn-day-wrapped' : ''}" data-action="toggle-day-shot" data-day="${day}" title="${isDayWrapped ? 'Unmark all scenes on Day ' + (day + 1) : 'Mark all scenes on Day ' + (day + 1) + ' as Done Shooting'}">
                  ${isDayWrapped ? '✓ DAY WRAPPED' : '✓ MARK DAY'}
                </button>
              </div>
              <div class="shoot-day-scenes">
                ${dayItems.map(item => {
                  const sc = sceneMap[item.scene_id] || {};
                  const isShot = completed.has(Number(item.scene_id));
                  return `
                    <button type="button" class="shoot-scene-item ${isShot ? 'is-shot' : ''}" data-action="toggle-scene-shot" data-id="${item.scene_id}" title="Click to mark Scene ${sc.script_order} as ${isShot ? 'Pending' : 'Done Shooting'}">
                      <span class="shoot-check-box">${isShot ? '✓' : ''}</span>
                      <span class="shoot-scene-code">S${String(sc.script_order || item.scene_id).padStart(2, '0')}</span>
                      <span class="shoot-scene-loc">${esc(sc.location || sc.heading || 'Scene')}</span>
                      <span class="shoot-scene-time">${scheduleTimeLabel(item.start_slot)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>` : `<div class="empty">No shoot days match the "${esc(filter)}" filter.</div>`}
    `;
  } else {
    const visibleScenes = s.scenes.filter(sc => {
      if (filter === 'all') return true;
      const isShot = completed.has(Number(sc.scene_id));
      return filter === 'wrapped' ? isShot : !isShot;
    });
    calendarBody = `
      <div class="shoot-calendar-meta">
        <div class="graph-filters">
          <button type="button" class="graph-filter-btn ${filter === 'all' ? 'active' : ''}" data-action="tracker-filter" data-filter="all">ALL SCENES (${total})</button>
          <button type="button" class="graph-filter-btn ${filter === 'pending' ? 'active' : ''}" data-action="tracker-filter" data-filter="pending">REMAINING (${total - doneCount})</button>
          <button type="button" class="graph-filter-btn ${filter === 'wrapped' ? 'active' : ''}" data-action="tracker-filter" data-filter="wrapped">WRAPPED (${doneCount})</button>
        </div>
        <span>🎬 Build a schedule in Production Planner to organize this calendar by Shoot Day</span>
      </div>
      ${visibleScenes.length ? `<div class="shoot-unscheduled-grid ${fullPage ? 'full-page-grid' : ''}">
        ${visibleScenes.map(sc => {
          const isShot = completed.has(Number(sc.scene_id));
          return `
            <button type="button" class="shoot-scene-item ${isShot ? 'is-shot' : ''}" data-action="toggle-scene-shot" data-id="${sc.scene_id}">
              <span class="shoot-check-box">${isShot ? '✓' : ''}</span>
              <span class="shoot-scene-code">S${String(sc.script_order).padStart(2, '0')}</span>
              <span class="shoot-scene-loc">${esc(sc.location)}</span>
              <span class="shoot-scene-time">${formatDuration(sc.duration_slots)}</span>
            </button>
          `;
        }).join('')}
      </div>` : `<div class="empty">No scenes match the "${esc(filter)}" filter.</div>`}
    `;
  }

  return `
    <div class="card shoot-tracker-card ${allDone ? 'all-scenes-wrapped' : ''}">
      <div class="card-heading" style="flex-wrap:wrap;gap:12px">
        <div>
          <span class="eyebrow" style="margin:0 0 4px 0;display:block">ON-SET PRODUCTION TRACKER & SHOOT CALENDAR</span>
          <h3 style="margin:0">Shoot completion tracker ${allDone ? '🎬 — IT’S A WRAP!' : ''}</h3>
        </div>
        <div class="footer-actions" style="margin-top:0">
          <span class="pill ${allDone ? '' : 'orange'}">${doneCount} / ${total} SCENES SHOT (${pct}%)</span>
          <button type="button" class="small-button button-mint" data-action="mark-all-scenes" ${allDone ? 'disabled' : ''}>✓ MARK ALL</button>
          <button type="button" class="small-button" data-action="mark-none-scenes" ${doneCount === 0 ? 'disabled' : ''}>✕ MARK NONE</button>
          ${allDone ? '<button type="button" class="small-button button-primary" data-action="show-wrap-modal">🎉 VIEW WRAP MESSAGE</button>' : ''}
        </div>
      </div>
      <div class="shoot-progress-bar-wrap">
        <div class="shoot-progress-track">
          <div class="shoot-progress-fill ${allDone ? 'complete' : ''}" style="width:${pct}%"></div>
        </div>
      </div>
      ${calendarBody}
    </div>
  `;
}
function renderTracker() {
  const s = app.state, r = nowResult();
  const completed = getCompletedSceneSet(s);
  const total = s.scenes.length;
  const doneCount = completed.size;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;
  const hasAssignments = Boolean(r?.assignments?.length);
  const allDays = hasAssignments ? [...new Set(r.assignments.map(a => a.day))].sort((a, b) => a - b) : [];
  const wrappedDays = allDays.filter(day => {
    const dayItems = r.assignments.filter(a => a.day === day);
    return dayItems.length > 0 && dayItems.every(a => completed.has(Number(a.scene_id)));
  }).length;
  const statusLabel = allDone ? 'WRAPPED 🎬' : doneCount > 0 ? `${pct}% SHOT` : 'PRE-SHOOT';
  return `${sectionTitle('04 / ON-SET TRACKER', 'Shoot completion calendar.', 'Check off scenes and shoot days as filming progresses on set. Mark all scenes done to wrap principal photography.', `<span class="tag ${allDone ? '' : 'amber'}">${doneCount} / ${total} SCENES WRAPPED</span>`)}
    <div class="stat-grid">
      ${stat('SCENES WRAPPED', `${doneCount} / ${total}`, `${pct}% filming completed`, 'mint')}
      ${stat('REMAINING SCENES', String(total - doneCount), 'Left to shoot on set', 'amber')}
      ${stat('DAYS WRAPPED', hasAssignments ? `${wrappedDays} / ${allDays.length}` : '—', hasAssignments ? 'Full shoot days completed' : 'Build schedule in Planner', 'blue')}
      ${stat('SHOOT STATUS', statusLabel, allDone ? 'Ready for editing & post' : 'Principal photography', allDone ? 'mint' : 'amber')}
    </div>
    ${renderShootCalendarCard(s, r, true)}`;
}
function render() { if (!app.state) return; const s = app.state; if ($('#projectSelect')) $('#projectSelect').value = String(s.id); updateProjectDropdown(); $('#deleteProjectBtn').hidden = false; $('#exportBtn').hidden = false; $('#currentCrumb').textContent = labels[app.view]; document.querySelectorAll('.nav-link[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === app.view)); const advancedViews = ['graph', 'continuity', 'analytics']; $('#moreTools').open = advancedViews.includes(app.view); $('#moreTools').querySelector('summary').classList.toggle('active', advancedViews.includes(app.view)); const routes = { overview: renderOverview, studio: renderStudio, planner: renderPlanner, tracker: renderTracker, graph: renderGraph, continuity: renderContinuity, analytics: renderAnalytics }; $('#content').innerHTML = routes[app.view](); if (app.view === 'planner') renderPlannerExtras(); if (app.view === 'graph') requestAnimationFrame(drawGraph) }
function scheduleTimeLabel(slot) { const minutes = 8 * 60 + slot * 30; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
function formatDuration(slots) { const minutes = slots * 30; if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60), remainder = minutes % 60; return remainder ? `${hours}h ${remainder}m` : `${hours}h` }
function renderPreflight(s) {
  const check = s.schedule_preflight, blocked = check.issues.length > 0;
  const issues = blocked
    ? `<ul class="preflight-issues">${check.issues.map(issue => `<li>${esc(issue.message)}</li>`).join('')}</ul>`
    : '<p class="muted">Quick checks passed. Building the schedule will check all constraints together.</p>';
  return `<section class="card preflight-card ${blocked ? 'needs-attention' : ''}"><div class="card-heading"><h3>Schedule check</h3><span class="tag ${blocked ? 'amber' : ''}">${blocked ? 'REVIEW NEEDED' : 'READY'}</span></div>${issues}</section>`;
}
function renderPlannerExtras() {
  const s = app.state, c = s.settings, root = $('#content'), intro = root.querySelector('.page-intro');
  if (!intro) return;
  const defaults = s.default_schedule_config;
  const participants = [
    ...s.characters.map(x => ({ value: `actor_blocks:${x.id}`, label: `Actor — ${x.name}` })),
    ...s.locations.map(x => ({ value: `location_blocks:${x.id}`, label: `Location — ${x.name}` })),
  ];
  const names = {
    actor_blocks: Object.fromEntries(s.characters.map(x => [String(x.id), x.name])),
    location_blocks: Object.fromEntries(s.locations.map(x => [String(x.id), x.name])),
  };
  const blocks = [
    ...Object.entries(c.actor_blocks || {}).flatMap(([id, items]) => items.map((block, index) => ({ kind: 'actor_blocks', id, index, block, name: names.actor_blocks[id] || 'Actor' }))),
    ...Object.entries(c.location_blocks || {}).flatMap(([id, items]) => items.map((block, index) => ({ kind: 'location_blocks', id, index, block, name: names.location_blocks[id] || 'Location' }))),
  ];
  const blockList = blocks.length
    ? `<div class="constraint-list">${blocks.map(({ kind, id, index, block, name }) => `<div class="constraint-row"><span><strong>${esc(name)}</strong> · Day ${block.day + 1} · ${scheduleTimeLabel(block.start)}–${scheduleTimeLabel(block.end)}</span><button class="small-button" data-action="remove-constraint" data-kind="${kind}" data-id="${id}" data-index="${index}">REMOVE</button></div>`).join('')}</div>`
    : '<div class="empty">No actor or location unavailability constraints added yet.</div>';
  const participantOptions = participants.map(x => `<option value="${x.value}">${esc(x.label)}</option>`).join('');
  const dayOptions = Array.from({ length: c.days }, (_, day) => `<option value="${day}">Day ${day + 1}</option>`).join('');
  const startOptions = Array.from({ length: c.slots_per_day }, (_, slot) => `<option value="${slot}">${scheduleTimeLabel(slot)}</option>`).join('');
  const endOptions = Array.from({ length: c.slots_per_day }, (_, slot) => `<option value="${slot + 1}" ${slot + 1 === Math.min(16, c.slots_per_day) ? 'selected' : ''}>${scheduleTimeLabel(slot + 1)}</option>`).join('');
  intro.insertAdjacentHTML('afterend', `${renderPreflight(s)}
    <details class="card planner-details constraint-entry-card" id="availabilityDetails">
      <summary class="details-summary"><span>Availability & constraints</span><small>${blocks.length ? `${blocks.length} restriction(s) applied` : 'Optional · none added'}</small></summary>
      <div class="planner-details-content">
      <p class="muted">Add unavailable times for actors or locations before building the schedule.</p>
      <form id="constraintForm" class="constraint-form">
        <div class="field"><label>WHO IS UNAVAILABLE?</label><select class="select" id="constraintParticipant" required><option value="">Choose an actor or location</option>${participantOptions}</select></div>
        <div class="field"><label>PRODUCTION DAY</label><select class="select" id="constraintDay">${dayOptions}</select></div>
        <div class="field"><label>FROM</label><select class="select" id="constraintStart">${startOptions}</select></div>
        <div class="field"><label>UNTIL</label><select class="select" id="constraintEnd">${endOptions}</select></div>
        <button class="button button-primary" type="submit" ${participants.length ? '' : 'disabled'}>ADD UNAVAILABLE TIME</button>
      </form>
      <p class="scroll-note">Times start at 08:00. Click a calendar day below to block it for the full day.</p>
      <h4>Constraints currently applied to your schedule</h4>${blockList}
      </div>
    </details>`);
  const daysField = $('#daysInput')?.closest('.field');
  if (daysField) daysField.insertAdjacentHTML('beforeend', `<small class="muted">Recommended: ${defaults.estimated_days} day(s) at 8 hours/day.</small>`);
  root.querySelectorAll('[data-action="toggle-availability"]').forEach(button => {
    const kind = button.dataset.kind, id = button.dataset.id, day = Number(button.dataset.day);
    const blocksForDay = (c[kind][id] || []).filter(block => block.day === day);
    const full = blocksForDay.some(block => block.start === 0 && block.end === c.slots_per_day);
    button.textContent = full ? 'BLOCKED' : blocksForDay.length ? 'PARTIAL' : 'OPEN';
    button.classList.toggle('blocked', blocksForDay.length > 0);
  });
}
function renderOverview() {
  const s = app.state, r = nowResult(), f = s.schedule_preflight, success = ['OPTIMAL', 'FEASIBLE', 'HEURISTIC_FEASIBLE'].includes(r?.status), current = success && !s.schedule_stale, infeasible = r?.status === 'INFEASIBLE'; const planLabel = current ? `Schedule ${r.status === 'HEURISTIC_FEASIBLE' ? 'ready' : r.status.toLowerCase()}` : infeasible ? 'Schedule is infeasible' : r ? 'Schedule needs updating' : f.issues.length ? 'Resolve schedule checks' : 'Ready to build your schedule'; const planDetail = current ? `${r.metrics.production_days ?? '—'} production day(s) · ${r.elapsed_ms} ms` : infeasible ? r.message : s.schedule_stale ? 'Changes have made the saved schedule outdated.' : f.issues.length ? f.issues[0].message : 'Quick checks passed; optimization will verify all constraints.'; const nextStep = current ? 'Your schedule is ready to review or export.' : infeasible ? 'Adjust the calendar or availability constraints, then run the checks again.' : s.scenes.length ? 'Review the imported scenes, then add any availability constraints before optimizing.' : 'Import a screenplay to start planning.'; return `${sectionTitle('OVERVIEW', 'Production at a glance.', 'Your screenplay, planning status, and the next useful action.', `<span class="tag amber">${esc(s.title)}</span>`)}
<div class="stat-grid overview-stats">${stat('SCENES', s.scenes.length, 'Imported from screenplay', 'amber')}${stat('CAST', s.characters.length, 'Recognized speakers', 'mint')}${stat('LOCATIONS', s.locations.length, 'Production sets', 'blue')}</div>
<div class="grid-2 overview-grid"><section class="card"><div class="card-heading"><h3>Schedule</h3><span class="tag ${current ? '' : 'amber'}">${current ? 'UP TO DATE' : infeasible ? 'INFEASIBLE' : r ? 'OUTDATED' : 'NOT CREATED'}</span></div><strong class="overview-status">${planLabel}</strong><p class="muted">${esc(planDetail)}</p>${f.issues.length ? `<ul class="preflight-issues">${f.issues.slice(0, 2).map(issue => `<li>${esc(issue.message)}</li>`).join('')}</ul>` : ''}<button class="button button-primary" data-action="navigate" data-target="planner">${current ? 'VIEW SCHEDULE' : 'OPEN SCHEDULE'} ↗</button></section>
<section class="card"><div class="card-heading"><h3>Next step</h3></div><p class="muted">${nextStep}</p><div class="footer-actions"><button class="button" data-action="navigate" data-target="studio">REVIEW SCRIPT</button>${current ? '<button class="button" data-action="export" data-format="csv">EXPORT SCHEDULE</button>' : ''}</div></section></div>`
}
function renderStudio() {
  const s = app.state;
  const completed = getCompletedSceneSet(s);
  const doneCount = completed.size;
  const allDone = s.scenes.length > 0 && doneCount === s.scenes.length;
  return `${sectionTitle('01 / DATA ENGINEERING', 'Script studio.', 'Upload a screenplay, review scene estimates, and correct the details.', `<span class="tag">${s.scenes.length} SCENES</span>`)}
    <div class="layout-stack">
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <span class="eyebrow" style="margin:0 0 4px 0">ACTIVE PRODUCTION</span>
          <h3 style="margin:0 0 6px 0">${esc(s.title)}</h3>
          <p class="muted" style="margin:0">${s.scenes.length} scenes parsed · ${s.characters.length} cast members · ${s.locations.length} locations · <strong>${doneCount}/${s.scenes.length} scenes wrapped</strong></p>
        </div>
        <div class="footer-actions" style="margin-top:0">
          <button class="button button-primary" data-action="navigate" data-target="planner">OPEN SHOOTING SCHEDULE ↗</button>
        </div>
      </div>
      <div class="card"><div class="card-heading" style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:10px"><h3>Scenes</h3><span class="tag ${allDone ? '' : 'amber'}">${doneCount} / ${s.scenes.length} SHOT</span></div><div class="footer-actions" style="margin-top:0"><button class="small-button button-mint" data-action="mark-all-scenes" ${allDone ? 'disabled' : ''}>✓ MARK ALL</button><button class="small-button" data-action="mark-none-scenes" ${doneCount === 0 ? 'disabled' : ''}>✕ MARK NONE</button><button class="small-button" data-action="estimate-durations">RE-ESTIMATE TIMES</button></div></div><p class="muted">Shoot times are rough estimates from screenplay cues. Review and adjust them before scheduling, and mark scenes as they wrap on set.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>STATUS</th><th>SCENE</th><th>LOCATION</th><th>TIME</th><th>CAST</th><th>EST. SHOOT TIME</th><th></th></tr></thead><tbody>${s.scenes.map(x => { const isShot = completed.has(Number(x.scene_id)); return `<tr class="${isShot ? 'row-scene-shot' : ''}"><td><button type="button" class="small-button ${isShot ? 'btn-scene-shot' : ''}" data-action="toggle-scene-shot" data-id="${x.scene_id}">${isShot ? '✓ DONE' : '○ SHOOT'}</button></td><td><span class="scene-index">${x.script_order.toString().padStart(2, '0')}</span></td><td><strong>${esc(x.location)}</strong><br><small class="muted">${esc(x.heading)}</small></td><td>${esc(x.time_of_day)}</td><td><div class="cast-chips">${x.speakers.length ? x.speakers.map(n => `<span class="cast-chip">${esc(n)}</span>`).join('') : '<span class="muted">Not verified</span>'}</div></td><td>${formatDuration(x.duration_slots)}</td><td><button class="small-button" data-action="edit-scene" data-id="${x.scene_id}">EDIT</button></td></tr>` }).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-heading"><h3>Cast and locations</h3></div><div class="form-grid"><form id="actorAddForm" class="inline-form"><input class="input" id="newActorName" placeholder="Add cast member" required><button class="small-button" type="submit">+ ADD CAST</button></form><form id="locationAddForm" class="inline-form"><input class="input" id="newLocationName" placeholder="Add filming location" required><button class="small-button" type="submit">+ ADD LOCATION</button></form></div></div>
      <details class="card planner-details" style="padding:0">
        <summary class="details-summary"><span>Import or replace screenplay</span><small>Upload another .fountain, .txt or .pdf</small></summary>
        <div class="planner-details-content" style="margin-top:15px">
          <div class="dropzone"><div><strong>Bring another story into the system.</strong><p>Upload .fountain, .txt or .pdf.</p></div><label class="file-label">CHOOSE FILE <input type="file" id="scriptFile" accept=".fountain,.txt,.pdf,text/plain,application/pdf"></label></div>
          <div class="field" style="margin:13px 0"><label>PRODUCTION TITLE</label><input class="input" id="scriptTitle" placeholder="Enter your production title" value="${esc(s.title)}"></div>
          <div class="field"><label>SCREENPLAY SOURCE</label><textarea class="textarea" id="scriptSource" placeholder="INT. CLASSROOM - DAY&#10;&#10;MIRA&#10;The shoot begins today."></textarea></div>
          <div class="footer-actions" style="margin-top:14px"><button class="button button-primary" data-action="import">CREATE PRODUCTION ↗</button></div>
        </div>
      </details>
    </div>`;
}
function renderGraph() {
  const s = app.state;
  const cc = Object.entries(s.graph.character_scene_counts || {}).sort((a, b) => b[1] - a[1]);
  const scenes = s.scenes || [];
  const chars = s.characters || [];
  const locs = s.locations || [];

  return `${sectionTitle('02 / GRAPH ENGINEERING', 'Stories are networks.', 'Explore relationships among scenes, dialogue speakers, and locations. Click any scene to zoom in and inspect details.', `<span class="tag">${s.graph.nodes.length} NODES · ${s.graph.edges.length} EDGES</span>`)}
  <div class="grid-2">
    <div>
      <div class="graph-stage-wrapper">
        <div class="graph-toolbar">
          <div class="graph-filters">
            <button type="button" class="graph-filter-btn active" data-graph-filter="all">ALL (${s.graph.nodes.length})</button>
            <button type="button" class="graph-filter-btn" data-graph-filter="scene">SCENES (${scenes.length})</button>
            <button type="button" class="graph-filter-btn" data-graph-filter="character">CAST (${chars.length})</button>
            <button type="button" class="graph-filter-btn" data-graph-filter="location">SETS (${locs.length})</button>
          </div>
          <div class="graph-jump-wrap">
            <select id="graphSceneJump" class="graph-jump-select" aria-label="Jump to scene">
              <option value="">Jump to scene...</option>
              ${scenes.map(sc => `<option value="s${sc.scene_id}">S${sc.script_order}: ${esc(sc.heading.length > 38 ? sc.heading.slice(0, 36) + '…' : sc.heading)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="graph-stage" id="graphStageContainer">
          <svg id="networkSvg" viewBox="0 0 900 530" role="img" aria-label="Interactive screenplay relationship graph"></svg>
          <div class="graph-zoom-controls">
            <button type="button" class="graph-ctrl-btn" id="graphZoomIn" title="Zoom in" aria-label="Zoom in">+</button>
            <button type="button" class="graph-ctrl-btn" id="graphZoomOut" title="Zoom out" aria-label="Zoom out">−</button>
            <button type="button" class="graph-ctrl-btn" id="graphZoomFit" title="Reset zoom and center" aria-label="Reset zoom">⤢</button>
          </div>
          <div class="graph-overlay-hint">Click any scene to zoom & inspect · Scroll to zoom · Drag canvas to pan</div>
        </div>

        <div class="graph-legend">
          <span><span class="legend-dot" style="background:#e5aa6e"></span>Scene</span>
          <span><span class="legend-dot" style="background:#76d6cb"></span>Character</span>
          <span><span class="legend-dot" style="background:#8fa9e4"></span>Location</span>
          <span><span class="legend-dot" style="background:#e6a0aa"></span>Tagged prop</span>
          <span class="muted" style="margin-left:auto">Click node to focus · Double-click canvas or ⤢ to reset</span>
        </div>
      </div>
    </div>
    <div class="layout-stack">
      <div class="graph-inspector" id="graphInspector">
        <div class="inspector-default">
          <div class="card-heading">
            <h3>Explore the connections</h3>
            <span class="pill">INTERACTIVE</span>
          </div>
          <p class="muted">Select any scene, character, or location in the network (or choose from the dropdown) to zoom in directly and view its production details.</p>
          <div class="graph-stat-pills" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="tag amber">${scenes.length} Scenes</span>
            <span class="tag mint">${chars.length} Characters</span>
            <span class="tag blue">${locs.length} Locations</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-heading">
          <h3>Character presence</h3>
          <span class="tag grey">SPEAKER EVIDENCE</span>
        </div>
        <div class="bars">${cc.map(([name, val]) => `<div><div class="bar-label"><span>${esc(name)}</span><span>${val} scene(s)</span></div><div class="bar-track"><div class="bar-fill" style="width:${100 * val / Math.max(1, ...cc.map(x => x[1]))}%"></div></div></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-heading">
          <h3>Graph integrity</h3>
        </div>
        <p class="muted">Every edge refers to a verified scene, speaker, or location ID. Dialogue presence does not imply physical presence.</p>
      </div>
    </div>
  </div>`;
}
function renderPlanner() {
  const s = app.state, c = s.settings, r = nowResult(), defaults = s.default_schedule_config;
  const blocks = [...Object.values(c.actor_blocks || {}), ...Object.values(c.location_blocks || {})].flat();
  const canApplyDefault = defaults.estimated_days <= defaults.max_days && !blocks.some(block => block.end > 16) && s.default_schedule?.assignments?.length === s.scenes.length;
  const recommendation = s.schedule_preflight.issues.length && canApplyDefault && (c.days < defaults.days || c.slots_per_day < 16)
    ? `<div class="notice"><strong>Suggested calendar:</strong> ${defaults.days} days · 8 hours/day${c.max_scenes_per_day ? ` · max ${c.max_scenes_per_day} scenes/day` : ''}. It fits all scenes and saved availability. <button class="button button-mint" data-action="apply-default-and-schedule">USE RECOMMENDED SETTINGS</button></div>` : '';
  const hasAssignments = Boolean(r?.assignments?.length);
  const resultBadge = r?.status === 'OPTIMAL' || r?.status === 'FEASIBLE'
    ? '<span class="pill">READY</span>'
    : r?.status === 'HEURISTIC_FEASIBLE'
      ? '<span class="pill orange">DRAFT</span>'
      : '<span class="pill orange">REVIEW SETTINGS</span>';
  const scheduleResult = r
    ? `<div class="card"><div class="card-heading"><h3>Your schedule</h3>${resultBadge}</div>${r.status === 'HEURISTIC_FEASIBLE' ? '<div class="notice">The optimizer timed out. This constraint-checked draft is not proven optimal. You can adjust scene placements directly below or change the settings and rebuild.</div>' : ''}${hasAssignments ? `<p class="muted">${r.assignments.length} scenes · ${r.metrics.production_days} days</p>${renderTimeline(r.assignments, c.slots_per_day, s.scenes, !s.schedule_stale)}` : `<div class="warning">${esc(r.message)}</div>`}</div>`
    : '<div class="empty">Your schedule will appear here after optimization.</div>';
  const dayOptions = (prefix, items) => `<div class="card"><div class="card-heading"><h3>${prefix} availability</h3><small>CLICK TO BLOCK / UNBLOCK FULL DAY</small></div>${items.length ? `<div style="overflow:auto"><table class="availability"><thead><tr><th>${prefix}</th>${Array.from({ length: c.days }, (_, i) => `<th>DAY ${i + 1}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.name)}</td>${Array.from({ length: c.days }, (_, d) => { const key = prefix === 'Actor' ? 'actor_blocks' : 'location_blocks'; const blocked = (c[key][String(item.id)] || []).some(b => b.day === d && b.start === 0 && b.end === c.slots_per_day); return `<td><button class="avail-cell ${blocked ? 'blocked' : ''}" data-action="toggle-availability" data-kind="${key}" data-id="${item.id}" data-day="${d}">${blocked ? 'BLOCKED' : 'OPEN'}</button></td>` }).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">No participants found.</div>'}</div>`;
  return `${sectionTitle('03 / PRODUCTION', 'Production schedule.', 'Review your inputs, optimize, then fine-tune scene placements.', r ? resultBadge : '<span class="tag amber">NOT BUILT</span>')}<div class="layout-stack"><details class="card planner-details" id="plannerCalendarDetails"><summary class="details-summary"><span>Calendar & availability</span><small>${c.days} days · ${c.slots_per_day / 2} hours/day${c.max_scenes_per_day ? ` · max ${c.max_scenes_per_day} scenes/day` : ''}</small></summary><div class="planner-details-content"><div class="card"><div class="card-heading"><h3>Production calendar</h3></div><div class="setting-grid"><div class="field"><label>DAYS</label><input type="number" class="input" min="1" max="${s.default_schedule_config.max_days}" id="daysInput" value="${c.days}"></div><div class="field"><label>HOURS PER DAY</label><input type="number" class="input" min="1" max="12" step="0.5" id="hoursInput" value="${c.slots_per_day / 2}"></div><div class="field"><label>MAX SCENES / DAY <small>(OPTIONAL)</small></label><input type="number" class="input" min="1" max="24" step="1" id="maxScenesInput" value="${c.max_scenes_per_day ?? ''}" placeholder="No limit"></div></div><div class="footer-actions" style="margin-top:17px"><button class="button" data-action="save-settings">SAVE</button></div></div><div class="split">${dayOptions('Actor', s.characters)}${dayOptions('Location', s.locations)}</div></div></details><div class="card"><div class="card-heading"><h3>Build your schedule</h3><span class="tag ${r ? (s.schedule_stale ? 'amber' : 'grey') : 'grey'}">${r ? (s.schedule_stale ? 'OUTDATED' : 'CURRENT') : 'NOT BUILT'}</span></div>${recommendation}<div class="footer-actions"><button class="button button-primary" data-action="schedule">${r ? 'REVIEW & REBUILD' : 'REVIEW & BUILD'} ↗</button><button class="button button-mint" title="Replan after a disruption" data-action="replan" ${r ? '' : 'disabled'}>REPLAN</button><button class="button" data-action="navigate" data-target="tracker">☑ OPEN SHOOT TRACKER ↗</button><button class="button" data-action="export" data-format="csv" ${r && r.assignments?.length && !s.schedule_stale ? '' : 'disabled'}>⇩ EXPORT CSV</button></div><p class="scroll-note" style="margin-top:13px">One crew. No overlapping scenes.</p></div>
${r && s.schedule_stale ? '<div class="warning">Your schedule is out of date. Rebuild it before use or export.</div>' : ''}${scheduleResult}</div>`
}
function renderTimeline(assignments, slots, scenes, editable = false) {
  const map = Object.fromEntries(scenes.map(scene => [scene.scene_id, scene]));
  const completed = getCompletedSceneSet(app.state);
  const days = [...new Set(assignments.map(item => item.day))].sort((a, b) => a - b);
  return `<div class="timeline">${days.map(day => {
    const today = assignments.filter(item => item.day === day).sort((a, b) => a.start_slot - b.start_slot);
    const hours = (today.reduce((total, item) => total + (item.end_slot - item.start_slot), 0) / 2).toLocaleString();
    const blocks = today.map(item => {
      const scene = map[item.scene_id], position = `left:${100 * item.start_slot / slots}%;width:calc(${100 * (item.end_slot - item.start_slot) / slots}% - 3px)`;
      const isShot = completed.has(Number(item.scene_id));
      const label = `<strong>${isShot ? '✓ ' : ''}S${String(scene.script_order).padStart(2, '0')}</strong><small>${esc(scene.location)}</small>`;
      return editable
        ? `<button type="button" class="scene-block ${isShot ? 'scene-wrapped' : ''}" data-action="edit-assignment" data-id="${item.scene_id}" aria-label="Edit scene ${scene.script_order} placement on day ${day + 1}" title="Edit scene ${scene.script_order}: ${esc(scene.heading)}${isShot ? ' (WRAPPED)' : ''}" style="${position};text-align:left">${label}</button>`
        : `<div class="scene-block ${isShot ? 'scene-wrapped' : ''}" title="${esc(scene.heading)}${isShot ? ' (WRAPPED)' : ''}" style="${position}">${label}</div>`;
    }).join('');
    return `<div class="timeline-day"><div class="timeline-heading"><strong>Day ${day + 1}</strong><span>${today.length} scenes · ${hours}h</span></div><div class="timeline-slots" style="grid-template-columns:repeat(${slots},1fr)">${Array.from({ length: slots }, () => '<span class="time-slot"></span>').join('')}${blocks}</div><div class="timeline-ticks"><span>08:00</span><span>${String(8 + Math.floor(slots / 4)).padStart(2, '0')}:00</span><span>${String(8 + Math.floor(slots / 2)).padStart(2, '0')}:00</span></div></div>`;
  }).join('')}</div>`;
}
function renderComparison(comp) { if (!comp) return '<p class="muted">Build a schedule first to compare results.</p>'; return comp.comparable ? `<div class="grid-equal">${['production_days', 'location_changes'].map(k => `<div class="metric-pair"><span>${k.replaceAll('_', ' ').toUpperCase()}</span><strong>${comp.baseline[k]} <span class="muted">→</span> <span class="text-mint">${comp.optimized[k]}</span></strong><small class="muted">${comp.deltas[k] >= 0 ? 'Reduction' : 'Increase'} of ${Math.abs(comp.deltas[k])}</small></div>`).join('')}</div><p class="scroll-note">${esc(comp.note)}</p>` : `<div class="notice">Quick draft: ${esc(comp.baseline_status)} / Optimized: ${esc(comp.optimized_status)}. ${esc(comp.note)}</div>` }
function renderContinuity() { const s = app.state, w = s.continuity_warnings; return `${sectionTitle('04 / CONTINUITY ENGINE', 'Nothing gets lost.', 'Record story-world prop events and detect contradictions in script order, regardless of shooting order.', `<span class="tag ${w.length ? 'amber' : ''}">${w.length} WARNINGS</span>`)}<div class="grid-equal"><div class="card"><div class="card-heading"><h3>Annotate a continuity event</h3><span class="tag grey">HUMAN-VERIFIED INPUT</span></div><form id="eventForm" class="layout-stack"><div class="form-grid"><div class="field"><label>STORY SCENE</label><select class="select" id="eventScene">${s.scenes.map(x => `<option value="${x.scene_id}">Scene ${x.script_order} — ${esc(x.location)}</option>`).join('')}</select></div><div class="field"><label>ACTION</label><select class="select" id="eventAction"><option>ACQUIRE</option><option>LOSE</option><option>USE</option><option>RECOVER</option></select></div><div class="field"><label>PROP LABEL</label><input id="eventProp" class="input" placeholder="e.g. CAMERA KEY" required></div><div class="field"><label>CHARACTER / HOLDER</label><select class="select" id="eventCharacter"><option value="GLOBAL">GLOBAL</option>${s.characters.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></div></div><button class="button button-primary" type="submit">ADD VERIFIED EVENT +</button></form></div><div class="card"><div class="card-heading"><h3>Continuity assessment</h3>${badge(w.length ? 'REVIEW REQUIRED' : 'NO KNOWN WARNINGS')}</div>${w.length ? w.map(x => `<div class="warning">⚠ Scene ${x.scene_id}: ${esc(x.message)}</div>`).join('') : '<div class="empty">No contradictions detected in currently annotated events.</div>'}<div class="notice" style="margin-top:16px"><strong>Scope:</strong> This engine reasons only over explicit annotations. Missing annotations cannot be interpreted as proof that a screenplay has no continuity errors.</div></div></div><div class="section-heading"><h3>Story timeline events</h3><span class="hint">Ordered by story-scene position, not shoot day</span></div><div class="card"><div class="event-list">${s.events.length ? s.events.map(e => `<div class="event-row"><div><strong>SCENE ${s.scenes.find(x => x.scene_id === e.scene_id)?.script_order} · ${esc(e.action)} ${esc(e.prop)}</strong><br><small>CHARACTER: ${esc(e.character)}</small></div><button class="small-button" data-action="delete-event" data-id="${e.id}">REMOVE</button></div>`).join('') : '<div class="empty">No annotations yet. Add a prop loss and subsequent use to demonstrate a continuity warning.</div>'}</div></div>` }
function renderAnalytics() { const s = app.state, c = s.comparison, rows = app.bench?.rows || []; return `${sectionTitle('05 / EXPERIMENTATION', 'Show the evidence.', 'Measure algorithm correctness, time, and scheduling efficiency using reproducible seeded scenarios.', `<span class="tag">FIXED-SEED BENCHMARKS</span>`)}<div class="layout-stack"><div class="card"><div class="card-heading"><h3>Current plan: quick draft vs optimized</h3><span class="tag grey">IDENTICAL INPUT CONSTRAINTS</span></div>${renderComparison(c)}</div><div class="card"><div class="card-heading"><h3>Benchmark laboratory</h3><span class="tag amber">SYNTHETIC DATA</span></div><div class="notice"><strong>Experimental design:</strong> Test 10, 20, and 40 scenes on reproducible generated datasets (seeds 11 and 23). Run identical hard constraints with both methods. Record failures and time limits separately; never manufacture improvement metrics.</div><div class="footer-actions" style="margin:20px 0"><button class="button button-primary" data-action="benchmark">RUN REPRODUCIBLE EXPERIMENTS ↗</button><span class="scroll-note">Each optimization run has a 2-second limit. Benchmarks may take several seconds.</span></div>${rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>SCENES</th><th>SEED</th><th>DRAFT</th><th>OPTIMIZED</th><th>BASE DAYS</th><th>OPT DAYS</th><th>RUNTIME</th><th>VALIDITY</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.scenes}</td><td>${r.seed}</td><td>${esc(r.baseline_status)}</td><td>${esc(r.optimizer_status)}</td><td>${r.baseline_days ?? '—'}</td><td>${r.optimized_days ?? '—'}</td><td>${r.optimizer_runtime_ms}ms</td><td>${r.violations === 0 ? '<span class="text-mint">0 violations</span>' : '<span class="text-red">Review</span>'}</td></tr>`).join('')}</tbody></table></div><div class="section-heading"><h3>Solver execution times</h3></div><div class="bars">${rows.map(r => `<div><div class="bar-label"><span>${r.scenes} scenes · seed ${r.seed}</span><span>${r.optimizer_runtime_ms}ms</span></div><div class="bar-track"><div class="bar-fill ${r.scenes >= 40 ? 'amber' : ''}" style="width:${100 * r.optimizer_runtime_ms / Math.max(1, ...rows.map(q => q.optimizer_runtime_ms))}%"></div></div></div>`).join('')}</div>` : '<div class="empty">Experiments have not been run in this browser session.</div>'}</div><div class="grid-equal"><div class="card"><div class="card-heading"><h3>Methodological honesty</h3></div><p class="muted">The solver objective groups locations by day as an approximate logistical proxy, while reported location changes count consecutive transitions. These are not identical measures. A feasible result is not always proven globally optimal.</p></div><div class="card"><div class="card-heading"><h3>Export production evidence</h3></div><p class="muted">Download schedules, full project data, or a readable production report tied to the latest saved state.</p><div class="footer-actions"><button class="small-button" data-action="export" data-format="json">PROJECT JSON</button><button class="small-button" data-action="export" data-format="pdf">REPORT PDF</button></div></div></div></div>` }
function drawGraph(){
  const svg = $('#networkSvg');
  if (!svg || !app.state?.graph?.nodes?.length) return;

  const data = app.state.graph;
  const nodes = data.nodes;
  const edges = data.edges;
  const s = app.state;
  const NS = 'http://www.w3.org/2000/svg';

  svg.innerHTML = '';

  // Root groups for layering (lines behind nodes)
  const linesGroup = document.createElementNS(NS, 'g');
  linesGroup.setAttribute('id', 'graphLinesGroup');
  svg.appendChild(linesGroup);

  const nodesGroup = document.createElementNS(NS, 'g');
  nodesGroup.setAttribute('id', 'graphNodesGroup');
  svg.appendChild(nodesGroup);

  // Separate nodes by kind
  const by = { scene: [], character: [], location: [], prop: [] };
  nodes.forEach(n => {
    if (by[n.kind]) by[n.kind].push(n);
  });

  // Sort scenes by script order
  by.scene.sort((a, b) => {
    const na = parseInt(a.label.replace('S', '')) || 0;
    const nb = parseInt(b.label.replace('S', '')) || 0;
    return na - nb;
  });

  // Sort characters by scene count descending
  const charCounts = s.graph.character_scene_counts || {};
  by.character.sort((a, b) => (charCounts[b.label] || 0) - (charCounts[a.label] || 0));

  // Sort locations by scene count descending
  const locCounts = s.graph.location_scene_counts || {};
  by.location.sort((a, b) => (locCounts[b.label] || 0) - (locCounts[a.label] || 0));

  const cx = 450, cy = 265;
  const pos = {};

  // 1. Position Characters (Inner rings)
  by.character.forEach((n, i) => {
    const count = charCounts[n.label] || 0;
    const isTop = count >= 5;
    const r = isTop ? 65 : 102;
    const angle = (i / Math.max(1, by.character.length)) * Math.PI * 2;
    pos[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * 0.74 * Math.sin(angle)
    };
  });

  // 2. Position Scenes (Staggered into 5 concentric rings to prevent hairball collisions)
  by.scene.forEach((n, i) => {
    const r = 145 + (i % 5) * 22; // Radii: 145, 167, 189, 211, 233
    const angle = (i / Math.max(1, by.scene.length) - 0.25) * Math.PI * 2;
    pos[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * 0.74 * Math.sin(angle)
    };
  });

  // 3. Position Locations (Outer rings, 3 staggered tracks)
  by.location.forEach((n, i) => {
    const r = 270 + (i % 3) * 25; // Radii: 270, 295, 320
    const angle = (i / Math.max(1, by.location.length) + 0.15) * Math.PI * 2;
    pos[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * 0.74 * Math.sin(angle)
    };
  });

  // 4. Position Props (Outermost ring)
  by.prop.forEach((n, i) => {
    const r = 352;
    const angle = (i / Math.max(1, by.prop.length)) * Math.PI * 2;
    pos[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * 0.74 * Math.sin(angle)
    };
  });

  // Draw Edges
  const lines = edges.map(e => {
    const p = pos[e.source] || { x: cx, y: cy };
    const q = pos[e.target] || { x: cx, y: cy };
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', p.x);
    line.setAttribute('y1', p.y);
    line.setAttribute('x2', q.x);
    line.setAttribute('y2', q.y);
    line.setAttribute('stroke', e.kind === 'SET_AT' ? '#8097ae' : '#5d948c');
    line.setAttribute('stroke-width', '1.2');
    line.setAttribute('stroke-opacity', '0.35');
    linesGroup.appendChild(line);
    return { ...e, el: line };
  });

  const palette = { scene: '#e5aa6e', character: '#76d6cb', location: '#8fa9e4', prop: '#e6a0aa' };
  const circles = {};
  let selectedNodeId = null;

  // Camera & Viewport State
  const camera = {
    x: 0,
    y: 0,
    w: 900,
    h: 530,
    targetX: 0,
    targetY: 0,
    targetW: 900,
    targetH: 530,
    animating: false
  };

  function renderViewBox() {
    svg.setAttribute('viewBox', `${camera.x.toFixed(2)} ${camera.y.toFixed(2)} ${camera.w.toFixed(2)} ${camera.h.toFixed(2)}`);
  }

  function triggerAnimation() {
    if (camera.animating) return;
    camera.animating = true;

    function step() {
      // Smooth, natural, responsive transition (f = 0.14)
      const f = 0.14;
      camera.x += (camera.targetX - camera.x) * f;
      camera.y += (camera.targetY - camera.y) * f;
      camera.w += (camera.targetW - camera.w) * f;
      camera.h += (camera.targetH - camera.h) * f;
      renderViewBox();

      const dx = Math.abs(camera.targetX - camera.x);
      const dy = Math.abs(camera.targetY - camera.y);
      const dw = Math.abs(camera.targetW - camera.w);

      if (dx > 0.25 || dy > 0.25 || dw > 0.25) {
        requestAnimationFrame(step);
      } else {
        camera.x = camera.targetX;
        camera.y = camera.targetY;
        camera.w = camera.targetW;
        camera.h = camera.targetH;
        renderViewBox();
        camera.animating = false;
      }
    }
    requestAnimationFrame(step);
  }

  function animateCameraTo(tx, ty, tw, th) {
    camera.targetX = tx;
    camera.targetY = ty;
    camera.targetW = tw;
    camera.targetH = th;
    triggerAnimation();
  }

  // Draw Nodes
  nodes.forEach(n => {
    const p = pos[n.id] || { x: cx, y: cy };
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'node-group');
    group.setAttribute('transform', `translate(${p.x},${p.y})`);
    group.setAttribute('data-id', n.id);
    group.setAttribute('data-kind', n.kind);
    group.style.cursor = 'pointer';

    // Tooltip
    const titleEl = document.createElementNS(NS, 'title');
    titleEl.textContent = `${n.kind.toUpperCase()}: ${n.label}${n.heading ? ' — ' + n.heading : ''}`;
    group.appendChild(titleEl);

    // Node Circle
    const circle = document.createElementNS(NS, 'circle');
    let r = 8.5;
    let fill = '#4a3424';
    let isTopChar = false;
    let isTopLoc = false;

    if (n.kind === 'scene') {
      r = 8.5;
      fill = '#4a3424';
    } else if (n.kind === 'character') {
      isTopChar = (charCounts[n.label] || 0) >= 4;
      r = isTopChar ? 13 : 9.5;
      fill = isTopChar ? '#1d3835' : '#172c2b';
    } else if (n.kind === 'location') {
      isTopLoc = (locCounts[n.label] || 0) >= 3;
      r = isTopLoc ? 12 : 9;
      fill = isTopLoc ? '#1c283a' : '#16202c';
    } else if (n.kind === 'prop') {
      r = 8.5;
      fill = '#382026';
    }

    circle.setAttribute('r', r);
    circle.setAttribute('fill', fill);
    circle.setAttribute('stroke', palette[n.kind]);
    circle.setAttribute('stroke-width', n.kind === 'scene' ? '1.5' : '1.7');
    group.appendChild(circle);

    // For scenes: short script order number inside circle (clean & legible)
    if (n.kind === 'scene') {
      const numText = document.createElementNS(NS, 'text');
      numText.setAttribute('text-anchor', 'middle');
      numText.setAttribute('y', '2.5');
      numText.setAttribute('font-size', '6.5');
      numText.setAttribute('font-family', "'Space Grotesk',sans-serif");
      numText.setAttribute('font-weight', '700');
      numText.setAttribute('fill', '#ffebd0');
      numText.setAttribute('pointer-events', 'none');
      numText.textContent = n.label.replace('S', '');
      group.appendChild(numText);
    }

    // Label Group with High-Contrast Backdrop Pill
    const alwaysShow = (n.kind === 'character' && isTopChar) || (n.kind === 'location' && isTopLoc);
    group.dataset.alwaysLabel = alwaysShow ? 'true' : 'false';

    const labelGroup = document.createElementNS(NS, 'g');
    labelGroup.setAttribute('class', 'node-label-group');
    labelGroup.style.display = alwaysShow ? 'block' : 'none';
    labelGroup.setAttribute('pointer-events', 'none');

    const cleanLabel = n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label;
    const labelWidth = Math.max(26, cleanLabel.length * 5.8 + 10);
    const labelY = n.kind === 'character' ? -r - 7 : r + 11;

    const bgRect = document.createElementNS(NS, 'rect');
    bgRect.setAttribute('x', -labelWidth / 2);
    bgRect.setAttribute('y', labelY - 9);
    bgRect.setAttribute('width', labelWidth);
    bgRect.setAttribute('height', 13);
    bgRect.setAttribute('rx', 4);
    bgRect.setAttribute('fill', 'rgba(18, 23, 29, 0.94)');
    bgRect.setAttribute('stroke', palette[n.kind]);
    bgRect.setAttribute('stroke-width', '0.7');
    bgRect.setAttribute('stroke-opacity', '0.6');
    labelGroup.appendChild(bgRect);

    const textEl = document.createElementNS(NS, 'text');
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('y', labelY + 1);
    textEl.setAttribute('font-size', '8.5');
    textEl.setAttribute('font-family', "'DM Sans',sans-serif");
    textEl.setAttribute('font-weight', '600');
    textEl.setAttribute('fill', '#f0f3f6');
    textEl.textContent = cleanLabel;
    labelGroup.appendChild(textEl);

    group.appendChild(labelGroup);
    nodesGroup.appendChild(group);
    circles[n.id] = group;

    // Hover events
    group.addEventListener('pointerenter', () => {
      if (selectedNodeId !== n.id) {
        labelGroup.style.display = 'block';
        circle.setAttribute('stroke-width', '2.5');
      }
    });

    group.addEventListener('pointerleave', () => {
      if (selectedNodeId !== n.id && !group.dataset.isNeighbor) {
        if (!alwaysShow) labelGroup.style.display = 'none';
        circle.setAttribute('stroke-width', n.kind === 'scene' ? '1.5' : '1.7');
      }
    });

    // Node Dragging vs Click Detection
    let startPointer = { x: 0, y: 0 };
    let hasMoved = false;
    let isDraggingNode = false;

    group.addEventListener('pointerdown', e => {
      e.stopPropagation();
      isDraggingNode = true;
      hasMoved = false;
      startPointer = { x: e.clientX, y: e.clientY };
      group.setPointerCapture(e.pointerId);
      group.style.cursor = 'grabbing';
    });

    group.addEventListener('pointermove', e => {
      if (!isDraggingNode) return;
      const dxScreen = e.clientX - startPointer.x;
      const dyScreen = e.clientY - startPointer.y;
      if (Math.hypot(dxScreen, dyScreen) > 4) {
        hasMoved = true;
        const rect = svg.getBoundingClientRect();
        const dxSvg = dxScreen * (camera.w / rect.width);
        const dySvg = dyScreen * (camera.h / rect.height);
        startPointer = { x: e.clientX, y: e.clientY };
        pos[n.id].x += dxSvg;
        pos[n.id].y += dySvg;
        group.setAttribute('transform', `translate(${pos[n.id].x},${pos[n.id].y})`);
        lines.forEach(l => {
          if (l.source === n.id) {
            l.el.setAttribute('x1', pos[n.id].x);
            l.el.setAttribute('y1', pos[n.id].y);
          }
          if (l.target === n.id) {
            l.el.setAttribute('x2', pos[n.id].x);
            l.el.setAttribute('y2', pos[n.id].y);
          }
        });
      }
    });

    group.addEventListener('pointerup', e => {
      if (!isDraggingNode) return;
      isDraggingNode = false;
      group.style.cursor = 'pointer';
      if (!hasMoved) {
        // Pure click: trigger node focus and zoom!
        focusNode(n.id, true);
      }
    });
  });

  // Focus & Zoom to a specific node
  function focusNode(nodeId, shouldZoom = true) {
    const n = nodes.find(x => x.id === nodeId);
    if (!n) return;
    selectedNodeId = nodeId;

    // Sync jump dropdown
    const jumpSelect = $('#graphSceneJump');
    if (jumpSelect) {
      jumpSelect.value = n.kind === 'scene' ? nodeId : '';
    }

    // 1. Identify direct relationships
    const relatedEdges = edges.filter(e => e.source === nodeId || e.target === nodeId);
    const connectedNodeIds = new Set([nodeId]);
    relatedEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    // 2. Highlight connected lines
    lines.forEach(l => {
      const isConnected = l.source === nodeId || l.target === nodeId;
      if (isConnected) {
        l.el.setAttribute('stroke-opacity', '0.95');
        l.el.setAttribute('stroke-width', '2.5');
        l.el.setAttribute('stroke', n.kind === 'scene' ? '#e5aa6e' : n.kind === 'character' ? '#76d6cb' : '#8fa9e4');
        linesGroup.appendChild(l.el); // bring line above others
      } else {
        l.el.setAttribute('stroke-opacity', '0.04');
        l.el.setAttribute('stroke-width', '1');
        l.el.setAttribute('stroke', l.kind === 'SET_AT' ? '#8097ae' : '#5d948c');
      }
    });

    // 3. Highlight nodes and labels
    nodes.forEach(item => {
      const g = circles[item.id];
      if (!g) return;
      const isTarget = item.id === nodeId;
      const isNeighbor = connectedNodeIds.has(item.id);
      const labelGrp = g.querySelector('.node-label-group');

      if (isTarget) {
        g.style.opacity = '1';
        g.classList.add('node-selected');
        g.dataset.isNeighbor = 'true';
        if (labelGrp) labelGrp.style.display = 'block';
        nodesGroup.appendChild(g); // bring to front
      } else if (isNeighbor) {
        g.style.opacity = '1';
        g.classList.remove('node-selected');
        g.dataset.isNeighbor = 'true';
        if (labelGrp) labelGrp.style.display = 'block';
        nodesGroup.appendChild(g);
      } else {
        g.style.opacity = '0.07';
        g.classList.remove('node-selected');
        g.dataset.isNeighbor = 'false';
        if (labelGrp && g.dataset.alwaysLabel !== 'true') {
          labelGrp.style.display = 'none';
        }
      }
    });

    // 4. Smooth Zoom Camera to focused node
    if (shouldZoom && pos[nodeId]) {
      const p = pos[nodeId];
      const targetW = 360;
      const targetH = targetW * (530 / 900);
      const targetX = p.x - targetW / 2;
      const targetY = p.y - targetH / 2;
      animateCameraTo(targetX, targetY, targetW, targetH);
    }

    // 5. Render short, clear inspector details
    renderInspector(n, relatedEdges);
  }

  // Render Rich, Concise Inspector
  function renderInspector(n, relatedEdges) {
    const inspector = $('#graphInspector');
    if (!inspector) return;

    if (n.kind === 'scene') {
      const sid = Number(n.id.replace('s', ''));
      const scene = s.scenes.find(sc => sc.scene_id === sid) || {};
      const assignment = nowResult()?.assignments?.find(a => a.scene_id === sid);
      const locId = scene.location_id;
      const locNodeId = locId ? 'l' + locId : null;
      const speakers = scene.speakers || [];

      inspector.innerHTML = `
        <div class="graph-inspector-card">
          <div class="inspector-header">
            <span class="tag amber">SCENE ${scene.script_order || sid}</span>
            <span class="pill">${esc(scene.time_of_day || 'DAY')}</span>
            ${assignment ? `<span class="pill mint">DAY ${assignment.day + 1}</span>` : '<span class="pill orange">UNSCHEDULED</span>'}
          </div>
          <h3 class="inspector-title">${esc(scene.heading || n.heading || n.label)}</h3>
          
          <div class="inspector-grid">
            <div class="inspector-item">
              <span class="inspector-item-label">Filming Location</span>
              <div class="inspector-item-val">
                ${locNodeId ? `<button type="button" class="cast-chip clickable-chip graph-node-chip" data-node="${locNodeId}" title="Click to view location in graph">📍 ${esc(scene.location || 'Unknown')}</button>` : `📍 ${esc(scene.location || 'Unknown')}`}
              </div>
            </div>
            <div class="inspector-item">
              <span class="inspector-item-label">Estimated Shoot Time</span>
              <div class="inspector-item-val">⏱ <strong>${formatDuration(scene.duration_slots || 2)}</strong> <span class="muted">(${scene.duration_slots || 2} half-hour slots)</span></div>
            </div>
            <div class="inspector-item">
              <span class="inspector-item-label">Schedule Placement</span>
              <div class="inspector-item-val">
                ${assignment ? `🎬 <strong>Day ${assignment.day + 1}</strong> · ${scheduleTimeLabel(assignment.start_slot)} – ${scheduleTimeLabel(assignment.end_slot)}` : '<span class="muted">Not assigned to a shoot day yet</span>'}
              </div>
            </div>
            <div class="inspector-item">
              <span class="inspector-item-label">Speaking Cast (${speakers.length})</span>
              <div class="cast-chips" style="margin-top:4px">
                ${speakers.length ? speakers.map(name => {
                  const char = s.characters.find(c => c.name === name);
                  const charNodeId = char ? 'c' + char.id : null;
                  return `<button type="button" class="cast-chip clickable-chip graph-node-chip" ${charNodeId ? `data-node="${charNodeId}"` : ''} title="Click to view character in graph">👤 ${esc(name)}</button>`;
                }).join('') : '<span class="muted" style="font-size:11px">No dialogue characters</span>'}
              </div>
            </div>
          </div>

          <div class="footer-actions" style="margin-top:6px">
            <button type="button" class="small-button button-primary" data-action="edit-scene" data-id="${scene.scene_id || sid}">EDIT SCENE ESTIMATES ↗</button>
            <button type="button" class="small-button" id="graphResetBtn">RESET VIEW ⤢</button>
          </div>
        </div>
      `;
    } else if (n.kind === 'character') {
      const cid = Number(n.id.replace('c', ''));
      const char = s.characters.find(c => c.id === cid) || { name: n.label };
      const charScenes = s.scenes.filter(sc => sc.character_ids?.includes(cid) || sc.speakers?.includes(char.name));
      const pct = Math.round((100 * charScenes.length) / Math.max(1, s.scenes.length));

      const locMap = {};
      charScenes.forEach(sc => {
        locMap[sc.location] = (locMap[sc.location] || 0) + 1;
      });
      const topLocs = Object.entries(locMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

      inspector.innerHTML = `
        <div class="graph-inspector-card">
          <div class="inspector-header">
            <span class="tag mint">CHARACTER</span>
            <span class="pill">${charScenes.length} SCENE(S)</span>
            <span class="pill orange">${pct}% SCREENPLAY</span>
          </div>
          <h3 class="inspector-title">${esc(char.name || n.label)}</h3>
          
          <div class="inspector-grid">
            <div class="inspector-item">
              <span class="inspector-item-label">Screenplay Presence</span>
              <div class="inspector-item-val">Appears in <strong>${charScenes.length}</strong> of ${s.scenes.length} scenes.</div>
            </div>
            ${topLocs.length ? `
            <div class="inspector-item">
              <span class="inspector-item-label">Primary Filming Sets</span>
              <div class="cast-chips" style="margin-top:4px">
                ${topLocs.map(([lName, count]) => `<span class="cast-chip">📍 ${esc(lName)} (${count})</span>`).join('')}
              </div>
            </div>` : ''}
            <div class="inspector-item">
              <span class="inspector-item-label">Scenes List (Click to zoom scene)</span>
              <div class="cast-chips" style="margin-top:4px; max-height:120px; overflow-y:auto">
                ${charScenes.map(sc => `<button type="button" class="cast-chip clickable-chip graph-node-chip" data-node="s${sc.scene_id}" title="Click to zoom into Scene ${sc.script_order}">S${sc.script_order}: ${esc(sc.location)}</button>`).join('')}
              </div>
            </div>
          </div>

          <div class="footer-actions" style="margin-top:6px">
            <button type="button" class="small-button" id="graphResetBtn">RESET VIEW ⤢</button>
          </div>
        </div>
      `;
    } else if (n.kind === 'location') {
      const lid = Number(n.id.replace('l', ''));
      const loc = s.locations.find(l => l.id === lid) || { name: n.label };
      const locScenes = s.scenes.filter(sc => sc.location_id === lid);

      inspector.innerHTML = `
        <div class="graph-inspector-card">
          <div class="inspector-header">
            <span class="tag blue">LOCATION / SET</span>
            <span class="pill">${locScenes.length} SCENE(S)</span>
          </div>
          <h3 class="inspector-title">${esc(loc.name || n.label)}</h3>
          
          <div class="inspector-grid">
            <div class="inspector-item">
              <span class="inspector-item-label">Set Utilization</span>
              <div class="inspector-item-val">Used for <strong>${locScenes.length}</strong> scene(s) in this production.</div>
            </div>
            <div class="inspector-item">
              <span class="inspector-item-label">Scenes Filmed Here (Click to zoom scene)</span>
              <div class="cast-chips" style="margin-top:4px; max-height:130px; overflow-y:auto">
                ${locScenes.map(sc => `<button type="button" class="cast-chip clickable-chip graph-node-chip" data-node="s${sc.scene_id}" title="Click to zoom into Scene ${sc.script_order}">S${sc.script_order} (${esc(sc.time_of_day || 'DAY')})</button>`).join('')}
              </div>
            </div>
          </div>

          <div class="footer-actions" style="margin-top:6px">
            <button type="button" class="small-button" id="graphResetBtn">RESET VIEW ⤢</button>
          </div>
        </div>
      `;
    } else {
      inspector.innerHTML = `
        <div class="graph-inspector-card">
          <div class="inspector-header">
            <span class="tag red">PROP</span>
            <span class="pill">${relatedEdges.length} CONNECTION(S)</span>
          </div>
          <h3 class="inspector-title">${esc(n.label)}</h3>
          <p class="muted">Annotated story prop event.</p>
          <div class="footer-actions" style="margin-top:6px">
            <button type="button" class="small-button" id="graphResetBtn">RESET VIEW ⤢</button>
          </div>
        </div>
      `;
    }
  }

  // Reset Graph to Full Overview
  function resetGraph() {
    selectedNodeId = null;
    const jumpSelect = $('#graphSceneJump');
    if (jumpSelect) jumpSelect.value = '';

    // Restore lines
    lines.forEach(l => {
      l.el.setAttribute('stroke-opacity', '0.35');
      l.el.setAttribute('stroke-width', '1.2');
      l.el.setAttribute('stroke', l.kind === 'SET_AT' ? '#8097ae' : '#5d948c');
    });

    // Restore nodes
    nodes.forEach(item => {
      const g = circles[item.id];
      if (!g) return;
      g.style.opacity = '1';
      g.classList.remove('node-selected');
      g.dataset.isNeighbor = 'false';
      const labelGrp = g.querySelector('.node-label-group');
      if (labelGrp) {
        labelGrp.style.display = g.dataset.alwaysLabel === 'true' ? 'block' : 'none';
      }
    });

    animateCameraTo(0, 0, 900, 530);

    const inspector = $('#graphInspector');
    if (inspector) {
      inspector.innerHTML = `
        <div class="inspector-default">
          <div class="card-heading">
            <h3>Explore the connections</h3>
            <span class="pill">INTERACTIVE</span>
          </div>
          <p class="muted">Select any scene, character, or location in the network (or choose from the dropdown) to zoom in directly and view its production details.</p>
          <div class="graph-stat-pills" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="tag amber">${s.scenes.length} Scenes</span>
            <span class="tag mint">${s.characters.length} Characters</span>
            <span class="tag blue">${s.locations.length} Locations</span>
          </div>
        </div>
      `;
    }
  }

  // Canvas Panning (Click & Drag background)
  let isCanvasPanning = false;
  let panStart = { x: 0, y: 0 };
  let camStart = { x: 0, y: 0 };

  svg.addEventListener('pointerdown', e => {
    if (e.target.closest('.node-group')) return;
    isCanvasPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    camStart = { x: camera.x, y: camera.y };
  });

  window.addEventListener('pointermove', e => {
    if (!isCanvasPanning) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - panStart.x) / rect.width) * camera.w;
    const dy = ((e.clientY - panStart.y) / rect.height) * camera.h;
    camera.x = camStart.x - dx;
    camera.y = camStart.y - dy;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    renderViewBox();
  });

  window.addEventListener('pointerup', () => {
    isCanvasPanning = false;
  });

  // Smooth, Even Cursor-Centered Mouse Wheel & Trackpad Zoom
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mouseRatioX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const mouseRatioY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Calculate current point under cursor in canvas coordinates
    const mouseSvgX = camera.x + mouseRatioX * camera.w;
    const mouseSvgY = camera.y + mouseRatioY * camera.h;

    // Normalize delta across browsers and devices (trackpad vs notched wheel)
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= 100;

    // Clamp delta per event to maintain smooth control while providing standard zoom speed
    const clampedDelta = Math.max(-65, Math.min(65, delta));
    // Standard responsive exponential zoom scaling
    const zoomFactor = Math.exp(clampedDelta * 0.0042);

    const newTargetW = Math.max(180, Math.min(1600, camera.targetW * zoomFactor));
    const newTargetH = newTargetW * (530 / 900);

    // Keep point under cursor perfectly stationary while zooming smoothly
    camera.targetW = newTargetW;
    camera.targetH = newTargetH;
    camera.targetX = mouseSvgX - mouseRatioX * newTargetW;
    camera.targetY = mouseSvgY - mouseRatioY * newTargetH;

    triggerAnimation();
  }, { passive: false });

  // Double Click Background to Reset
  svg.addEventListener('dblclick', e => {
    if (e.target === svg || !e.target.closest('.node-group')) {
      resetGraph();
    }
  });

  // On-Screen Zoom Controls (Normal, Responsive Steps)
  const zoomInBtn = $('#graphZoomIn');
  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      const centerX = camera.x + camera.w / 2;
      const centerY = camera.y + camera.h / 2;
      const newW = Math.max(180, camera.targetW * 0.70);
      const newH = newW * (530 / 900);
      animateCameraTo(centerX - newW / 2, centerY - newH / 2, newW, newH);
    };
  }

  const zoomOutBtn = $('#graphZoomOut');
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      const centerX = camera.x + camera.w / 2;
      const centerY = camera.y + camera.h / 2;
      const newW = Math.min(1600, camera.targetW * 1.38);
      const newH = newW * (530 / 900);
      animateCameraTo(centerX - newW / 2, centerY - newH / 2, newW, newH);
    };
  }

  const zoomFitBtn = $('#graphZoomFit');
  if (zoomFitBtn) {
    zoomFitBtn.onclick = () => resetGraph();
  }

  // Scene Jump Dropdown
  const jumpSelect = $('#graphSceneJump');
  if (jumpSelect) {
    jumpSelect.onchange = () => {
      if (jumpSelect.value) {
        focusNode(jumpSelect.value, true);
      } else {
        resetGraph();
      }
    };
  }

  // Node Kind Filter Buttons
  document.querySelectorAll('.graph-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.graph-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.graphFilter;

      nodes.forEach(item => {
        const g = circles[item.id];
        if (!g) return;
        if (filter === 'all' || item.kind === filter) {
          g.style.opacity = '1';
          g.style.pointerEvents = 'auto';
        } else {
          g.style.opacity = '0.05';
          g.style.pointerEvents = 'none';
        }
      });

      lines.forEach(l => {
        if (filter === 'all') {
          l.el.setAttribute('stroke-opacity', '0.35');
        } else if (filter === 'scene') {
          l.el.setAttribute('stroke-opacity', '0.12');
        } else {
          l.el.setAttribute('stroke-opacity', '0.03');
        }
      });
    };
  });

  // Inspector Cross-Navigation Clicks (Chips & Reset)
  const inspectorEl = $('#graphInspector');
  if (inspectorEl) {
    inspectorEl.onclick = e => {
      const chip = e.target.closest('.graph-node-chip');
      if (chip && chip.dataset.node) {
        focusNode(chip.dataset.node, true);
        return;
      }
      const resetBtn = e.target.closest('#graphResetBtn');
      if (resetBtn) {
        resetGraph();
      }
    };
  }
}
function openModal(title, inner) { $('#dialog').innerHTML = `<div class="dialog-header"><h3>${esc(title)}</h3><button class="close-button" data-action="close-modal">✕</button></div>${inner}`; $('#dialogBackdrop').classList.remove('hidden') }
function closeModal() { $('#dialogBackdrop').classList.add('hidden') }
function editScene(id) {
  const s = app.state, scene = s.scenes.find(x => x.scene_id === id);
  if (!scene) return;
  openModal('Edit scene ' + scene.script_order, `<form id="sceneEditForm" class="layout-stack" data-scene="${id}">
    <div class="field"><label>HEADING</label><input class="input" id="editHeading" maxlength="200" value="${esc(scene.heading)}"></div>
    <div class="form-grid">
      <div class="field"><label>LOCATION</label><select class="select" id="editLocation">${s.locations.map(l => `<option value="${l.id}" ${l.id === scene.location_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>TIME OF DAY</label><select class="select" id="editTime">${[...new Set(['DAY', 'NIGHT', 'MORNING', 'EVENING', 'SUNSET', 'DAWN', 'UNSPECIFIED', scene.time_of_day])].map(t => `<option ${t === scene.time_of_day ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label>ESTIMATED SHOOT TIME (MINUTES)</label><input type="number" class="input" id="editDuration" min="30" max="720" step="30" value="${scene.duration_slots * 30}"></div>
    </div>
    <div class="field"><label>REQUIRED ACTORS / VERIFIED ON-SCREEN CAST</label><div class="form-grid">${s.characters.map(ch => `<label style="font-size:12px;color:var(--sub)"><input type="checkbox" class="scene-cast" value="${ch.id}" ${scene.character_ids.includes(ch.id) ? 'checked' : ''}> ${esc(ch.name)}</label>`).join('')}</div></div>
    <p class="muted">Estimate from screenplay cues; review and adjust as needed.</p>
    <button type="submit" class="button button-primary">SAVE SCENE</button>
  </form>`)
}
function openScheduleReview(replan = false) {
  const s = app.state, c = s.settings;
  const sceneHours = (s.scenes.reduce((total, scene) => total + scene.duration_slots, 0) / 2).toLocaleString();
  const sceneLimit = c.max_scenes_per_day ? `Maximum ${c.max_scenes_per_day} scenes per day` : 'No daily scene cap; scene counts follow estimated shoot times and workday length.';
  const restrictionCount = [...Object.values(c.actor_blocks || {}), ...Object.values(c.location_blocks || {})].flat().length;
  const issues = s.schedule_preflight.issues;
  openModal('Review before optimizing', `<div class="layout-stack">
    <p class="muted">Check the scene estimates and constraints before the optimizer builds the schedule. You can still edit scene placements after it is shown.</p>
    <div class="notice"><strong>Current inputs:</strong> ${s.scenes.length} scenes · ${sceneHours} crew-hours · ${c.days} days · ${c.slots_per_day / 2} hours/day · ${sceneLimit} · ${restrictionCount} actor/location restriction(s).</div>
    ${issues.length ? `<div class="warning">Resolve these checks before optimizing:<ul class="preflight-issues">${issues.map(issue => `<li>${esc(issue.message)}</li>`).join('')}</ul></div>` : ''}
    <div class="footer-actions">
      <button class="button" data-action="review-scenes">REVIEW SCENES & TIMES</button>
      <button class="button" data-action="review-constraints">EDIT CALENDAR & CONSTRAINTS</button>
    </div>
    <p class="scroll-note">Only saved scene times, calendar settings, scene limits, and actor/location availability are enforced.</p>
    <button class="button button-primary" data-action="confirm-schedule" data-replan="${replan}" ${issues.length ? 'disabled' : ''}>${replan ? 'OPTIMIZE AGAIN' : 'OPTIMIZE SCHEDULE'}</button>
  </div>`);
}
function editAssignment(id) {
  const s = app.state, c = s.settings, result = nowResult();
  const scene = s.scenes.find(item => item.scene_id === id);
  const assignment = result?.assignments?.find(item => item.scene_id === id);
  if (!scene || !assignment) return toast('This scene has no saved schedule placement.', true);
  const availableSlots = c.slots_per_day - scene.duration_slots + 1;
  if (availableSlots < 1) return toast('This scene is longer than the current workday. Edit its time or extend the workday first.', true);
  const dayOptions = Array.from({ length: c.days }, (_, day) => `<option value="${day}" ${day === assignment.day ? 'selected' : ''}>Day ${day + 1}</option>`).join('');
  const startOptions = Array.from({ length: availableSlots }, (_, slot) => `<option value="${slot}" ${slot === assignment.start_slot ? 'selected' : ''}>${scheduleTimeLabel(slot)}</option>`).join('');
  openModal(`Edit scene ${scene.script_order} placement`, `<form id="scheduleEditForm" class="layout-stack" data-scene="${id}">
    <p class="muted">${esc(scene.heading)} · ${formatDuration(scene.duration_slots)} · ${esc(scene.location)}</p>
    <div class="form-grid">
      <div class="field"><label>PRODUCTION DAY</label><select class="select" id="assignmentDay">${dayOptions}</select></div>
      <div class="field"><label>START TIME</label><select class="select" id="assignmentStart">${startOptions}</select></div>
    </div>
    <p class="scroll-note">The move is saved only if it respects work hours, availability, crew overlap, and your daily scene limit.</p>
    <button type="submit" class="button button-primary">SAVE PLACEMENT</button>
  </form>`);
}
function showExports() { const pid = app.state.id; openModal('Export SceneGraph project', `<div class="layout-stack"><p class="muted">Download artifacts generated from the current persisted project state.</p><button class="button" data-action="export" data-format="pdf">⇩ PRINT-READY PRODUCTION REPORT (PDF)</button><button class="button" data-action="export" data-format="csv">⇩ OPTIMIZED SHOOTING SCHEDULE (CSV)</button><button class="button" data-action="export" data-format="json">⇩ FULL DATA + EVIDENCE (JSON)</button><div class="notice">Exports contain real application outputs. PDF generation requires reportlab; CSV requires an optimized schedule.</div></div>`) }
function openAccountSettings() {
  openModal('Account settings', `<div class="layout-stack"><div class="account-card"><p class="eyebrow">YOUR PROFILE</p><h3 style="margin:4px 0 8px;font-family:var(--head);font-size:18px;">${esc(app.user?.display_name || 'Production User')}</h3><p class="muted" style="font-size:13px;margin:0 0 16px;">${esc(app.user?.email || '')}</p><div class="account-info-grid" style="display:grid;gap:10px;background:#181f26;padding:14px;border-radius:9px;border:1px solid #333d47;"><div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--muted)">Security</span><span style="color:var(--mint);font-weight:600">Password protected</span></div><div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--muted)">Account ID</span><span style="color:var(--ink);font-family:monospace">${esc(app.user?.id ?? '1')}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--muted)">Workspace</span><span style="color:var(--accent);font-weight:600">Private Database</span></div></div></div></div>`);
}
async function downloadExport(pid, kind) {
  const finishLoading = beginLoading('Preparing your export...');
  try {
    const url = API_BASE + '/api/export?project_id=' + encodeURIComponent(pid) + '&format=' + encodeURIComponent(kind);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + authToken } });
    if (!res.ok) { let detail = 'Export failed'; try { detail = (await res.json()).detail || detail } catch { } throw new Error(detail) }
    const blob = await res.blob(), tmp = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = tmp; a.download = { json: 'scenegraph_project.json', csv: 'scenegraph_schedule.csv', pdf: 'scenegraph_production_report.pdf' }[kind] || 'scenegraph_export'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(tmp), 5000);
  } finally { finishLoading() }
}
function recommendedCalendarSettings(s) {
  const settings = structuredClone(s.settings), defaults = s.default_schedule_config;
  const blocks = [...Object.values(settings.actor_blocks || {}), ...Object.values(settings.location_blocks || {})].flat();
  if (defaults.estimated_days > defaults.max_days) throw new Error(`This script needs more than the planner’s ${defaults.max_days}-day maximum at 8 hours per day.`);
  if (blocks.some(block => block.end > 16)) throw new Error('A saved unavailability range extends beyond an 8-hour day. Adjust that constraint first to preserve it.');
  settings.days = Math.max(defaults.days, ...blocks.map(block => block.day + 1), 1);
  if (settings.days > defaults.max_days) throw new Error(`Saved constraints extend beyond the planner’s ${defaults.max_days}-day maximum.`);
  settings.slots_per_day = 16;
  return settings;
}
async function execute(action, el) {
  const s = app.state;
  if (action === 'navigate') return setView(el.dataset.target);
  if (action === 'account') return openAccountSettings();
  if (action === 'close-modal') return closeModal();
  if (action === 'show-wrap-modal') return openWrapCelebrationModal(s, 'celebrate');
  if (action === 'wrap-step') return openWrapCelebrationModal(s, el.dataset.step || 'celebrate');
  if (action === 'tracker-filter') {
    app.trackerFilter = el.dataset.filter || 'all';
    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    return;
  }
  if (action === 'toggle-scene-shot') {
    const sid = Number(el.dataset.id);
    const set = getCompletedSceneSet(s);
    const wasAll = set.size === s.scenes.length;
    if (set.has(sid)) set.delete(sid);
    else set.add(sid);
    await updateCompletedScenes(set, !wasAll && set.size === s.scenes.length);
    return;
  }
  if (action === 'toggle-day-shot') {
    const day = Number(el.dataset.day);
    const r = nowResult();
    if (!r?.assignments) return;
    const daySceneIds = r.assignments.filter(a => a.day === day).map(a => Number(a.scene_id));
    const set = getCompletedSceneSet(s);
    const wasAll = set.size === s.scenes.length;
    const allDayDone = daySceneIds.every(id => set.has(id));
    daySceneIds.forEach(id => { if (allDayDone) set.delete(id); else set.add(id); });
    await updateCompletedScenes(set, !wasAll && set.size === s.scenes.length);
    return;
  }
  if (action === 'mark-all-scenes') {
    const set = new Set(s.scenes.map(sc => Number(sc.scene_id)));
    await updateCompletedScenes(set, true);
    return;
  }
  if (action === 'mark-none-scenes') {
    await updateCompletedScenes(new Set(), false);
    toast('All scenes unmarked and reset to in-progress.');
    return;
  }
  if (action === 'edit-scene') return editScene(Number(el.dataset.id));
  if (action === 'edit-assignment') return editAssignment(Number(el.dataset.id));
  if (action === 'review-scenes') { closeModal(); setView('studio'); return }
  if (action === 'review-constraints') { closeModal(); setView('planner'); $('#plannerCalendarDetails').open = true; $('#availabilityDetails').open = true; return }
  if (action === 'estimate-durations') {
    if (!confirm('Replace saved shoot times with rough screenplay-based estimates? You can edit each time afterward; the current schedule may need rebuilding.')) return;
    const result = await api('/api/estimate-durations', { project_id: s.id });
    app.state = result.state; render();
    toast(result.updated_scenes ? `${result.updated_scenes} scene times updated. Review them and rebuild the schedule.` : 'Scene times already match the estimates.');
    return;
  }
  if (action === 'apply-default-and-schedule') {
    const settings = recommendedCalendarSettings(s), finishLoading = beginLoading('Applying recommended calendar settings...');
    try {
      const configured = await api('/api/settings', { project_id: s.id, settings }); app.state = configured.state; render();
      openScheduleReview(false);
    } finally { finishLoading() }
    return;
  }
  if (action === 'remove-constraint') {
    const { kind, id, index } = el.dataset, settings = structuredClone(s.settings), items = settings[kind][id] || [];
    items.splice(Number(index), 1); settings[kind][id] = items;
    const result = await api('/api/settings', { project_id: s.id, settings }); app.state = result.state; render(); toast('Scheduling constraint removed.'); return;
  }
  if (action === 'export') { await downloadExport(s.id, el.dataset.format); return }
  if (action === 'import') { const text = $('#scriptSource').value, title = $('#scriptTitle').value || 'Untitled Production'; if (!text.trim()) return toast('Paste or upload a Fountain screenplay first.', true); const res = await api('/api/import', { text, title }); app.state = res.state; rememberProject(app.state.id); await loadProjects(); setView('studio'); toast(`Imported ${app.state.scenes.length} scenes. ${res.warnings.length} parser warning(s).`); return }
  if (action === 'save-settings') { const settings = structuredClone(s.settings); const hours = parseFloat($('#hoursInput').value); const sceneLimitValue = $('#maxScenesInput').value.trim(); const sceneLimit = sceneLimitValue === '' ? null : Number(sceneLimitValue); if (!Number.isFinite(hours) || hours < 1 || hours > 12 || hours * 2 % 1 !== 0) return toast('Work hours must be between 1 and 12, in half-hour increments.', true); if (sceneLimit !== null && (!Number.isInteger(sceneLimit) || sceneLimit < 1 || sceneLimit > 24)) return toast('Maximum scenes per day must be a whole number from 1 to 24.', true); settings.days = parseInt($('#daysInput').value); settings.slots_per_day = Math.round(hours * 2); settings.max_scenes_per_day = sceneLimit; const invalid = Object.values(settings.actor_blocks || {}).concat(Object.values(settings.location_blocks || {})).flat().some(b => b.day >= settings.days || b.end > settings.slots_per_day); if (invalid) return toast('Calendar change conflicts with a saved unavailability constraint. Update or remove that constraint first.', true); const result = await api('/api/settings', { project_id: s.id, settings }); app.state = result.state; render(); toast('Production calendar saved. Run optimization to update schedule.'); return }
  if (action === 'toggle-availability') { const { kind, id, day } = el.dataset; const cfg = structuredClone(s.settings); const arr = cfg[kind][String(id)] || []; const d = Number(day), hasBlock = arr.some(b => b.day === d); cfg[kind][String(id)] = hasBlock ? arr.filter(b => b.day !== d) : [...arr, { day: d, start: 0, end: cfg.slots_per_day }]; const res = await api('/api/settings', { project_id: s.id, settings: cfg }); app.state = res.state; render(); toast(`Updated ${kind === 'actor_blocks' ? 'actor' : 'location'} availability on day ${d + 1}.`); return }
  if (action === 'schedule' || action === 'replan') { openScheduleReview(action === 'replan'); return }
  if (action === 'confirm-schedule') {
    const finishLoading = beginLoading('Optimizing your schedule with the saved constraints...');
    closeModal();
    try {
      const result = await api('/api/schedule', { project_id: s.id, replan: el.dataset.replan === 'true' });
      app.state = result.state; render();
      toast('Schedule result: ' + app.state.schedules.optimized.status);
    } finally { finishLoading() }
    return;
  }
  if (action === 'delete-event') { const res = await api('/api/delete_event', { project_id: s.id, event_id: Number(el.dataset.id) }); app.state = res.state; render(); toast('Annotation removed.'); return }
  if (action === 'benchmark') { el.disabled = true; el.textContent = 'RUNNING REPRODUCIBLE EXPERIMENTS…'; try { app.bench = await api('/api/benchmark', { project_id: s.id, sizes: [10, 20, 40], seeds: [11, 23], max_seconds: 2 }); render(); toast('Benchmark finished: ' + app.bench.rows.length + ' scenarios analyzed.') } finally { el.disabled = false } return }
}
document.addEventListener('click', async e => { const el = e.target.closest('[data-action]'); if (!el) return; try { await execute(el.dataset.action, el) } catch (ex) { toast(ex.message, true); if (app.state) render() } });
document.addEventListener('submit', async e => {
  if (e.target.id === 'scheduleEditForm') {
    e.preventDefault();
    const scene_id = Number(e.target.dataset.scene);
    const day = Number($('#assignmentDay').value), start_slot = Number($('#assignmentStart').value);
    if (!Number.isInteger(day) || !Number.isInteger(start_slot)) return toast('Choose a valid day and start time.', true);
    try {
      const result = await api('/api/schedule/assignment', { project_id: app.state.id, scene_id, day, start_slot });
      app.state = result.state; closeModal(); render(); toast('Scene placement saved; all schedule constraints remain satisfied.');
    } catch (ex) { toast(ex.message, true) }
    return;
  }
  if (e.target.id !== 'constraintForm') return;
  e.preventDefault();
  const [kind, id] = $('#constraintParticipant').value.split(':');
  const day = Number($('#constraintDay').value), start = Number($('#constraintStart').value), end = Number($('#constraintEnd').value);
  if (!kind || !id) return toast('Choose an actor or location for this constraint.', true);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) return toast('The unavailable end time must be after its start time.', true);
  try {
    const settings = structuredClone(app.state.settings);
    settings[kind][id] = [...(settings[kind][id] || []), { day, start, end }];
    const result = await api('/api/settings', { project_id: app.state.id, settings });
    app.state = result.state; render(); toast('Unavailable time added and will be enforced by the optimizer.');
  } catch (ex) { toast(ex.message, true) }
});


document.addEventListener('submit', async e => {
  if (e.target.id === 'actorAddForm' || e.target.id === 'locationAddForm') {
    e.preventDefault();
    try {
      const kind = e.target.id === 'actorAddForm' ? 'character' : 'location';
      const name = kind === 'character' ? $('#newActorName').value : $('#newLocationName').value;
      const res = await api('/api/metadata', { project_id: app.state.id, kind, name });
      app.state = res.state; render(); toast(kind + ' added to registry. Update scene assignments as needed.');
    } catch (ex) { toast(ex.message, true) }
  }
  if (e.target.id === 'eventForm') {
    e.preventDefault();
    try {
      const result = await api('/api/event', { project_id: app.state.id, scene_id: Number($('#eventScene').value), action: $('#eventAction').value, prop: $('#eventProp').value, character: $('#eventCharacter').value });
      app.state = result.state; render(); toast('Continuity event recorded.');
    } catch (ex) { toast(ex.message, true) }
  }
  if (e.target.id === 'sceneEditForm') {
    e.preventDefault();
    try {
      const id = Number(e.target.dataset.scene);
      const cast = [...document.querySelectorAll('.scene-cast:checked')].map(x => Number(x.value));
      const durationMinutes = Number($('#editDuration').value);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 720 || durationMinutes % 30 !== 0) {
        throw new Error('Shoot time must be in 30-minute increments from 30 to 720 minutes.');
      }
      await api('/api/scene', { project_id: app.state.id, scene_id: id, changes: { heading: $('#editHeading').value, location_id: Number($('#editLocation').value), time_of_day: $('#editTime').value, duration_slots: durationMinutes / 30 } });
      const result = await api('/api/cast', { project_id: app.state.id, scene_id: id, character_ids: cast });
      app.state = result.state; closeModal(); render(); toast('Scene updates saved.');
    } catch (ex) { toast(ex.message, true) }
  }
});
async function readUploadedScriptFile(file) {
  if (!file) return;
  if (!/\.(fountain|txt|pdf)$/i.test(file.name)) return toast('Upload .fountain, .txt or .pdf', true);
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const finishLoading = beginLoading(isPdf ? 'Reading and analyzing PDF...' : 'Reading screenplay file...');
  try {
    if (isPdf) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim() || 'Untitled Production');
      const res = await fetch(API_BASE + '/api/import-file', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'PDF import failed');
      app.state = data.state;
      rememberProject(app.state.id);
      await loadProjects();
      setView('studio');
      toast(`Imported ${app.state.scenes.length} scenes from PDF. ${data.warnings.length} parser warning(s).`);
      return;
    }
    $('#scriptSource').value = await file.text();
    $('#scriptTitle').value = file.name.replace(/\.(fountain|txt)$/i, '').replace(/[-_]/g, ' ').toUpperCase();
    toast('Screenplay loaded. Click Parse & Create Production.');
  } catch (ex) { toast(ex.message, true) } finally { finishLoading() }
}
document.addEventListener('change', async e => { if (e.target.id === 'scriptFile') { const file = e.target.files?.[0]; await readUploadedScriptFile(file); } });
$('#dialogBackdrop').addEventListener('click', e => { if (e.target.id === 'dialogBackdrop') closeModal() }); document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() });
document.querySelectorAll('.nav-link[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
$('#projectSelect').addEventListener('change', e => loadState(e.target.value)); $('#newProjectBtn').addEventListener('click', () => app.state ? setView('studio') : showEmptyWorkspace()); $('#exportBtn').addEventListener('click', showExports);
setupProjectDropdown();
startAuth();
loadAuthProviders().catch(ex => { $('#authProviderNotice').hidden = false; $('#authProviderNotice').textContent = 'Could not load sign-in provider settings: ' + ex.message });
