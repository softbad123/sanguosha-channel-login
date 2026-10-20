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

function contextFor(extra = {}) {
  const context = {
    Object, String, Number, Date, Set, URLSearchParams,
    boundClientToken: '',
    assert(ok, code, stage) {
      if (!ok) {
        const error = new Error(code);
        error.stage = stage;
        throw error;
      }
    },
    ...extra
  };
  vm.createContext(context);
  return context;
}

const now = Date.now();
const official = {
  ticket: 'server-ticket',
  sign: 'server-sign',
  account: 'server-account',
  token: 'server-token',
  open_id: 'server-open-id',
  timestamp: String(now),
  channel_id: '320056',
  server_id: 'server-1',
  username: 'display-name',
  channel_account: 'channel-account',
  back_id: 'back-id',
  isAutoLogin: true,
  user_type: 3,
  future_scalar: 'kept'
};

const grantContext = contextFor();
vm.runInContext([extractFunction('fields'), extractFunction('validateGrant')].join('\n') +
  '\nthis.__grant = validateGrant(' + JSON.stringify(official) + ');', grantContext);
const grant = grantContext.__grant;
for (const key of Object.keys(official)) {
  if (key === 'timestamp') continue;
  if (key === 'channel_id') {
    if (String(grant.channel_id) !== official.channel_id) throw new Error('channel_id was not preserved');
    continue;
  }
  if (grant[key] !== official[key]) throw new Error(key + ' was not preserved');
}
if (Number(grant.timestamp) !== now) throw new Error('timestamp was not normalized');

const hostile = JSON.parse('{"account":"a","token":"t","sign":"s","timestamp":1,"__proto__":{"polluted":true},"constructor":"bad","nested":{"x":1}}');
const hostileContext = contextFor();
vm.runInContext([extractFunction('fields'), extractFunction('validateGrant')].join('\n') +
  '\nthis.__grant = validateGrant(this.__value);', Object.assign(hostileContext, {__value: hostile}));
if (Object.prototype.polluted || Object.hasOwn(hostileContext.__grant, '__proto__') ||
    Object.hasOwn(hostileContext.__grant, 'constructor') || Object.hasOwn(hostileContext.__grant, 'nested')) {
  throw new Error('unsafe grant fields were retained');
}

function deliveryCase({ exportAt = 0, entryAt = -1, tickAfter = true }) {
  let tick;
  const calls = [];
  const events = [];
  const accountInfo = {Self: {Token: '', Ticket: ''}};
  const game = {
    parseConfiged: true,
    preloaded: true,
    loadingView: {},
    EnterLoginScene() {},
    platformLoginBack(value) {
      calls.push(value);
      accountInfo.Self.Token = value?.data?.token || 'T';
      this.EnterLoginScene(true);
    }
  };
  const page = {ReqObj: {channel_id: 320056}, Laya: {Browser: {window: {fontLoaded: true}}},
    AccountInfo: accountInfo, GameContext: {GotoLogout() {}}};
  page.__SGS_DIRECT_EVENT__ = event => events.push(event);
  const context = contextFor({
    EMBEDDED: true,
    SESSION_KEY: 'saved',
    page,
    location: {pathname: '/10/pc/index.php', search: '?channel_id=320056'},
    GM_getValue: () => null,
    savedSession: () => null,
    handoffToast: () => {},
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => {},
    console: {info: () => {}, error: () => {}},
    window: {addEventListener: () => {}}
  });
  vm.runInContext([
    extractFunction('gameAuthFields'), extractFunction('emitGameAuth'),
    extractFunction('entryRequiresFont'), extractFunction('loginReadiness'),
    extractFunction('gameReadiness'), extractFunction('installGameRequest'),
    extractFunction('callPlatformLoginBack'), extractFunction('deliverGameGrant'),
    extractFunction('deliverPlatformGrant')
  ].join('\n') + '\n(deliverPlatformGrant)("vivo", 320056, this.__grant, this.__savedId);',
  Object.assign(context, {
    __grant: {account: 'A', token: 'T', sign: 'S', timestamp: now},
    __savedId: 'a'.repeat(32)
  }));
  if (exportAt === 0) page.Sgs = game;
  if (entryAt === 0) game.EnterLoginScene();
  if (tickAfter && tick) tick();
  if (exportAt > 0) page.Sgs = game;
  if (entryAt > 0) game.EnterLoginScene();
  if (tickAfter && tick) tick();
  return {calls, events, tick, game, page};
}

const noEntry = deliveryCase({});
if (noEntry.calls.length !== 1) throw new Error('ready game did not deliver without an entry observation');
if (noEntry.calls[0].data.account !== 'A' || noEntry.calls[0].data.channel_id !== 320056) {
  throw new Error('delivery payload was incorrect');
}
if (noEntry.events.filter(event => event.type === 'game-auth').length !== 1) {
  throw new Error('delivery was not reported exactly once');
}

const deferred = deliveryCase({ exportAt: 1, entryAt: -1 });
if (deferred.calls.length !== 1) throw new Error('late export did not deliver');

const singleEntry = deliveryCase({ exportAt: 0, entryAt: 0 });
if (singleEntry.calls.length !== 1) throw new Error('single entry caused duplicate or missing delivery');

console.log(JSON.stringify({
  fields: Object.keys(grant),
  noEntry: noEntry.calls.length,
  deferred: deferred.calls.length,
  singleEntry: singleEntry.calls.length
}, null, 2));
