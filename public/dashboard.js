const TOKEN_KEY = 'measure_access_token';
const REFRESH_KEY = 'measure_refresh_token';
const authCard = document.querySelector('#auth-card');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const authMessage = document.querySelector('#auth-message');

function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
function headers() { return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }; }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...(token() ? headers() : {}) } });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) throw new Error(typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : text || `HTTP ${response.status}`);
  return data;
}

function saveSession(session) {
  if (!session?.accessToken) return;
  localStorage.setItem(TOKEN_KEY, session.accessToken);
  if (session.refreshToken) localStorage.setItem(REFRESH_KEY, session.refreshToken);
}

async function loadDashboard() {
  if (!token()) {
    authCard.hidden = false; dashboard.hidden = true; logout.hidden = true; return;
  }
  try {
    const [account, usage, keys] = await Promise.all([api('/api/account'), api('/api/usage'), api('/api/keys')]);
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
    document.querySelector('#keys').innerHTML = (keys.keys || []).map((key) => `<div class="key-row"><code>${key.prefix}…</code><span>${key.name}</span><span>${key.revoked_at ? 'revoked' : (key.last_used_at ? 'used' : 'new')}</span></div>`).join('') || '<p>No API keys yet.</p>';
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    authMessage.textContent = error.message;
    authCard.hidden = false; dashboard.hidden = true; logout.hidden = true;
  }
}

for (const [id, endpoint] of [['login-form', '/api/auth/login'], ['register-form', '/api/auth/register']]) {
  document.querySelector(`#${id}`).addEventListener('submit', async (event) => {
    event.preventDefault(); authMessage.textContent = 'Working…';
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      if (data.session) { saveSession(data.session); authMessage.textContent = ''; await loadDashboard(); }
      else authMessage.textContent = data.confirmationRequired ? 'Check your email to confirm your account, then sign in.' : 'Account created.';
    } catch (error) { authMessage.textContent = error.message; }
  });
}

logout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); loadDashboard();
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

loadDashboard();
