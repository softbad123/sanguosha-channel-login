const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index;
  let depth = 0, seen = false, end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') { depth++; seen = true; }
    else if (ch === '}') { depth--; if (seen && depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(name + ' incomplete');
  return source.slice(start, end);
}

const code = [
  extract('decodeJS'), extract('wxCallback'), extract('wxPollResult'), extract('prepareWX'), extract('waitForWX')
].join('\n');

function baseContext(extra) {
  const URLWithBlob = URL;
  URLWithBlob.createObjectURL = () => 'blob:wx-test';
  const ctx = {
    WX_APP: 'wxba26a260a325b6f8', Date, Number, String, Object, URL: URLWithBlob, URLSearchParams,
    Blob: class Blob { constructor(parts, options) { this.parts = parts; this.options = options; } },
    assert: (ok, codeName, stage) => { if (!ok) { const error = new Error(codeName); error.stage = stage; throw error; } },
    failure: (codeName, stage) => Object.assign(new Error(codeName), {stage}),
    uniqueParams: search => Object.fromEntries(new URLSearchParams(search)),
    queryURL: (base, params) => base + '?' + new URLSearchParams(params),
    active: () => {},
    sleep: async () => {},
    setBrowserNotice: (attempt, text) => { attempt.browserNotice = text; },
    hideQR: attempt => { attempt.hidden = true; },
    ...extra
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

(async () => {
  const jpeg = new Uint8Array(20); jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff;
  jpeg[jpeg.length - 2] = 0xff; jpeg[jpeg.length - 1] = 0xd9;
  const state = 'a'.repeat(32);
  const page = '<script>window.cgiData={uuid: "qr-uuid-1234", appid: "wxba26a260a325b6f8"};</script>' +
    '<img src="https://open.weixin.qq.com/connect/qrcode/qr-uuid-1234">';
  let calls = 0;
  const ctx = baseContext({
    transport: async (_a, url) => {
      calls++;
      if (url.includes('/connect/app/qrconnect')) return {responseText: page};
      if (url.includes('/connect/qrcode/')) return {response: jpeg};
      throw new Error('unexpected transport ' + url);
    },
    ui: {screen: {alt: '', src: '', hidden: true}}
  });
  const attempt = {state, stage: 'setup', cookies: {clear() { this.cleared = true; }}};
  await vm.runInContext('prepareWX(attempt)', Object.assign(ctx, {attempt}));
  const prepared = attempt.wxUUID === 'qr-uuid-1234' && attempt.image === 'blob:wx-test' &&
    attempt.stage === 'waiting_scan' && attempt.browserNotice === '请使用微信扫描二维码' &&
    ctx.ui.screen.hidden === false && calls === 2;

  const redirect = 'wxba26a260a325b6f8://oauth?state=' + state + '&code=wx-code-12345678';
  const pollCtx = baseContext({
    transport: async () => ({responseText: 'window.wx_errcode = 405; window.wx_redirecturl = "' + redirect + '"; window.wx_nickname = "测试";'}),
    ui: {screen: {hidden: false}}
  });
  const pollAttempt = {state, stage: 'wx_poll', wxUUID: 'qr-uuid-1234', wxReferer: 'https://open.weixin.qq.com/',
    cookies: {clear() { this.cleared = true; }}, requests: new Set()};
  await vm.runInContext('waitForWX(attempt)', Object.assign(pollCtx, {attempt: pollAttempt}));
  const completed = pollAttempt.wxCode === 'wx-code-12345678' && pollAttempt.cookies.cleared &&
    pollAttempt.wxUUID === '' && pollAttempt.wxReferer === '' && pollAttempt.hidden === true &&
    pollAttempt.browserNotice === '微信已确认，正在兑换 WeGame 登录票据…';

  console.log(JSON.stringify({prepared, completed}, null, 2));
  if (!prepared || !completed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
