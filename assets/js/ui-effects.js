/* CRS Net — UI effects layer: animated counters, light parallax, cursor FX.
   Progressive enhancement only — with JS off, prefers-reduced-motion, or a
   coarse pointer the site renders and behaves exactly as before. */
(function () {
  'use strict';

  function mq(q) {
    try { return window.matchMedia ? window.matchMedia(q).matches : false; }
    catch (e) { return false; }
  }

  var reduceMotion = mq('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------------
     1. Animated counters
     [data-count="13"] [data-suffix="+"] — original text stays in the
     markup as the no-JS value; JS only takes over to animate.
     ------------------------------------------------------------------ */
  (function () {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!els.length) return;

    function finalText(el) {
      return el.getAttribute('data-count') + (el.getAttribute('data-suffix') || '');
    }

    function animate(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (isNaN(target)) return;
      var suffix = el.getAttribute('data-suffix') || '';
      var duration = 1400;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = String(Math.round(target * eased)) + suffix;
        if (p < 1) {
          requestAnimationFrame(frame);
        } else {
          el.textContent = String(target) + suffix;
        }
      }
      requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      els.forEach(function (el) { el.textContent = finalText(el); });
      return;
    }
    if (!('IntersectionObserver' in window)) {
      els.forEach(animate);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          io.unobserve(entry.target);
          animate(entry.target);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------------------
     2. Light parallax
     [data-parallax="0.22"] = lag factor (element moves slower than the
     page); negative = leads. [data-parallax-max] caps the shift in px.
     Baseline is captured at init so the page loads with zero offset.
     ------------------------------------------------------------------ */
  (function () {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (!els.length || reduceMotion) return;

    var items = [];
    var ticking = false;

    function measure() {
      items = els.map(function (el) {
        el.style.transform = ''; // measure the untransformed box
        var r = el.getBoundingClientRect();
        return {
          el: el,
          k: parseFloat(el.getAttribute('data-parallax')) || 0,
          max: parseFloat(el.getAttribute('data-parallax-max')) || 80,
          center: r.top + window.pageYOffset + r.height / 2,
          raw0: null
        };
      });
    }

    function update() {
      ticking = false;
      if (document.hidden) return;
      var i;
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        var raw = (window.pageYOffset + window.innerHeight / 2) - it.center;
        if (it.raw0 === null) it.raw0 = raw;
        var d = (it.raw0 - raw) * it.k;
        if (d > it.max) d = it.max;
        if (d < -it.max) d = -it.max;
        it.el.style.transform = 'translate3d(0,' + d.toFixed(2) + 'px,0)';
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { measure(); onScroll(); });
    window.addEventListener('load', function () { measure(); onScroll(); });
  })();

  /* ------------------------------------------------------------------
     3. Cursor FX (fine pointers only)
     Dot follows instantly, ring + soft glow trail with easing; the ring
     grows over interactive elements. Native cursor stays usable inside
     form fields; everything is skipped for touch and reduced motion.
     ------------------------------------------------------------------ */
  (function () {
    if (!mq('(pointer: fine)') || reduceMotion) return;
    if (window.__crsCursorFx) return; // double-load guard
    window.__crsCursorFx = true;

    var root = document.documentElement;
    var dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.setAttribute('aria-hidden', 'true');
    var ring = document.createElement('div');
    ring.className = 'cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    var glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    root.classList.add('cursor-fx');

    var HOVER = 'a, button, .btn, summary, [role="button"], .badge';
    var FIELDS = 'input, textarea, select, option';

    var mx = -100, my = -100;      // mouse
    var rx = -100, ry = -100;      // ring (eased)
    var gx = -100, gy = -100;      // glow (slower)
    var started = false;

    function onMove(e) {
      mx = e.clientX;
      my = e.clientY;
      if (!started) { started = true; rx = mx; ry = my; gx = mx; gy = my; }
      root.classList.remove('cursor-off');
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    }

    function loop() {
      if (started && !document.hidden) {
        rx += (mx - rx) * 0.18;
        ry += (my - ry) * 0.18;
        gx += (mx - gx) * 0.085;
        gy += (my - gy) * 0.085;
        ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
        glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      }
      requestAnimationFrame(loop);
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', function () { root.classList.add('cursor-off'); });
    document.addEventListener('mouseenter', function () { root.classList.remove('cursor-off'); });

    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(FIELDS)) { root.classList.add('cursor-text'); }
      else if (t.closest(HOVER)) { ring.classList.add('is-hover'); }
    }, true);
    document.addEventListener('mouseout', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(FIELDS)) { root.classList.remove('cursor-text'); }
      else { ring.classList.remove('is-hover'); }
    }, true);

    document.addEventListener('mousedown', function () { ring.classList.add('is-down'); });
    document.addEventListener('mouseup', function () { ring.classList.remove('is-down'); });

    requestAnimationFrame(loop);
  })();
})();
