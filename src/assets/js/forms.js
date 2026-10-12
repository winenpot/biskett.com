// Progressive enhancement: send forms[action="/api/forms"] as JSON and show the result
// inline. Without JS the browser posts the form normally and the server answers with a
// small thank-you page.
(() => {
  const fa = document.documentElement.lang === 'fa';
  const text = fa
    ? { sending: 'در حال ارسال…', ok: 'ممنون! پیام شما دریافت شد.', fail: 'ارسال انجام نشد، لطفاً دوباره تلاش کنید.' }
    : { sending: 'Sending…', ok: 'Thank you. Your message has been received.', fail: 'Sending failed, please try again.' };

  const status = (form, message, kind) => {
    let node = form.querySelector('.form-status');
    if (!node) {
      node = document.createElement('p');
      node.setAttribute('role', 'status');
      form.appendChild(node);
    }
    node.className = `form-status ${kind}`;
    node.textContent = message;
  };

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute('action') !== '/api/forms') return;
    event.preventDefault();
    if (form.dataset.sending) return;
    form.dataset.sending = '1';
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    status(form, text.sending, '');
    const { form: name, lang, ...fields } = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ form: name, lang, page: location.pathname, fields }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 400 && data.error ? data.error : text.fail);
      form.reset();
      status(form, data.message || text.ok, 'ok');
    } catch (error) {
      status(form, error.message || text.fail, 'error');
    } finally {
      delete form.dataset.sending;
      if (button) button.disabled = false;
    }
  });
})();
