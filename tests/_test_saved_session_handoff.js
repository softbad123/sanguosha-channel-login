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
  'sessionText', 'copiedFields', 'sessionStoreRecord', 'gameAuthFields', 'emitGameAuth',
  'entryRequiresFont', 'loginReadiness', 'gameReadiness', 'installGameRequest',
  'callPlatformLoginBack', 'deliverGameGrant'
].map(extractFunction).join('\n');

function makeHarness() {
  const calls = [], entries = [], events = [];
  const accountInfo = {Self: {Token: '', Ticket: ''}};
  const game = {
    parseConfiged: true,
    preloaded: true,
    loadingView: {},
    EnterLoginScene(...args) {
      entries.push(args);
      if (!accountInfo.Self.Token && !accountInfo.Self.Ticket) throw new Error('unauthenticated entry');
    },
    platformLoginBack(payload) {
      calls.push(payload);
      accountInfo.Self.Token = payload.data.token;
      this.EnterLoginScene(true);
    }
  };
  const page = {ReqObj: {channel_id: 320056}, AccountInfo: accountInfo};
  page.__SGS_DIRECT_EVENT__ = event => events.push(event);
  page.Sgs = game;
  const savedId = 'a'.repeat(32);
  const context = {
    EMBEDDED: true,
    SESSION_PROVIDERS: new Set(['vivo']),
    SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
    SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER,
    boundClientToken: '',
    page, savedId,
    location: {pathname: '/10/pc/index.php', search: '?channel_id=320056'},
    URLSearchParams, Date, String, Number, Object, Math, JSON,
    console: {info: () => {}, error: () => {}},
    handoffToast: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    window: {addEventListener: () => {}},
    savedSession: () => null,
    assert: (ok, code, stage) => {
      if (!ok) { const error = new Error(code); error.stage = stage; throw error; }
    }
  };
  vm.createContext(context);
  vm.runInContext(functions, context);
  const raw = {v: 3, provider: 'vivo', profileId: 'profile-1', id: savedId,
    created: Date.now() - 1000, updated: Date.now(), account: 'A', session: 'restorable',
    vivo: {uid: 'u', session: 's', username: 'name'}};
  context.rawSavedRecord = raw;
  const saved = vm.runInContext('sessionStoreRecord(rawSavedRecord)', context);
  context.savedSession = () => saved;
  vm.runInContext('(deliverGameGrant)("vivo", "Vivo", 320056, this.grant, this.savedId, "vivo", () => {})',
    Object.assign(context, {grant: {account: 'A', token: 'T', sign: 'S', timestamp: Date.now()}}));
  return {saved, calls, entries, events};
}

function assert(ok, message) { if (!ok) throw new Error(message); }

const result = makeHarness();
assert(result.saved && result.saved.expires > Date.now(),
  'normalized saved session lost its handoff expiry');
assert(result.calls.length === 1, 'saved session did not reach platformLoginBack');
assert(result.entries.length === 1 && result.entries[0][0] === true,
  'saved session did not enter the authenticated scene');
assert(result.events.some(event => event.type === 'game-auth' && event.success === true),
  'saved session handoff did not emit a success event');

console.log(JSON.stringify({expires: result.saved.expires, calls: result.calls.length,
  entries: result.entries.length, success: true}, null, 2));
