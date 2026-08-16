const form = document.querySelector('#audit-form');
const output = document.querySelector('#audit-result');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  output.textContent = 'Creating secure Stripe checkout…';
  const data = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'audit', email: data.email, systemName: data.systemName, scope: data.scope }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    if (!payload.url) throw new Error('Stripe checkout URL was not returned');
    location.href = payload.url;
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});
