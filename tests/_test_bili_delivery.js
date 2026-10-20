const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('_direct_engine.js', 'utf8');
function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const body = source.indexOf(') {', start) + 2;
  if (body < 2) throw new Error(name + ' body not found');
  let depth = 0, seen = false;
  for (let i = body; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') { depth++; seen = true; }
    else if (ch === '}') { depth--; if (seen && depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(name + ' is incomplete');
}
const fn = [extractFunction('gameAuthFields'), extractFunction('emitGameAuth'),
  extractFunction('entryRequiresFont'), extractFunction('loginReadiness'),
  extractFunction('gameReadiness'), extractFunction('installGameRequest'),
  extractFunction('callPlatformLoginBack'), extractFunction('deliverGameGrant'),
  extractFunction('deliverBili')].join('\n');

function run(name, channelId, callback, deferredExport = false) {
  const calls = [];
  const logs = [];
  const accountInfo = {Self: {Token: '', Ticket: ''}};
  const game = {
    parseConfiged: true,
    preloaded: true,
    EnterLoginScene() { logs.push(['original-entry']); },
    platformLoginBack(value) {
      calls.push(value);
      accountInfo.Self.Token = value?.data?.token || 'T';
      this.EnterLoginScene(true);
    }
  };
  const page = {
    ReqObj: {channel_id: channelId}, AccountInfo: accountInfo,
    GameContext: {GotoLogout() {}}
  };
  if (callback && !deferredExport) page.Sgs = game;
  const context = {
    EMBEDDED: true, SESSION_KEY: 'saved', page,
    GAME_HANDOFF_TIMEOUT: 240000, ENTRY_GUARD_TTL: 60000,
    Date, String, Number, Object, Set, URLSearchParams,
    location: {pathname: '/10/pc/index.php', search: '?channel_id=' + channelId},
    GM_getValue: () => null,
    savedSession: () => null,
    handoffToast: (text, error) => logs.push(['toast', {text, error}]),
    assert: (ok, code, stage) => { if (!ok) { const e = new Error(code); e.stage = stage; throw e; } },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    console: {info: (...args) => logs.push(args), error: (...args) => logs.push(args)},
    window: {addEventListener: () => {}}
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  try {
    vm.runInContext('(deliverBili)(auth, grant, savedId);', Object.assign(context, {
      auth: {expires: Math.floor(Date.now() / 1000) + 300},
      grant: {account: 'A', token: 'T', sign: 'S', timestamp: Date.now(),
        channel_id: channelId},
      savedId: 'a'.repeat(32)
    }));
  } catch (error) {
    logs.push(['rejected', error.message]);
  }
  if (deferredExport) page.Sgs = game;
  console.log(JSON.stringify({name, calls: calls.length, code: calls[0]?.code,
    channel: calls[0]?.data?.channel_id, log: logs}));
  return calls.length;
}

const results = {
  valid: run('valid-callback', '120133', true),
  wrongChannel: run('wrong-channel', '320023', true),
  notReady: run('callback-not-ready', '120133', false),
  deferred: run('deferred-export', '120133', true, true)
};
if (results.valid !== 1 || results.wrongChannel !== 0 ||
  results.notReady !== 0 || results.deferred !== 1) process.exit(1);
