// Checks the design study in an already running local Chromium debugging session.
// Example: AI_DEV_BROWSER_URL=http://127.0.0.1:9338 node scripts/check-design-preview.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const endpoint = process.env.AI_DEV_BROWSER_URL ?? 'http://127.0.0.1:9338';
const score = JSON.parse(await readFile(new URL('../assets/audio/score.json', import.meta.url), 'utf8'));
assert(Number.isFinite(score.duration_seconds) && score.duration_seconds > 0, 'score must define the loop duration');
const pages = await fetch(endpoint + '/json/list').then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.includes('/design-preview/'));
assert(page, 'Open design-preview/index.html in the debugging browser first');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  }
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, userGesture = false) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
  assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function settle() {
  await evaluate("new Promise(resolve => { const wait = () => { if (document.readyState === 'complete') document.fonts.ready.then(() => setTimeout(resolve, 100)); else setTimeout(wait, 30); }; wait(); })");
}
const output = fileURLToPath(new URL('../docs/previews/', import.meta.url));
await mkdir(output, { recursive: true });
async function screenshot(name, fullPage = false) {
  const options = { format: 'png', captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await command('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    options.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  const { data } = await command('Page.captureScreenshot', options);
  await writeFile(output + name, Buffer.from(data, 'base64'));
}
async function checkPixelRendering() {
  const devices = [
    { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
    { width: 1440, height: 1100, deviceScaleFactor: 1.25, mobile: false },
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 360, height: 800, deviceScaleFactor: 3, mobile: true },
  ];
  const results = [];
  for (const device of devices) {
    await command('Emulation.setDeviceMetricsOverride', device);
    await command('Page.reload', { ignoreCache: true }); await settle();
    const pixels = await evaluate(`(() => {
      const canvas = document.getElementById('office');
      const rect = canvas.getBoundingClientRect();
      const scene = canvas.parentElement.getBoundingClientRect();
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let partialAlpha = 0, opaque = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] === 255) opaque++;
        else if (data[index] !== 0) partialAlpha++;
      }
      return { width: canvas.width, height: canvas.height, scaleX: rect.width * devicePixelRatio / canvas.width,
        scaleY: rect.height * devicePixelRatio / canvas.height, x: rect.x * devicePixelRatio, y: rect.y * devicePixelRatio,
        partialAlpha, opaque, rendering: getComputedStyle(canvas).imageRendering,
        inside: rect.left >= scene.left - 1 && rect.right <= scene.right + 1 && rect.top >= scene.top - 1 && rect.bottom <= scene.bottom + 1,
        overflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    assert(pixels.opaque > pixels.width * pixels.height * .2, 'office scene is unexpectedly blank');
    assert.equal(pixels.partialAlpha, 0, 'source artwork contains antialiased edges');
    assert.equal(pixels.rendering, 'pixelated');
    for (const scale of [pixels.scaleX, pixels.scaleY]) assert(scale >= 1 && Math.abs(scale - Math.round(scale)) < .001, 'source pixels must occupy whole device pixels');
    assert(Math.abs(pixels.scaleX - pixels.scaleY) < .001, 'office pixels must stay square');
    assert(Math.abs(pixels.x - Math.round(pixels.x)) < .03 && Math.abs(pixels.y - Math.round(pixels.y)) < .03, 'office origin must align to device pixels');
    assert(pixels.inside && !pixels.overflow, 'office is clipped or viewport overflows');
    results.push({ viewport: `${device.width}×${device.height}`, dpr: device.deviceScaleFactor, pixelScale: Math.round(pixels.scaleX) });
  }
  return results;
}
try {
  await command('Page.enable'); await command('Runtime.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const pixelChecks = await checkPixelRendering();
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await command('Page.reload', { ignoreCache: true }); await settle();
  assert.equal(await evaluate("document.querySelectorAll('[data-staff]').length"), 4);
  assert.equal(await evaluate("document.querySelectorAll('.candidate-grid article').length"), 3);
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'desktop horizontal overflow');
  assert(await evaluate("document.getElementById('office-music').paused"), 'audio must not autoplay');
  await screenshot('office-desktop.png', true);
  await evaluate("document.querySelector('[data-staff=tim]').click()");
  assert((await evaluate("document.getElementById('staff-detail').textContent")).includes('Tim Detmer'));
  await evaluate("document.querySelector('[data-panel=ranking]').click()");
  assert(await evaluate("!document.getElementById('panel-ranking').classList.contains('hidden')"));
  assert.equal(await evaluate("document.querySelectorAll('.ranking-list li').length"), 6);
  await evaluate("document.querySelector('[data-panel=news]').click()");
  assert(await evaluate("!document.getElementById('panel-news').classList.contains('hidden')"));
  await evaluate("document.getElementById('open-hiring').click()");
  assert(await evaluate("document.getElementById('hiring-dialog').open"));
  assert(!(await evaluate("document.getElementById('hiring-dialog').textContent")).includes('Pat Patch'));
  await screenshot('hiring-desktop.png');
  await evaluate("document.getElementById('hiring-dialog').close()");
  await evaluate("document.getElementById('music-toggle').click()", true);
  const musicStarted = await evaluate("new Promise(resolve => { let attempts=0; const check=()=> { const track=document.getElementById('office-music'); if (!track.paused && track.readyState>=2) resolve(true); else if (++attempts>100) resolve(false); else setTimeout(check,30); }; check(); })");
  assert(musicStarted, 'music did not play after user interaction');
  assert(Math.abs(await evaluate("document.getElementById('office-music').duration") - score.duration_seconds) < .02, 'browser duration differs from the composed loop');
  await evaluate("document.getElementById('office-music').currentTime = document.getElementById('office-music').duration - .15");
  await evaluate("new Promise(resolve => setTimeout(resolve, 450))");
  assert(await evaluate("!document.getElementById('office-music').paused && document.getElementById('office-music').currentTime < 1"), 'music did not loop across the end of the file');
  await evaluate("const slider=document.getElementById('volume'); slider.value='0.2'; slider.dispatchEvent(new Event('input')); ");
  assert.equal(await evaluate("document.getElementById('office-music').volume"), .2);
  await evaluate("document.getElementById('open-release').click()", true);
  assert(await evaluate("document.getElementById('release-dialog').open"));
  assert.equal(await evaluate("document.getElementById('office-music').volume"), .05);
  await screenshot('release-desktop.png');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'));");
  assert(await evaluate("document.getElementById('office-music').paused && document.getElementById('release-sound').paused"));
  assert.equal(await evaluate("document.getElementById('office-music').volume"), .2);
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'));", true);
  assert.equal(await evaluate("document.getElementById('office-music').volume"), .2);
  assert(await evaluate("document.getElementById('release-sound').paused"));
  await evaluate("delete document.hidden;");
  await evaluate("document.getElementById('release-dialog').close()");
  assert.equal(await evaluate("document.getElementById('office-music').volume"), .2);
  await evaluate("document.getElementById('open-release').click()", true);
  await evaluate("document.getElementById('view-report').click()");
  assert(await evaluate("document.getElementById('report-dialog').open && !document.getElementById('release-dialog').open"));
  await screenshot('report-desktop.png');
  await evaluate("document.getElementById('report-dialog').close()");
  await evaluate("document.getElementById('open-ending').click()");
  assert(await evaluate("document.getElementById('ending-dialog').open"));
  await screenshot('ending-desktop.png');
  for (const [ending, title] of [['capital', '融资永动机'], ['ordinary', '明年一定第一'], ['failure', '发布会照常'], ['crown', '榜单常青树']]) {
    await evaluate("document.querySelector('[data-ending=" + ending + "]').click()");
    assert.equal(await evaluate("document.getElementById('ending-title').textContent"), title);
  }
  await evaluate("document.getElementById('ending-dialog').close()");
  await evaluate("document.getElementById('music-toggle').click()", true);
  assert(await evaluate("document.getElementById('office-music').paused && document.getElementById('release-sound').paused"));
  await evaluate("document.getElementById('reply-feedback').click()");
  assert((await evaluate("document.getElementById('reply-feedback').textContent")).includes('已标记'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.reload', { ignoreCache: true }); await settle();
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow');
  assert.equal(await evaluate("document.getElementById('volume').value"), '0.2');
  assert(await evaluate("document.getElementById('office-music').paused"));
  await screenshot('office-mobile.png', true);
  await evaluate("document.getElementById('open-hiring').click()");
  const dialogBounds = await evaluate("JSON.stringify({ width:document.getElementById('hiring-dialog').getBoundingClientRect().width,viewport:innerWidth })");
  const bounds = JSON.parse(dialogBounds); assert(bounds.width <= bounds.viewport);
  await evaluate("document.getElementById('hiring-dialog').close()");
  assert.deepEqual(exceptions, []);
  console.log(JSON.stringify({ status: 'PASS', desktop: '1440 × 1100', mobile: '390 × 844', pixelChecks,
    verified: ['employee selection', 'tabs', 'hiring dialog', 'release dialog', 'release report', 'four ending compositions', 'feedback response',
      'no autoplay', 'music playback', 'loop wrap', 'volume persistence', 'release audio ducking',
      'visibilitychange during release restores music volume', 'mute', 'no horizontal overflow'],
    screenshots: ['office-desktop.png', 'hiring-desktop.png', 'release-desktop.png', 'report-desktop.png', 'ending-desktop.png', 'office-mobile.png'],
    boundary: 'Design preview with illustrative fixed values; not a playable economy.' }));
} finally { socket.close(); }
