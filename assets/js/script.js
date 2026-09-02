// CRS Net — small interactions
(function () {
  'use strict';

  // Mark JS as available so reveal animations can enhance (not hide) content.
  document.documentElement.classList.add('js');

  // Theme toggle (dark mode). Persisted in localStorage; DARK is the default
  // (we do NOT auto-follow the OS light preference). The initial theme is set
  // statically via data-theme="dark" on <html> so there is no flash of the
  // light theme before this script runs.
  (function () {
    var KEY = 'crs-theme';
    var root = document.documentElement;
    var btn = document.getElementById('themeToggle');
    function current() { return root.getAttribute('data-theme') || 'dark'; }
    function apply(theme) {
      if (theme === 'dark' || theme === 'light') {
        root.setAttribute('data-theme', theme);
      } else {
        root.setAttribute('data-theme', 'dark'); // explicit dark default
      }
      if (btn) { btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); }
    }
    // initialise from stored choice; default to DARK
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    apply(stored || 'dark');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = (current() === 'dark') ? 'light' : 'dark';
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
      });
    }
  })();

  // Visitor counter — privacy-friendly, self-hosted. Counts page views only.
  (function () {
    var el = document.getElementById('visitorCount');
    if (!el) return;
    fetch('/api/visits', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && typeof d.count === 'number') {
          el.textContent = d.count.toLocaleString('en-US');
        }
      })
      .catch(function () {});
  })();

  // Mobile nav toggle
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  function closeNav() {
    if (!links || !links.classList.contains('open')) return;
    links.classList.remove('open');
    document.body.classList.remove('nav-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
    // Escape closes the menu (mobile + desktop keyboard users)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeNav(); toggle && toggle.focus(); }
    });
    // If the viewport grows past the mobile breakpoint, don't leave a stale open menu
    window.addEventListener('resize', function () {
      if (window.innerWidth > 720) closeNav();
    });
  }

  // Scroll reveal
  var revealEls = document.querySelectorAll('.card, .step, .stat, .section-head, .hero-card');
  revealEls.forEach(function (el) { el.classList.add('reveal'); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // Contact form — delivers via Formspree (free), with a mailto fallback
  // until you paste your real form ID into FORMSPREE_ENDPOINT below.
  var FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';
  var form = document.getElementById('contactForm');
  var note = document.getElementById('formNote');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var msg = form.message.value.trim();
      var emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
      if (!name || !emailOk || !msg) {
        note.textContent = 'Please fill in your name, a valid email and a message.';
        note.className = 'form-note err';
        return;
      }

      // Not configured yet -> open the visitor's email app pre-filled.
      if (FORMSPREE_ENDPOINT.indexOf('YOUR_FORM_ID') !== -1) {
        var subject = 'New enquiry from ' + name;
        var body = 'Name: ' + name + '\nEmail: ' + email + '\n\n' + msg;
        window.location.href = 'mailto:crs.network@outlook.com?subject=' +
          encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        note.textContent = 'Opening your email app to send the message.';
        note.className = 'form-note ok';
        return;
      }

      // Configured -> POST to Formspree.
      note.textContent = 'Sending...';
      note.className = 'form-note';
      fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: name, email: email, message: msg })
      }).then(function (r) {
        if (r.ok) {
          note.textContent = 'Thanks, ' + name + '! Your message has been sent - we will reply soon.';
          note.className = 'form-note ok';
          form.reset();
        } else {
          throw new Error('bad status');
        }
      }).catch(function () {
        note.textContent = 'Something went wrong sending. Please email crs.network@outlook.com directly.';
        note.className = 'form-note err';
      });
    });
  }
})();
