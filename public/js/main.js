// Toggle mobilní menu
const btn = document.querySelector('.menu-toggle');
const nav = document.getElementById('mainNav');

btn?.addEventListener('click', () => {
  nav?.classList.toggle('open');
  btn.classList.toggle('open');
});

// Zavření menu po kliknutí na odkaz
nav?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    nav.classList.remove('open');
    btn.classList.remove('open');
  });
});




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// js/contact-form.js
(function () {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const statusBox = form.querySelector('.contact-form__status');
  const btn = form.querySelector('.contact-form__submit');

  const setStatus = (msg, type = '') => {
    statusBox.textContent = msg || '';
    statusBox.classList.remove('is-success', 'is-error');
    if (type) statusBox.classList.add(type);
  };

  const setFieldError = (name, msg = '') => {
    const err = form.querySelector(`[data-error-for="${name}"]`);
    if (err) err.textContent = msg;
    const input = form.querySelector(`[name="${name}"]`);
    if (input) {
      input.classList.toggle('is-invalid', !!msg);
      input.classList.toggle('is-valid', !msg && input.value.trim().length > 0);
    }
  };

  const validators = {
    name: (v) => v.trim().length >= 3 || 'Uveď prosím celé jméno.',
    org: (v) => v.trim().length >= 2 || 'Zadej název organizace.',
    email: (v) => /^\S+@\S+\.\S+$/.test(v) || 'Zadej platný e-mail.',
    phone: (v) => v.trim() === '' || /^[+()\d\s-]{6,}$/.test(v) || 'Telefon není ve správném formátu.',
    message: (v) => v.trim().length >= 10 || 'Napiš aspoň pár vět (min. 10 znaků).'
  };

  const validate = () => {
    let ok = true;
    Object.keys(validators).forEach((name) => {
      const el = form.elements[name];
      if (!el) return;
      const res = validators[name](String(el.value));
      const passed = res === true;
      setFieldError(name, passed ? '' : res);
      ok = ok && passed;
    });
    return ok;
  };

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.name && validators[t.name]) {
      const res = validators[t.name](String(t.value));
      setFieldError(t.name, res === true ? '' : res);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // zabráníme klasickému submitu
    if (!validate()) {
      setStatus('Zkontroluj zvýrazněná pole.', 'is-error');
      return;
    }

    btn.disabled = true;
    setStatus('Odesílám…');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      setStatus('Děkujeme za odeslání', 'is-success');
      form.reset();
      form.querySelectorAll('.is-valid').forEach(el => el.classList.remove('is-valid'));
    } catch (err) {
      console.error(err);
      setStatus('Nepodařilo se odeslat. Zkus to později.', 'is-error');
    } finally {
      btn.disabled = false;
    }
  });
})();
