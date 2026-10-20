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

const functions = [
  'gameAuthFields', 'emitGameAuth', 'entryRequiresFont', 'loginReadiness',
  'gameReadiness', 'installGameRequest', 'callPlatformLoginBack',
  'deliverGameGrant', 'deliverPlatformGrant'
].map(extractFunction).join('\n');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeHarness({ provider = 'vivo', channel = 320056, path = '/10/pc/index.php',
  search = '?channel_id=320056', exportAt = 0, parseConfiged = true, preloaded = true,
  callbackReenters = true, callbackArgs = [true], entryBeforeReady = false,
  callbackSetsCredential = true, platformIdOnly = false } = {}) {
  const calls = [];
  const entries = [];
  const events = [];
  const logouts = [];
  let handoff = 0;
  const accountInfo = {Self: platformIdOnly
    ? {PlatformID: '326', Token: '', Ticket: '', WeGameTicket: ''}
    : {Token: '', Ticket: ''}};
  const gameContext = {
    GotoLogout() { logouts.push(Date.now()); }
  };
  const game = {
    parseConfiged,
    preloaded,
    loadingView: {},
    EnterLoginScene(...args) {
      entries.push(args);
      if (!accountInfo.Self.Token && !accountInfo.Self.Ticket) gameContext.GotoLogout();
    },
    platformLoginBack(payload) {
      calls.push(payload);
      if (callbackSetsCredential) accountInfo.Self.Token = payload?.data?.token || 'T';
      if (callbackReenters) this.EnterLoginScene(...callbackArgs);
    }
  };
  const page = {ReqObj: {channel_id: channel}, AccountInfo: accountInfo, GameContext: gameContext};
  page.__SGS_DIRECT_EVENT__ = event => events.push(event);
  if (exportAt === 0) page.Sgs = game;
  let tick = null;
  const context = {
    EMBEDDED: true, SESSION_KEY: 'saved', page,
    GAME_HANDOFF_TIMEOUT: 240000, ENTRY_GUARD_TTL: 60000,
    boundClientToken: '',
    provider, channel, grant: {account: 'A', token: 'T', sign: 'S', timestamp: Date.now()},
    savedId: 'a'.repeat(32),
    location: {pathname: path, search},
    URLSearchParams, Date, String, Number, Object, Set, Math, JSON,
    console: {info: () => {}, error: () => {}},
    handoffToast: () => {},
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => { tick = null; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    window: {addEventListener: () => {}},
    savedSession: () => null,
    assert: (ok, code, stage) => {
      if (!ok) { const error = new Error(code); error.stage = stage; throw error; }
    }
  };
  vm.createContext(context);
  const handoffFinish = () => { handoff += 1; };
  context.__finishHandoff = handoffFinish;
  vm.runInContext(functions + '\n(deliverPlatformGrant)(provider, channel, grant, savedId, provider, this.__finishHandoff);',
    context);
  return {game, page, calls, entries, events, logouts, context,
    tick: () => { if (!tick) throw new Error('timer missing'); tick(); },
    tickInstalled: () => !!tick,
    handoff: () => handoff};
}

function assert(ok, message) { if (!ok) throw new Error(message); }

(async () => {
  const normal = makeHarness();
  assert(normal.calls.length === 1, 'ready grant did not reach platformLoginBack exactly once');
  assert(normal.entries.length === 1 && normal.entries[0][0] === true,
    'official callback did not enter the authenticated scene');
  assert(normal.events.filter(event => event.type === 'game-auth' && event.success === true).length === 1,
    'success event was not emitted once');
  assert(normal.handoff() === 1, 'handoff was not consumed once after successful entry');
  assert(normal.logouts.length === 0, 'authenticated entry unexpectedly logged out');

  const deferredEntry = makeHarness({entryBeforeReady: true, parseConfiged: false});
  assert(deferredEntry.calls.length === 0, 'grant was delivered before game readiness');
  deferredEntry.game.parseConfiged = true;
  deferredEntry.game.EnterLoginScene();
  assert(deferredEntry.calls.length === 1, 'early normal entry was not converted into platform delivery');
  assert(deferredEntry.entries.length === 1 && deferredEntry.entries[0][0] === true,
    'normal entry was allowed to run unauthenticated');
  assert(deferredEntry.logouts.length === 0, 'early entry escaped the logout guard');

  const noReentry = makeHarness({parseConfiged: true, callbackReenters: false});
  assert(noReentry.calls.length === 1, 'platform callback was not called');
  await sleep(380);
  noReentry.tick();
  await sleep(20);
  assert(noReentry.entries.length === 1 && noReentry.entries[0][0] === true,
    'fallback did not enter the authenticated scene');
  assert(noReentry.logouts.length === 0, 'fallback entry logged out');

  const implicitCallback = makeHarness({callbackArgs: [undefined]});
  assert(implicitCallback.entries.length === 1 && implicitCallback.entries[0][0] === true,
    'implicit callback entry was not normalized to the authenticated form');
  assert(implicitCallback.logouts.length === 0, 'implicit callback entry logged out');

  const lateExport = makeHarness({exportAt: 1, callbackReenters: true});
  assert(lateExport.calls.length === 0, 'late export was delivered too early');
  // Simulate a resource callback that reached GotoLogout before Sgs was
  // exported. The handoff must suppress that one unauthenticated redirect,
  // then deliver the grant when the real export appears.
  lateExport.page.GameContext.GotoLogout();
  assert(lateExport.logouts.length === 0, 'pre-export GotoLogout escaped the handoff guard');
  lateExport.game.parseConfiged = true;
  lateExport.page.Sgs = lateExport.game;
  assert(lateExport.calls.length === 1, 'late export did not bind and deliver');
  assert(lateExport.logouts.length === 0, 'late export logged out after delivery');

  const replaced = makeHarness({parseConfiged: false, callbackReenters: true});
  const replacement = {
    parseConfiged: true, preloaded: true, loadingView: {},
    EnterLoginScene(...args) { replaced.entries.push(args); },
    platformLoginBack(payload) {
      replaced.calls.push(payload);
      replaced.page.AccountInfo.Self.Token = payload?.data?.token || 'T';
      this.EnterLoginScene(true);
    }
  };
  replaced.page.Sgs = replacement;
  replaced.tick();
  assert(replaced.calls.length === 1, 'replacement game did not receive the grant');
  assert(replaced.entries.length === 1 && replaced.entries[0][0] === true,
    'replacement game did not enter the authenticated scene');
  assert(replaced.logouts.length === 0, 'replacement game escaped the logout guard');

  const noQuery = makeHarness({search: ''});
  assert(noQuery.calls.length === 1, 'queryless redirect was rejected');

  const noCredential = makeHarness({callbackSetsCredential: false});
  assert(noCredential.calls.length === 1 && noCredential.entries.length === 0,
    'entry must wait for AccountInfo credentials');
  assert(noCredential.logouts.length === 0, 'missing AccountInfo credential was allowed to log out');

  // Official EnterLoginScene accepts Token/Ticket/WeGameTicket only. A bare
  // PlatformID from the WeGame shell is not an authenticated web credential;
  // treating it as one lets GotoLogout escape and reproduces the loading-page
  // bounce. A late credential write must still be able to enter afterwards.
  const platformIdOnly = makeHarness({callbackSetsCredential: false, platformIdOnly: true});
  assert(platformIdOnly.calls.length === 1, 'PlatformID-only harness did not receive the grant');
  assert(platformIdOnly.entries.length === 0,
    'PlatformID alone was treated as a complete game credential');
  assert(platformIdOnly.logouts.length === 0,
    'PlatformID alone allowed the unauthenticated GotoLogout path');
  platformIdOnly.page.AccountInfo.Self.Token = 'late-token';
  platformIdOnly.game.EnterLoginScene(true);
  assert(platformIdOnly.entries.length === 1 && platformIdOnly.entries[0][0] === true,
    'late real credential did not allow the authenticated entry');
  assert(platformIdOnly.logouts.length === 0, 'late real credential still logged out');

  let rejected = 0;
  try { makeHarness({search: '?channel_id=320023'}); } catch (_) { rejected += 1; }
  try { makeHarness({search: '?channel_id=320056&channel_id=320056'}); } catch (_) { rejected += 1; }
  assert(rejected === 2, 'unsafe channel query variants were accepted');

  console.log(JSON.stringify({
    normalCalls: normal.calls.length, normalEntries: normal.entries.length,
    earlyEntryCalls: deferredEntry.calls.length, fallbackEntries: noReentry.entries.length,
    lateExportCalls: lateExport.calls.length, replacementCalls: replaced.calls.length,
    querylessCalls: noQuery.calls.length, rejectedQueries: rejected,
    platformIdEntries: platformIdOnly.entries.length, platformIdLogouts: platformIdOnly.logouts.length
  }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
