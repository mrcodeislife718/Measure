const authCard = document.querySelector('#auth-card');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const authMessage = document.querySelector('#auth-message');
let authenticated = false;

async function rawApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  return { response, data };
}

async function api(path, options = {}, retry = true) {
  let { response, data } = await rawApi(path, options);
  if (response.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const refresh = await rawApi('/api/auth/refresh', { method: 'POST', body: '{}' });
    if (refresh.response.ok) ({ response, data } = await rawApi(path, options));
  }
  if (!response.ok) throw new Error(typeof data === 'object' && data ? (data.message || data.error || JSON.stringify(data)) : data || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function recoveryTokenFromHash() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return hash.get('access_token') || '';
}

async function loadDashboard() {
  try {
    const account = await api('/api/account', {}, false);
    authenticated = true;
    const [usage, keys, history, team] = await Promise.all([api('/api/usage'), api('/api/keys'), api('/api/evaluations?limit=20'), api('/api/team')]);
    authCard.hidden = true; dashboard.hidden = false; logout.hidden = false;
    document.querySelector('#org-name').textContent = account.organization.name;
    document.querySelector('#plan').textContent = account.organization.plan.toUpperCase();
    document.querySelector('#subscription').textContent = account.organization.subscriptionStatus;
    document.querySelector('#plan-line').textContent = `${account.organization.plan.toUpperCase()} · ${account.organization.subscriptionStatus}`;
    document.querySelector('#concurrency').textContent = account.organization.entitlement.concurrency ?? '—';
    const totals = usage.totals || {};
    const unitTotal = Object.entries(totals).filter(([key]) => key.includes('units')).reduce((sum, [, value]) => sum + Number(value || 0), 0);
    document.querySelector('#usage-total').textContent = unitTotal.toLocaleString();
    document.querySelector('#usage').textContent = JSON.stringify(totals, null, 2);
    document.querySelector('#keys').innerHTML = (keys.keys || []).map((key) => `<div class="key-row"><code>${escapeHtml(key.prefix)}…</code><span>${escapeHtml(key.name)}</span><span>${key.revoked_at ? 'revoked' : (key.last_used_at ? 'used' : 'new')}</span></div>`).join('') || '<p>No API keys yet.</p>';
    document.querySelector('#evaluations').innerHTML = (history.evaluations || []).map((item) => `<div class="key-row"><code>${escapeHtml(item.participant_id)}</code><strong>${escapeHtml(item.status)}</strong><span>${escapeHtml(new Date(item.created_at).toLocaleString())}</span></div>`).join('') || '<p>No evaluations yet.</p>';
    document.querySelector('#members').innerHTML = [
      ...(team.members || []).map((member) => `<div class="key-row"><code>${escapeHtml(String(member.user_id).slice(0, 8))}…</code><strong>${escapeHtml(member.role)}</strong><span>member</span></div>`),
      ...(team.invites || []).map((invite) => `<div class="key-row"><code>${escapeHtml(invite.email)}</code><strong>${escapeHtml(invite.role)}</strong><span>invited</span></div>`),
    ].join('') || '<p>No teammates yet.</p>';
  } catch (error) {
    authenticated = false;
    authMessage.textContent = error.message === 'unauthorized' ? '' : error.message;
    authCard.hidden = false; dashboard.hidden = true; logout.hidden = true;
  }
}

for (const [id, endpoint] of [['login-form', '/api/auth/login'], ['register-form', '/api/auth/register']]) {
  document.querySelector(`#${id}`).addEventListener('submit', async (event) => {
    event.preventDefault(); authMessage.textContent = 'Working…';
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(form) }, false);
      if (data.authenticated) { authMessage.textContent = ''; history.replaceState({}, '', '/dashboard.html'); await loadDashboard(); }
      else authMessage.textContent = data.confirmationRequired ? 'Check your email to confirm your account, then sign in.' : 'Account created.';
    } catch (error) { authMessage.textContent = error.message; }
  });
}

logout.addEventListener('click', async () => {
  await rawApi('/api/auth/logout', { method: 'POST', body: '{}' });
  authenticated = false;
  await loadDashboard();
});

document.querySelector('#forgot').addEventListener('click', async () => {
  const email = document.querySelector('#login-form [name=email]').value.trim();
  if (!email) { authMessage.textContent = 'Enter your email first.'; return; }
  try {
    const data = await api('/api/auth/recover', { method: 'POST', body: JSON.stringify({ email }) }, false);
    authMessage.textContent = data.message;
  } catch (error) { authMessage.textContent = error.message; }
});

const recoveryToken = recoveryTokenFromHash();
if (recoveryToken) {
  document.querySelector('#recovery-form').hidden = false;
  authMessage.textContent = 'Choose a new password.';
}

document.querySelector('#recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get('password');
  try {
    const { response, data } = await rawApi('/api/auth/password', { method: 'POST', headers: { Authorization: `Bearer ${recoveryToken}` }, body: JSON.stringify({ password }) });
    if (!response.ok) throw new Error(data?.message || data?.error || 'Password update failed');
    location.replace('/dashboard.html');
  } catch (error) { authMessage.textContent = error.message; }
});

document.querySelector('#key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const output = document.querySelector('#new-key');
  try {
    const data = await api('/api/keys', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#key-name').value }) });
    output.textContent = `SAVE THIS NOW — IT WILL NOT BE SHOWN AGAIN\n\n${data.key}`;
    await loadDashboard();
  } catch (error) { output.textContent = error.message; }
});

document.querySelector('#invite-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const output = document.querySelector('#invite-result');
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const data = await api('/api/team', { method: 'POST', body: JSON.stringify(body) });
    output.textContent = `Share this invite URL securely:\n${data.invite.url}`;
    await loadDashboard();
  } catch (error) { output.textContent = error.message; }
});

for (const button of document.querySelectorAll('[data-plan]')) {
  button.addEventListener('click', async () => {
    try {
      const data = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: button.dataset.plan }) });
      if (data.url) location.href = data.url;
    } catch (error) { alert(error.message); }
  });
}

document.querySelector('#billing').addEventListener('click', async () => {
  try {
    const data = await api('/api/billing-portal', { method: 'POST', body: '{}' });
    if (data.url) location.href = data.url;
  } catch (error) { alert(error.message); }
});

const params = new URLSearchParams(location.search);
const invite = params.get('invite');
const invitedEmail = params.get('email');
if (invite) {
  document.querySelector('#invite-token').value = invite;
  if (invitedEmail) document.querySelector('#register-form [name=email]').value = invitedEmail;
  document.querySelector('#register-form [name=organizationName]').disabled = true;
  authMessage.textContent = 'Create your account to join the invited Measure workspace.';
}

loadDashboard();
