// CDP perf probe v2: chromium loads the URL directly; we attach after settle and read buffered metrics.
// Usage: node perf-probe.js <url> [port]
const { spawn } = require('child_process');
const http = require('http');

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const port = parseInt(process.argv[3] || '9343', 10);
const win = process.argv[4] || '1440,900';

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    });
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id;
    this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
}

(async () => {
  const chr = spawn('chromium-browser', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--window-size=${win}`, url
  ], { stdio: 'ignore' });

  await sleep(9000); // load + 3D settle

  let targets = null;
  for (let i = 0; i < 20; i++) { try { targets = await getJSON('/json/list'); if (targets.length) break; } catch {} await sleep(500); }
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('http'));
  if (!page) { console.error('no page target, targets:', JSON.stringify(targets.map(t => ({ type: t.type, url: t.url })), null, 1)); chr.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');

  const { result: { value, exceptionDetails } } = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const lcp = await new Promise(r => {
        let v = 0, done = false;
        try { new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) { v = e[e.length-1].startTime; if (!done) { done = true; r(v); } } })
          .observe({ type: 'largest-contentful-paint', buffered: true }); } catch { r(0); }
        setTimeout(() => r(v), 1200);
      });
      const cls = await new Promise(r => {
        let v = 0;
        try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; r(v); })
          .observe({ type: 'layout-shift', buffered: true }); } catch { r(0); }
        setTimeout(() => r(v), 1200);
      });
      const paints = performance.getEntriesByType('paint').map(p => ({ name: p.name, ms: Math.round(p.startTime) }));
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const res = performance.getEntriesByType('resource');
      const bySize = res.map(e => ({ url: e.name.replace(location.origin, ''), kb: Math.round(e.transferSize / 102.4) / 10, decodedKB: Math.round(e.decodedBodySize / 102.4) / 10, ms: Math.round(e.duration) }))
        .sort((a, b) => b.kb - a.kb);
      const tot = bySize.reduce((a, b) => ({ kb: a.kb + b.kb, decodedKB: a.decodedKB + b.decodedKB }), { kb: 0, decodedKB: 0 });
      return JSON.stringify({
        page: location.pathname,
        ttfb: Math.round(nav.responseStart || 0),
        fcp: (paints.find(p => p.name === 'first-contentful-paint') || {}).ms,
        lcp: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        subrequests: res.length,
        totalTransferKB: Math.round(tot.kb * 10) / 10,
        totalDecodedKB: Math.round(tot.decodedKB * 10) / 10,
        top8: bySize.slice(0, 8)
      }, null, 1);
    })()`,
    awaitPromise: true, returnByValue: true
  });

  if (exceptionDetails) console.error('EVAL ERROR:', JSON.stringify(exceptionDetails, null, 1).slice(0, 500));
  else console.log(value);
  ws.close(); chr.kill();
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
