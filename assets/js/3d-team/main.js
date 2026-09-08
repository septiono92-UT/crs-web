// CRS Net — Team cards: interactive CSS 3D tilt.
//
// Pointer-move tilt for desktop fine pointers only. The card rotates on
// X/Y (--rx/--ry) while its photo/monogram and text float on depth layers
// (CSS translateZ inside transform-style: preserve-3d) and a cast-shadow
// pseudo-element drifts opposite the tilt (--shx/--shy). All motion is
// transform/opacity only — layout is never touched, so CLS stays 0.
//
// Accessibility: the tilt is purely decorative pointer feedback. Focus
// outlines, link targets and tab order are untouched; no information is
// conveyed by motion alone. Tilt never activates for prefers-reduced-motion
// users or on touch/coarse pointers, and it detaches live if either media
// state flips while the page is open.

const MAX_TILT_DEG = 7;
const MAX_SHADOW_PX = 12;
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function initTeamTilt() {
  const cards = Array.prototype.slice.call(
    document.querySelectorAll('.team-card')
  );
  if (!cards.length || !window.matchMedia) return null;

  const fineQuery = window.matchMedia(FINE_POINTER_QUERY);
  const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);

  let enabled = fineQuery.matches && !motionQuery.matches;
  let rafId = 0;
  const state = new Map();

  function setTiltVars(card, px, py) {
    // px/py: cursor offset from card centre, normalised to -0.5..0.5.
    // Card leans toward the cursor; cast shadow drifts the opposite way.
    card.style.setProperty('--rx', (-py * MAX_TILT_DEG).toFixed(2) + 'deg');
    card.style.setProperty('--ry', (-px * MAX_TILT_DEG).toFixed(2) + 'deg');
    card.style.setProperty('--shx', (-px * MAX_SHADOW_PX).toFixed(1) + 'px');
    card.style.setProperty('--shy', (-py * MAX_SHADOW_PX).toFixed(1) + 'px');
  }

  function clearTiltVars(card) {
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
    card.style.removeProperty('--shx');
    card.style.removeProperty('--shy');
  }

  function deactivate(card) {
    const s = state.get(card);
    if (s) s.active = false;
    card.classList.remove('is-tilting');
    clearTiltVars(card);
  }

  function tick() {
    rafId = 0;
    let anyActive = false;
    state.forEach(function (s, card) {
      if (!s.active) return;
      anyActive = true;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.max(-0.5, Math.min(0.5, (s.x - rect.left) / rect.width - 0.5));
      const py = Math.max(-0.5, Math.min(0.5, (s.y - rect.top) / rect.height - 0.5));
      setTiltVars(card, px, py);
    });
    if (anyActive) rafId = requestAnimationFrame(tick);
  }

  cards.forEach(function (card) {
    if (card.dataset.tiltInit === 'true') return;
    card.dataset.tiltInit = 'true';
    const s = { x: 0, y: 0, active: false };
    state.set(card, s);

    card.addEventListener('pointerenter', function () {
      if (!enabled) return;
      s.active = true;
      card.classList.add('is-tilting');
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
    card.addEventListener('pointermove', function (event) {
      if (!enabled || !s.active) return;
      s.x = event.clientX;
      s.y = event.clientY;
    });
    card.addEventListener('pointerleave', function () {
      deactivate(card);
    });
    card.addEventListener('pointercancel', function () {
      deactivate(card);
    });
  });

  function syncEnabled(next) {
    if (next === enabled) return;
    enabled = next;
    cards.forEach(function (card) {
      deactivate(card);
      if (enabled) card.dataset.tilt = 'on';
      else delete card.dataset.tilt;
    });
  }

  function onFineChange(event) {
    syncEnabled(event.matches && !motionQuery.matches);
  }
  function onMotionChange(event) {
    syncEnabled(fineQuery.matches && !event.matches);
  }
  if (fineQuery.addEventListener) {
    fineQuery.addEventListener('change', onFineChange);
  } else if (fineQuery.addListener) {
    fineQuery.addListener(onFineChange);
  }
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', onMotionChange);
  } else if (motionQuery.addListener) {
    motionQuery.addListener(onMotionChange);
  }

  function onWindowBlur() {
    cards.forEach(deactivate);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
  window.addEventListener('blur', onWindowBlur);

  function teardown() {
    onWindowBlur();
    window.removeEventListener('blur', onWindowBlur);
    if (fineQuery.removeEventListener) {
      fineQuery.removeEventListener('change', onFineChange);
    }
    if (motionQuery.removeEventListener) {
      motionQuery.removeEventListener('change', onMotionChange);
    }
    cards.forEach(function (card) {
      delete card.dataset.tiltInit;
      delete card.dataset.tilt;
    });
  }

  if (enabled) {
    cards.forEach(function (card) { card.dataset.tilt = 'on'; });
  }

  return { teardown };
}

function autoInit() {
  initTeamTilt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit, { once: true });
} else {
  autoInit();
}
