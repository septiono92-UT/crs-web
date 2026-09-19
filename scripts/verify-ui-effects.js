// CDP verification for the UI-effects layer (glass, counters, parallax, cursor).
// Usage: node scripts/verify-ui-effects.js <url> [port] [--shot-dir=dir]
// Launches the Playwright-cached Chrome for Testing headless, drives it over
// raw CDP (no npm deps), asserts the new enhancements and saves screenshots.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const urlArg = process.argv[2] || 'http://127.0.0.1:8123/';
const port = parseInt(process.argv[3] || '9360', 10);
const shotArg = process.argv.find(a => a.startsWith('--shot-dir='));
const shotDir = shotArg ? shotArg.slice(11) : '/tmp/crs-ui-qa';

const CHROME = path.join(os.homedir(),
  '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

function httpGetJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: p }, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(CHROME)) { console.error('chrome not found:', CHROME); process.exit(2); }
  fs.mkdirSync(shotDir, { recursive: true });

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crs-qa-'));
  const chrome = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--mute-audio', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2',
    `--remote-debugging-port=${port}`, '--window-size=1440,900',
    `--user-data-dir=${userDir}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await httpGetJSON('/json/version'); break; } catch (e) { await sleep(250); }
  }
  if (!version) { console.error('chrome did not expose CDP'); chrome.kill(); process.exit(2); }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = ev => {
    const d = JSON.parse(ev.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id); pending.delete(d.id);
      d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
    } else if (d.method) events.push(d);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  try {
    await S('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'fine' },
        { name: 'hover', value: 'hover' },
        { name: 'prefers-reduced-motion', value: 'no-preference' }
      ]
    });
  } catch (e) { /* older builds: rely on real desktop defaults */ }

  await S('Page.navigate', { url: urlArg });
  for (let i = 0; i < 80; i++) {
    const r = await S('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result.value === 'complete') break;
    await sleep(200);
  }
  await sleep(2600); // let counters finish their entrance animation

  const evl = async (expression, awaitPromise = false) => {
    const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error('page eval error: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  await evl(`document.documentElement.style.scrollBehavior='auto'; true`); // test determinism

  // ---- 1. cursor layer created -------------------------------------------
  const fxOn = await evl(`document.documentElement.classList.contains('cursor-fx')`);
  const cursorN = await evl(`document.querySelectorAll('.cursor-dot,.cursor-ring,.cursor-glow').length`);
  check('cursor-fx enabled', fxOn);
  check('cursor elements present', cursorN === 3, `count=${cursorN}`);
  if (!fxOn || cursorN !== 3) {
    const media = await evl(`JSON.stringify({fine:matchMedia('(pointer: fine)').matches,anyFine:matchMedia('(any-pointer: fine)').matches,hover:matchMedia('(hover: hover)').matches,rm:matchMedia('(prefers-reduced-motion: reduce)').matches})`);
    console.log('debug media state:', media);
  }

  // ---- 2. counters --------------------------------------------------------
  const heroCounts = await evl(`[...document.querySelectorAll('.hero-meta strong')].map(e=>e.textContent).join('|')`);
  check('hero counters settled', heroCounts === '13+|SEA|24/7', heroCounts);

  await evl(`document.querySelector('.about-stats').scrollIntoView({block:'center'}); true`);
  await sleep(2400);
  const stats = await evl(`[...document.querySelectorAll('.stat strong')].map(e=>e.textContent).join('|')`);
  check('about stats settled', stats === '13+|8|3|100%', stats);

  // ---- 3. cursor follows pointer / hover grow ------------------------------
  if (fxOn && cursorN === 3) {
    await evl(`window.scrollTo(0,0); true`); await sleep(350);
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 420, y: 320, button: 'none' });
    await sleep(200);
    const dotT = await evl(`document.querySelector('.cursor-dot').style.transform`);
    check('cursor dot follows mouse', /translate3d\(420px/.test(dotT), dotT);

    const rect = await evl(`(()=>{const r=document.querySelector('.hero-cta .btn-wa').getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`);
    const c = JSON.parse(rect);
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(c.x), y: Math.round(c.y), button: 'none' });
    await sleep(300);
    check('cursor ring grows on hover', await evl(`document.querySelector('.cursor-ring').classList.contains('is-hover')`));
  } else {
    check('cursor dot follows mouse', false, 'skipped — cursor layer unavailable');
    check('cursor ring grows on hover', false, 'skipped — cursor layer unavailable');
  }

  // ---- 4. parallax ---------------------------------------------------------
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 260, button: 'none' });
  await evl(`window.scrollTo(0, 420); true`); await sleep(500);
  const px = await evl(`getComputedStyle(document.querySelector('.hero-bg')).transform`);
  check('hero parallax transform active', px !== 'none' && px !== '' && px.includes('matrix'), px.slice(0, 60));

  // ---- 5. no page errors ---------------------------------------------------
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  const logErrs = events.filter(e => e.method === 'Log.entryAdded' && e.params && e.params.entry && e.params.entry.level === 'error');
  // Tolerated (pre-existing, unrelated to the UI layer): GA4 + CF beacon are
  // fetched/blocked by the site's own CSP, and /api/visits has no backend on a
  // plain static test server.
  const tolerated = e => {
    const en = e.params.entry || {};
    const u = en.url || '';
    const t = en.text || '';
    if (u.includes('googletagmanager.com') || u.includes('/api/visits')) return true;
    if (t.includes('Content Security Policy') && (t.includes('googletagmanager') || t.includes('cloudflareinsights') || t.includes('inline script'))) return true;
    return false;
  };
  const unexpected = logErrs.filter(e => !tolerated(e));
  check('no JS exceptions', exceptions.length === 0,
    exceptions.length ? exceptions.map(e => JSON.stringify(e.params.exceptionDetails && e.params.exceptionDetails.exception).slice(0, 200)).join(' | ') : '0');
  check('no unexpected resource errors', unexpected.length === 0,
    unexpected.length ? unexpected.map(e => (e.params.entry.url || '') + ' :: ' + e.params.entry.text).join(' | ') :
      `tolerated: ${logErrs.length ? logErrs.map(e => e.params.entry.url).join(', ') : 'none'}`);

  // ---- 6. screenshots ------------------------------------------------------
  const shot = async name => {
    const r = await S('Page.captureScreenshot', { format: 'png' });
    const p = path.join(shotDir, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    console.log('shot:', p);
  };
  await evl(`window.scrollTo(0,0); true`); await sleep(400);
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 620, y: 400, button: 'none' });
  await sleep(300);
  await shot('qa-1-hero.png');

  await evl(`document.querySelector('#services .card').scrollIntoView({block:'center'}); true`); await sleep(600);
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 480, y: 430, button: 'none' });
  await sleep(400);
  await shot('qa-2-services.png');

  await evl(`document.querySelector('.cta-band').scrollIntoView({block:'center'}); true`); await sleep(600);
  await shot('qa-3-cta.png');

  await evl(`document.querySelector('.team-grid').scrollIntoView({block:'center'}); true`); await sleep(600);
  await shot('qa-4-team.png');

  await evl(`document.getElementById('themeToggle').click(); true`); await sleep(500);
  await evl(`document.querySelector('.about-stats').scrollIntoView({block:'center'}); true`); await sleep(700);
  await shot('qa-5-light-stats.png');

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close(); chrome.kill();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('QA fatal:', e.message); process.exit(2); });
