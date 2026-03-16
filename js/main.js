/* ===================================================
   Fairway Construction LLC — main.js
   Mobile nav toggle, smooth scroll offset, form submit
   =================================================== */

(function () {
  'use strict';

  /* --- Footer year --- */
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------------------------------------
     MOBILE NAV TOGGLE
  ------------------------------------------------- */
  const hamburger = document.getElementById('hamburger');
  const navMenu   = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      const isOpen = navMenu.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    // Close menu when a nav link is clicked
    navMenu.addEventListener('click', function (e) {
      if (e.target.classList.contains('nav-link')) {
        navMenu.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });

    // Close menu on outside click
    document.addEventListener('click', function (e) {
      if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* -------------------------------------------------
     SMOOTH SCROLL WITH STICKY NAV OFFSET
  ------------------------------------------------- */
  const NAV_HEIGHT = 68; // matches --nav-height in CSS

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      const targetTop = target.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT - 8;

      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  });

  /* -------------------------------------------------
     ESTIMATE FORM — submit handler (POST to contact.php)
  ------------------------------------------------- */
  const form       = document.getElementById('estimate-form');
  const successMsg = document.getElementById('form-success');
  const errorMsg   = document.getElementById('form-error');

  if (form && successMsg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Basic validation
      const name    = form.querySelector('#full-name');
      const phone   = form.querySelector('#phone');
      const service = form.querySelector('#service-type');
      let valid = true;

      [name, phone, service].forEach(function (field) {
        if (!field.value.trim()) {
          markInvalid(field);
          valid = false;
        } else {
          markValid(field);
        }
      });

      if (!valid) return;

      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      fetch('contact.php', {
        method: 'POST',
        body: new FormData(form)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.success) {
            showSuccess();
          } else {
            showError(data.error || 'Something went wrong. Please call us directly.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Request My Free Estimate';
          }
        })
        .catch(function () {
          showError('Something went wrong. Please call us directly at (602) 809-5941.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Request My Free Estimate';
        });
    });

    // Live validation feedback
    form.querySelectorAll('input, select, textarea').forEach(function (field) {
      field.addEventListener('blur', function () {
        if (field.required && !field.value.trim()) {
          markInvalid(field);
        } else {
          markValid(field);
        }
      });

      field.addEventListener('input', function () {
        if (field.value.trim()) markValid(field);
      });
    });
  }

  function showSuccess() {
    form.hidden = true;
    if (errorMsg) errorMsg.hidden = true;
    successMsg.hidden = false;
    successMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showError(message) {
    if (errorMsg) {
      errorMsg.textContent = message;
      errorMsg.hidden = false;
      errorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function markInvalid(field) {
    field.style.borderColor = '#ef4444';
    field.style.boxShadow   = '0 0 0 3px rgba(239,68,68,.15)';
    field.setAttribute('aria-invalid', 'true');
  }

  function markValid(field) {
    field.style.borderColor = '';
    field.style.boxShadow   = '';
    field.removeAttribute('aria-invalid');
  }

}());
