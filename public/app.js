const button = document.querySelector('#compile');
const result = document.querySelector('#result');

button?.addEventListener('click', async () => {
  result.textContent = 'Compiling…';
  const states = document.querySelector('#states').value.split(',').map((value) => value.trim()).filter(Boolean);
  const action = document.querySelector('#action').value.trim();
  const authority = document.querySelector('#authority').value.trim();
  if (states.length < 2 || !action) {
    result.textContent = 'Provide at least two states and one transition action.';
    return;
  }
  try {
    const response = await fetch('/api/demo-compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ states, action, authority }),
    });
    const payload = await response.json();
    result.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    result.textContent = `Demo error: ${error instanceof Error ? error.message : String(error)}`;
  }
});
