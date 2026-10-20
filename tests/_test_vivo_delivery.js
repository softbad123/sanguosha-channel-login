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
  extractFunction('deliverPlatformGrant')].join('\n');

function run(name, provider, channelId, routeChannel, callback, deferredExport = false, secondEntry = false,
  fontLoaded = true, checkLoaded = undefined, parseConfiged = true, preloaded = true, options = {}) {
  if (fontLoaded === 'UNSET') fontLoaded = undefined;
  const calls = [];
  const logs = [];
  const events = [];
  const accountInfo = {Self: {Token: '', Ticket: ''}};
  const checkState = {value: checkLoaded};
  const game = {
    parseConfiged,
    preloaded,
    loadingView: options.loadingView ? {} : undefined,
    EnterLoginScene() {
      logs.push(['original-entry']);
      if (!accountInfo.Self.Token && !accountInfo.Self.Ticket) page.GameContext.GotoLogout();
    },
    platformLoginBack(value) {
      calls.push(value);
      accountInfo.Self.Token = value?.data?.token || 'T';
      this.EnterLoginScene(true);
    }
  };
  if (checkLoaded !== undefined) game.CheckLoaded = () => checkState.value;
  const page = {ReqObj: {channel_id: channelId},
    Laya: {Browser: {window: {fontLoaded}}}, AccountInfo: accountInfo,
    GameContext: {GotoLogout() { logs.push(['logout']); }}};
  page.__SGS_DIRECT_EVENT__ = event => events.push(event);
  if (callback && !deferredExport) page.Sgs = game;
  const context = {
    EMBEDDED: true, SESSION_KEY: 'saved', page,
    GAME_HANDOFF_TIMEOUT: 240000, ENTRY_GUARD_TTL: 60000,
    boundClientToken: '',
    location: {pathname: '/10/pc/index.php',
      search: typeof routeChannel === 'string' ? routeChannel : '?channel_id=' + routeChannel},
    URLSearchParams, Date, String, Number, Object, Set,
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
  try {
    vm.runInContext(fn + '\n(deliverPlatformGrant)(provider, channel, grant, savedId);', Object.assign(context, {
      provider, channel: channelId,
      grant: {account: 'A', token: 'T', sign: 'S', timestamp: Date.now()},
      savedId: 'a'.repeat(32)
    }));
  } catch (error) {
    logs.push(['rejected', error.message]);
  }
  if (deferredExport) page.Sgs = game;
  for (const step of options.entrySteps || []) {
    if (Object.hasOwn(step, 'checkLoaded')) checkState.value = step.checkLoaded;
    if (step.entry) game.EnterLoginScene();
  }
  console.log(JSON.stringify({name, calls: calls.length, code: calls[0]?.code,
    channel: calls[0]?.data?.channel_id, account: calls[0]?.data?.account,
    pageChannel: page.channel_id, reqChannel: page.ReqObj?.channel_id,
    authEvents: events.filter(item => item.type === 'game-auth').length,
    entries: logs.filter(item => item[0] === 'original-entry').length,
    log: logs.map(args => args[1])}));
  return {calls: calls.length, channel: calls[0]?.data?.channel_id,
    entries: logs.filter(item => item[0] === 'original-entry').length,
    fontLoaded,
    authEvents: events.filter(item => item.type === 'game-auth' && item.success === true).length,
    game};
}

const results = {
  vivo: run('vivo-callback', 'vivo', 320056, 320056, true),
  huawei: run('huawei-callback', 'huawei', 320459, 320459, true),
  oppo: run('oppo-callback', 'oppo', 320123, 320123, true),
  wrongChannel: run('wrong-channel', 'vivo', 320056, 320023, true),
  duplicateChannel: run('duplicate-channel', 'vivo', 320056, '?channel_id=320056&channel_id=320056', true),
  notReady: run('callback-not-ready', 'vivo', 320056, 320056, false),
  fontStale: run('callback-font-stale-current-game', 'vivo', 320056, 320056, true, false, false, false),
  fontUndefined: run('callback-font-undefined', 'vivo', 320056, 320056, true, false, false, 'UNSET'),
  checkLoadedPending: run('callback-checkloaded-pending', 'vivo', 320056, 320056, true, false, false, true, false),
  checkLoadedReady: run('callback-checkloaded-ready', 'vivo', 320056, 320056, true, false, false, false, true),
  gatedCurrent: run('callback-waits-for-game-entry', 'vivo', 320056, 320056, true, false, false, false,
    undefined, true, true, {loadingView: true, entrySteps: [{entry: true}]}),
  gatedOld: run('callback-old-game-waits-checkloaded', 'vivo', 320056, 320056, true, false, false, false,
    false, true, true, {loadingView: true,
      entrySteps: [{entry: true}, {checkLoaded: true}, {entry: true}]}),
  parsePending: run('callback-parse-pending', 'vivo', 320056, 320056, true, false, false, true, undefined, false, true),
  preloadPending: run('callback-preload-pending', 'vivo', 320056, 320056, true, false, false, true, undefined, true, false),
  deferred: run('deferred-export', 'vivo', 320056, 320056, true, true),
  reentrant: run('callback-reenters-entry', 'vivo', 320056, 320056, true, false, true)
};
const ok = results.vivo.calls === 1 && results.vivo.channel === 320056 &&
  results.vivo.authEvents === 1 &&
  results.huawei.calls === 1 && results.huawei.channel === 320459 &&
  results.oppo.calls === 1 && results.oppo.channel === 320123 &&
  results.wrongChannel.calls === 0 && results.duplicateChannel.calls === 0 && results.notReady.calls === 0 &&
  results.fontStale.calls === 1 &&
  results.fontUndefined.calls === 1 && results.fontUndefined.authEvents === 1 && !results.fontUndefined.fontLoaded &&
  results.checkLoadedPending.calls === 0 && results.checkLoadedReady.calls === 1 &&
  results.gatedCurrent.calls === 1 && results.gatedCurrent.entries === 2 &&
  results.gatedOld.calls === 1 && results.gatedOld.entries === 1 &&
  results.parsePending.calls === 0 && results.preloadPending.calls === 0 &&
  results.deferred.calls === 1 && results.deferred.channel === 320056 &&
  results.reentrant.calls === 1 && results.reentrant.entries === 1;
if (!ok) process.exit(1);
