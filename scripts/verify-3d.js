// CDP verification for the 3D enhancements (approach WebGL scene + team tilt).
// Usage: node scripts/verify-3d.js <url> [port] [--reduced-motion] [--coarse] [--shot=path.png]
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const url = process.argv[2] || 'http://127.0.0.1:8123/';
const port = parseInt(process.argv[3] || '9350', 10);
const reducedMotion = process.argv.includes('--reduced-motion');
const coarse = process.argv.includes('--coarse');
const fine = process.argv.includes('--fine');
const shotArg = process.argv.find(a => a.startsWith('--shot='));
const shotPath = shotArg ? shotArg.slice(7) : null;
const fullShotArg = process.argv.find(a => a.startsWith('--fullshot='));
const fullShotPath = fullShotArg ? fullShotArg.slice(11) : null;
const vpArg = process.argv.find(a => a.startsWith('--viewport='));
const viewport = vpArg ? vpArg.slice(11) : '1440,900';

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.errors.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
      } else if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') this.errors.push('console: ' + e.text);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

(async () => {
  const flags = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--window-size=${viewport}`,
  ];
  if (reducedMotion) flags.push('--force-prefers-reduced-motion');
  flags.push('about:blank');
  const chr = spawn('chromium-browser', flags, { stdio: 'ignore' });

  await sleep(1500);
  let targets = null;
  for (let i = 0; i < 20; i++) {
    try { targets = await getJSON('/json/list'); if (targets.length) break; } catch {}
    await sleep(500);
  }
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.error('no page target'); chr.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  if (coarse) {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'hover', value: 'none' },
        { name: 'pointer', value: 'coarse' },
      ],
    });
  }
  if (fine) {
    // setEmulatedMedia cannot fake hover/pointer in this build, so answer the
    // fine-pointer media query via a stub injected before page scripts.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      (function () {
        const orig = window.matchMedia;
        window.matchMedia = function (q) {
          if (q === '(hover: hover) and (pointer: fine)') {
            return {
              matches: true, media: q,
              addEventListener: function () {}, removeEventListener: function () {},
              addListener: function () {}, removeListener: function () {},
            };
          }
          return orig.call(window, q);
        };
      })();
    ` });
  }
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });
  await sleep(7000); // load + 3D settle

  const evalExpr = async (expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 400));
    return result.value;
  };

  const base = await evalExpr(`(async () => {
    const shifts = [];
    const cls = await new Promise(r => {
      let v = 0;
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
        v += e.value;
        shifts.push({
          value: Math.round(e.value * 1000) / 1000,
          sources: (e.sources || []).map(s => {
            const n = s.node;
            if (!n) return '(no node)';
            let id = n.nodeName;
            if (n.id) id += '#' + n.id;
            if (n.className && typeof n.className === 'string') id += '.' + n.className.split(/\\s+/).slice(0, 3).join('.');
            return id;
          }),
        });
      } r(v); })
        .observe({ type: 'layout-shift', buffered: true }); } catch { r(-1); }
      setTimeout(() => r(v), 800);
    });
    const mount = document.querySelector('.approach-3d');
    const teamLinks = Array.from(document.querySelectorAll('#team a'));
    return {
      page: location.pathname,
      cls: Math.round(cls * 1000) / 1000,
      canvasCount: document.querySelectorAll('canvas').length,
      heroCanvas: !!document.querySelector('.hero-3d canvas'),
      approachCanvas: !!document.querySelector('.approach-3d canvas'),
      approachMode: mount ? (mount.dataset.approach3dMode || 'none') : 'missing',
      approachInit: mount ? (mount.dataset.approach3dInit === 'true') : false,
      steps: document.querySelectorAll('.approach-steps .step').length,
      teamCards: document.querySelectorAll('.team-card').length,
      tiltCards: document.querySelectorAll('.team-card[data-tilt="on"]').length,
      teamLinksReachable: teamLinks.length > 0 && teamLinks.every(a => a.tabIndex >= 0),
      teamLinksCount: teamLinks.length,
      tiltTransform: getComputedStyle(document.querySelector('.team-card')).transform !== 'none',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarse: !matchMedia('(hover: hover) and (pointer: fine)').matches,
      shiftDetails: shifts,
      approachGeom: (function () {
        const m = document.querySelector('.approach-3d');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        const inner = document.querySelector('.approach-inner');
        const cols = inner ? getComputedStyle(inner).gridTemplateColumns.split(' ').length : 0;
        return { w: Math.round(r.width), h: Math.round(r.height), columns: cols };
      })(),
      stepRowLayout: (function () {
        const n = document.querySelector('.approach-steps .step .step-n');
        const t = document.querySelector('.approach-steps .step h3');
        if (!n || !t) return null;
        return { chipLeftOfText: n.getBoundingClientRect().right <= t.getBoundingClientRect().left + 1 };
      })(),
      teamDepth: (function () {
        const card = document.querySelector('.team-card');
        if (!card) return null;
        const cs = getComputedStyle(card);
        const after = getComputedStyle(card, '::after');
        const visual = card.querySelector('.team-photo') || card.querySelector('.team-monogram');
        return {
          preserve3d: cs.transformStyle === 'preserve-3d',
          cardIs3d: cs.transform !== 'none',
          shadowPseudo: after.content !== 'none' && after.content !== 'normal',
          shadowBehindPlane: after.transform !== 'none',
          visualDepth: !!visual && getComputedStyle(visual).transform !== 'none',
          linksDepth: getComputedStyle(card.querySelector('.team-links')).transform !== 'none',
        };
      })(),
    };
  })()`);

  // Canvas content check. WebGL drawing buffers are invalidated after
  // compositing (preserveDrawingBuffer is false), so:
  // - animated scenes: readPixels inside a rAF that runs right after the
  //   scene's own render in the same frame; take the max over N frames.
  // - static (reduced-motion): flip the theme; both scenes re-render in a
  //   MutationObserver microtask, then readPixels in the same task.
  let canvasPaint = {};
  const readCanvasNow = (sel) => `(function () {
    const cv = document.querySelector(${JSON.stringify(sel)});
    if (!cv) return null;
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return { error: 'no gl context' };
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0, total = 0;
    for (let i = 3; i < px.length; i += 4) { total++; if (px[i] > 8) lit++; }
    return { w, h, litRatio: Math.round(lit / total * 10000) / 10000 };
  })()`;

  const sampleAnimated = (sel) => evalExpr(`(async () => {
    const cv = document.querySelector(${JSON.stringify(sel)});
    if (!cv) return null;
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return { error: 'no gl context' };
    let best = null;
    for (let f = 0; f < 14; f++) {
      await new Promise(res => requestAnimationFrame(() => {
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let lit = 0, total = 0;
        for (let i = 3; i < px.length; i += 4) { total++; if (px[i] > 8) lit++; }
        const r = Math.round(lit / total * 10000) / 10000;
        if (!best || r > best.litRatio) best = { w, h, litRatio: r };
        res();
      }));
    }
    return best;
  })()`);

  // Hero canvas: visible at the top of the page, before any scrolling.
  if (base.heroCanvas) {
    canvasPaint.hero = base.reducedMotion
      ? await evalExpr(`(async () => {
          document.documentElement.setAttribute('data-theme','light');
          await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
          const r = ${readCanvasNow('.hero-3d canvas')};
          document.documentElement.setAttribute('data-theme','dark');
          await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
          return r;
        })()`)
      : await sampleAnimated('.hero-3d canvas');
  }

  // Scroll pause/resume: approach scene must idle when off-screen.
  // (Neutralise CSS smooth scrolling first so scrolls land synchronously.)
  let scrollTest = null;
  if (base.approachCanvas) {
    await evalExpr(`document.documentElement.style.scrollBehavior='auto', 0`);
    await evalExpr(`window.scrollTo(0, document.body.scrollHeight), 0`);
    await sleep(600);
    const away = await evalExpr(`document.querySelector('.approach-3d').dataset.approach3dMode`);
    await evalExpr(`(function(){ const m = document.querySelector('.approach-3d'); m.scrollIntoView({block:'center'}); })(), 0`);
    await sleep(600);
    const back = await evalExpr(`document.querySelector('.approach-3d').dataset.approach3dMode`);
    scrollTest = { scrolledAway: away, scrolledBack: back };
  }

  // Approach canvas: in view after the scroll test.
  if (base.approachCanvas) {
    canvasPaint.approach = base.reducedMotion
      ? await evalExpr(`(async () => {
          document.documentElement.setAttribute('data-theme','light');
          await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
          const light = ${readCanvasNow('.approach-3d canvas')};
          document.documentElement.setAttribute('data-theme','dark');
          await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
          const dark = ${readCanvasNow('.approach-3d canvas')};
          return { light, dark };
        })()`)
      : await sampleAnimated('.approach-3d canvas');
  }

  // Interactive tilt exercise (only when the enhancement attached).
  let tiltTest = null;
  if (base.tiltCards > 0) {
    tiltTest = await evalExpr(`(async () => {
      const card = document.querySelector('.team-card');
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width * 0.75, cy = r.top + r.height * 0.25;
      card.dispatchEvent(new PointerEvent('pointerenter', { clientX: cx, clientY: cy }));
      card.dispatchEvent(new PointerEvent('pointermove', { clientX: cx, clientY: cy }));
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const hovered = {
        tilting: card.classList.contains('is-tilting'),
        rx: card.style.getPropertyValue('--rx'),
        ry: card.style.getPropertyValue('--ry'),
        shx: card.style.getPropertyValue('--shx'),
        matrix: getComputedStyle(card).transform.slice(0, 32),
      };
      card.dispatchEvent(new PointerEvent('pointerleave', { clientX: cx, clientY: cy }));
      await new Promise(res => setTimeout(res, 750));
      const afterLeave = {
        tilting: card.classList.contains('is-tilting'),
        rx: card.style.getPropertyValue('--rx') || '(reset)',
      };
      card.querySelector('.team-links a').focus();
      await new Promise(res => requestAnimationFrame(res));
      return {
        hovered, afterLeave,
        focusTilts: card.classList.contains('is-tilting'),
        focusVisibleOnLink: getComputedStyle(document.activeElement).outlineStyle,
      };
    })()`);
  }

  // Real keyboard walk: Tab through the document, record focus order and
  // confirm team links are reachable in DOM order with a visible focus ring.
  const tabWalk = [];
  for (let i = 0; i < 22; i++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(60);
    const info = await evalExpr(`(function () {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        what: (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(/\\s+/)[0] : el.tagName) +
          (el.closest('#team') ? ' [team]' : ''),
        outline: cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px',
      };
    })()`);
    if (info) tabWalk.push(info.what + (info.outline ? ' (+ring)' : ''));
  }

  let shot = null;
  if (shotPath) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shotPath, Buffer.from(data, 'base64'));
    shot = shotPath;
  }
  if (fullShotPath) {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
    });
    fs.writeFileSync(fullShotPath, Buffer.from(data, 'base64'));
    shot = fullShotPath;
  }

  console.log(JSON.stringify({ run: { reducedMotion, coarse, fine, viewport }, ...base, scrollTest, canvasPaint, tiltTest, tabWalk, errors: cdp.errors, shot }, null, 1));
  ws.close(); chr.kill();
})().catch(e => { console.error('VERIFY ERROR:', e.message); process.exit(1); });
