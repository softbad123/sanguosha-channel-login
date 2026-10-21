'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const engine = fs.readFileSync(path.join(__dirname, '..', '_direct_engine.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(name + ' is incomplete');
}

function installOn(page, extra = {}) {
  const context = {page, Object, String, RegExp, ...extra};
  vm.createContext(context);
  vm.runInContext(extractFunction(engine, 'installGameIdentityProbe') +
    '\nthis.install = installGameIdentityProbe;', context);
  return context.install();
}

function runGameBundle(source, extra = {}) {
  const events = [];
  const intervals = [];
  const timeouts = [];
  const sandbox = {
    console,
    __SGS_DIRECT_PROVIDER__: 'vivo',
    __SGS_DIRECT_EVENT__: event => events.push(event),
    setInterval(callback) { intervals.push(callback); return 1; },
    setTimeout(callback) { timeouts.push(callback); return 2; },
    clearInterval() {},
    clearTimeout() {},
    ...extra
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  for (const callback of timeouts.splice(0)) callback();
  for (const callback of intervals) callback();
  return {events, intervals, sandbox};
}

const page = {};
assert.strictEqual(installOn(page), true, 'probe hook was not installed');
assert.strictEqual(typeof page.scriptContent, 'function', 'game loader hook is missing');

// The live bundle keeps these classes inside the Sgs IIFE. A probe appended
// after the bundle cannot resolve them, even though it is valid JavaScript.
const gameSource = [
  'var Sgs=function(){"use strict";',
  'class UserBaseData {}',
  'class AccountInfo{constructor(){this.SeverID="";this.Account="";this.ChannelAccount=""}static get Self(){return AccountInfo.self}static set Self(value){AccountInfo.self=value}}',
  'class UserData extends UserBaseData{static get Self(){return UserData.self}static set Self(value){UserData.self=value}}',
  'AccountInfo.Self={SeverID:"320056",Account:"vivo-login",ChannelAccount:"channel-7"};',
  'UserData.Self={UserBrief:{userID:123456,nickname:"测试角色"}};',
  'window.__GAME_BUNDLE__={AccountInfo:AccountInfo,UserData:UserData};',
  'return window.__GAME_BUNDLE__;',
  '}();'
].join('\n');
const wrapped = page.scriptContent('main.min.js', gameSource);
const closureAt = wrapped.indexOf('var Sgs=function(){');
const accountAt = wrapped.indexOf('class AccountInfo{');
const probeAt = wrapped.indexOf('__SGS_GAME_IDENTITY_PROBE__');
assert(wrapped.startsWith('var Sgs=function(){'), 'game source was not preserved');
assert(closureAt >= 0 && accountAt > closureAt, 'test bundle is not shaped like the live bundle');
assert(probeAt > closureAt && probeAt < accountAt,
  'identity probe was not inserted inside the Sgs closure before AccountInfo');

const first = runGameBundle(wrapped);
assert.strictEqual(first.events.length, 1, 'identity event was not emitted');
assert.strictEqual(
  JSON.stringify(first.events[0]),
  JSON.stringify(
  {
    type: 'game-identity',
    serverId: '320056',
    roleId: '123456',
    roleName: '测试角色',
    loginAccount: 'vivo-login',
    channelAccount: 'channel-7',
    provider: 'vivo'
  }),
  'identity fields were mapped incorrectly'
);
assert.strictEqual(first.sandbox.__SGS_GAME_IDENTITY_LAST__.roleId, '123456',
  'identity was not cached for late consumers');

for (const callback of first.intervals) callback();
assert.strictEqual(first.events.length, 1, 'unchanged identity emitted repeatedly');

vm.runInContext('this.__GAME_BUNDLE__.UserData.Self.UserBrief.nickname = "改名角色";', first.sandbox);
for (const callback of first.intervals) callback();
assert.strictEqual(first.events.length, 2, 'identity changes were not reported');
assert.strictEqual(first.events[1].roleName, '改名角色');

// A later partial class read (for example, only the server id becoming visible)
// must not erase the complete role identity cached by CRespLogin/UserData.
vm.runInContext('this.__GAME_BUNDLE__.AccountInfo.Self = {SeverID:"320057"};' +
  'this.__GAME_BUNDLE__.UserData.Self = {UserBrief:{}};', first.sandbox);
const partialRead = first.sandbox.__SGS_GAME_IDENTITY_READ__();
assert.strictEqual(partialRead.roleId, '123456', 'partial class read erased cached role id');
assert.strictEqual(partialRead.roleName, '改名角色', 'partial class read erased cached role name');
assert.strictEqual(partialRead.serverId, '320057', 'partial class read did not merge the new server id');

assert.strictEqual(page.scriptContent('vendor.js', 'console.log(1);'), 'console.log(1);',
  'probe modified a non-main script');
assert.strictEqual(page.scriptContent('main.min.js', wrapped), wrapped,
  'probe was appended more than once');
assert.strictEqual(page.scriptContent('main.min.js', 'var game = 1;'), 'var game = 1;',
  'probe was inserted into a bundle without a known closure');

let delegated = false;
const chainedPage = {
  scriptContent(name, source) {
    delegated = true;
    return source + '\n/* old bridge */';
  }
};
assert.strictEqual(installOn(chainedPage), true);
const chained = chainedPage.scriptContent('main.min.js', gameSource);
const chainedProbeAt = chained.indexOf('__SGS_GAME_IDENTITY_PROBE__');
assert(delegated && chained.includes('/* old bridge */') && chainedProbeAt >= 0 &&
  chainedProbeAt < chained.indexOf('class AccountInfo{'),
  'existing scriptContent wrapper was not preserved or probe was inserted outside the closure');

const fallbackSource = 'var Sgs=function(){"use strict";class Role{static get Self(){return null}}return Role;}();';
const fallback = page.scriptContent('main.min.js', fallbackSource);
const fallbackProbeAt = fallback.indexOf('__SGS_GAME_IDENTITY_PROBE__');
assert(fallbackProbeAt > fallback.indexOf('"use strict";') && fallbackProbeAt < fallback.indexOf('class Role{'),
  'fallback probe was not inserted inside the Sgs closure');

const injectedScripts = [];
const fakeHead = {
  appendChild(node) { injectedScripts.push(node); node.parentNode = fakeHead; },
  removeChild(node) { node.parentNode = null; }
};
const fakeDocument = {
  head: fakeHead,
  documentElement: fakeHead,
  readyState: 'loading',
  createElement() { return {textContent: '', parentNode: null, setAttribute() {}}; },
  addEventListener() {}
};
const injectedPage = {document: fakeDocument};
assert.strictEqual(installOn(injectedPage, {document: fakeDocument}), true,
  'game identity hook could not be installed with a page document present');
assert.strictEqual(injectedScripts.length, 0,
  'a global page probe must not be injected because it cannot see the Sgs closure');
const injected = runGameBundle(injectedPage.scriptContent('main.min.js', gameSource));
assert.strictEqual(injected.events.length, 1, 'scriptContent hook did not emit identity data');
assert.strictEqual(injected.events[0].roleId, '123456');

// The public web build does not define scriptContent at all. Its loader creates
// an inline script and assigns the bundle through the script element's .text.
function FakeHTMLScriptElement() {}
Object.defineProperty(FakeHTMLScriptElement.prototype, 'text', {
  configurable: true,
  get() { return this._text || ''; },
  set(value) { this._text = String(value); }
});
const webDocument = {
  createElement(tagName) {
    const element = Object.create(FakeHTMLScriptElement.prototype);
    element.tagName = String(tagName).toUpperCase();
    element.setAttribute = () => {};
    return element;
  }
};
const webPage = {document: webDocument, HTMLScriptElement: FakeHTMLScriptElement};
assert.strictEqual(installOn(webPage, {document: webDocument}), true,
  'web loader script-element hook could not be installed');
const webScript = webPage.document.createElement('script');
webScript.text = gameSource;
const webProbeAt = webScript.text.indexOf('__SGS_GAME_IDENTITY_PROBE__');
assert(webProbeAt > webScript.text.indexOf('var Sgs=function(){') &&
  webProbeAt < webScript.text.indexOf('class AccountInfo{'),
  'web loader .text assignment did not inject the probe inside the Sgs closure');
const web = runGameBundle(webScript.text);
assert.strictEqual(web.events.length, 1, 'web loader path did not emit identity data');
assert.strictEqual(web.events[0].roleName, '测试角色');

// Protocol events are the earliest authoritative source. CRespLogin carries
// userID before UserData.Self is assigned, and the wrapper must remain
// transparent to the official WBMgr.event implementation.
const protocolEvents = [];
let protocolCalls = 0;
class FakeWBMgr {
  static GetInstance() {
    if (!FakeWBMgr.instance) FakeWBMgr.instance = new FakeWBMgr();
    return FakeWBMgr.instance;
  }
  event(...args) { protocolCalls += 1; this.last = args; }
}
const protocol = runGameBundle(wrapped, {
  WBMgr: FakeWBMgr,
  __SGS_DIRECT_EVENT__: event => protocolEvents.push(event)
});
assert.strictEqual(protocol.sandbox.__SGS_GAME_IDENTITY_PROTOCOL_HOOK__, true,
  'WBMgr protocol hook was not installed');
const manager = FakeWBMgr.GetInstance();
manager.event('cmsg.CRespLogin', [{
  Protocol: {ProtoVO: {protoData: {
    userID: 654321,
    user: {nickname: '去女澡堂呐喊', extend: {account: 'vivo-login'}}
  }}}
}, false]);
assert.strictEqual(protocolCalls, 1, 'original WBMgr.event was not called');
assert.strictEqual(protocol.sandbox.__SGS_GAME_IDENTITY_LAST__.roleId, '654321');
assert.strictEqual(protocol.sandbox.__SGS_GAME_IDENTITY_LAST__.roleName, '去女澡堂呐喊');
assert.strictEqual(protocol.sandbox.__SGS_GAME_IDENTITY_LAST__.loginAccount, 'vivo-login');
assert.strictEqual(protocolEvents.at(-1).roleId, '654321', 'CRespLogin identity was not emitted');

manager.event('cmsg.CNotifyUserData', [{
  Protocol: {userID: 777777, UserInfo: {nickname: '协议角色', account: 'protocol-account'},
    ProtoData: {SeverID: '320056', ChannelAccount: 'channel-9'}}
}, false]);
assert.strictEqual(protocolEvents.at(-1).roleId, '777777');
assert.strictEqual(protocolEvents.at(-1).roleName, '协议角色');
assert.strictEqual(protocolEvents.at(-1).loginAccount, 'protocol-account');
assert.strictEqual(protocolEvents.at(-1).channelAccount, 'channel-9');

manager.event('cmsg.CNotifyUserData', [{
  Protocol: {UserInfo: {SeverID: '320058'}}
}, false]);
assert.strictEqual(protocolEvents.at(-1).roleId, '777777',
  'server-only protocol event erased the cached role id');
assert.strictEqual(protocolEvents.at(-1).roleName, '协议角色');
assert.strictEqual(protocolEvents.at(-1).serverId, '320058');
assert.strictEqual(protocolCalls, 3, 'protocol wrapper did not forward every event');

// A second path does not depend on source rewriting: the initial user-data
// protocol already carries the role id and nickname.
const notifyEvents = [];
class FakeGameMain { notifyUserData(event) { this.received = event; } }
const notifyPage = {
  Sgs: FakeGameMain,
  __SGS_DIRECT_PROVIDER__: 'vivo',
  __SGS_DIRECT_EVENT__: event => notifyEvents.push(event),
  __SGS_GAME_IDENTITY_LAST__: {
    serverId: '320056', loginAccount: 'vivo-login', channelAccount: 'channel-7'
  }
};
assert.strictEqual(installOn(notifyPage), true, 'notify hook could not be installed');
const notifyContext = {};
notifyPage.Sgs.prototype.notifyUserData.call(notifyContext, {
  Protocol: {userData: {user: {userID: 654321, nickname: '去女澡堂呐喊'}}}
});
assert.strictEqual(notifyEvents.length, 1, 'notifyUserData identity was not emitted');
assert.strictEqual(notifyEvents[0].roleId, '654321');
assert.strictEqual(notifyEvents[0].roleName, '去女澡堂呐喊');
assert.strictEqual(notifyEvents[0].serverId, '320056');
assert.strictEqual(notifyContext.received?.Protocol?.userData?.user?.nickname, '去女澡堂呐喊',
  'original notifyUserData was not called');

console.log(JSON.stringify({ok: true, events: first.events.length, injected: injected.events.length, chained: true,
  fallback: true, webLoader: web.events.length, notify: notifyEvents.length,
  protocol: protocolEvents.length}, null, 2));
