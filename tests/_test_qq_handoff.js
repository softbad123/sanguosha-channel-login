const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const body = source.indexOf(') {', start) + 2;
  let depth = 0, seen = false;
  for (let index = body; index < source.length; index++) {
    const character = source[index];
    if (character === '{') { depth++; seen = true; }
    else if (character === '}' && seen && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(name + ' is incomplete');
}

function assert(ok, message) { if (!ok) throw new Error(message); }

const PREFIX = 'jnd-wg-qq-';
const TAB_KEY = 'wegame.qq.tab.v1';
const now = Date.now();
const name = PREFIX + 'a'.repeat(32);
const id = 'b'.repeat(32);

function recover({ embedded = true, windowName = '', handoff = null, tabId = '' } = {}) {
  const context = {
    PREFIX, TAB_KEY, EMBEDDED: embedded, Date, Number,
    window: {name: windowName},
    sessionStorage: {getItem: key => key === TAB_KEY ? tabId : null},
    readHandoff: () => handoff
  };
  vm.createContext(context);
  vm.runInContext([extractFunction('isHandoffRouteName'), extractFunction('routedHandoffName')].join('\n') +
    ';this.result = routedHandoffName();', context);
  return context.result;
}

assert(recover({windowName: name}) === name, 'normal window.name handoff was rejected');
assert(recover({handoff: {name, id, expires: now + 10000}}) === name,
  'embedded QQ handoff was not recoverable after window.name was cleared');
assert(recover({embedded: false, handoff: {name, id, expires: now + 10000}, tabId: id}) === name,
  'standalone handoff was not recoverable from the matching tab marker');
assert(recover({embedded: false, handoff: {name, id, expires: now + 10000}, tabId: 'c'.repeat(32)}) === '',
  'a handoff from another tab was accepted');
assert(recover({handoff: {name, id, expires: now - 1}}) === '',
  'an expired handoff was accepted');
assert(recover({windowName: PREFIX + 'not-a-nonce'}) === '',
  'a malformed window.name was accepted');

const qqBlock = /const IS_QQ_BROWSER = \(\(\) => \{[\s\S]*?\}\)\(\);/.exec(source);
assert(qqBlock, 'QQ Browser detection is missing');
const ttlBlock = /const ENTRY_GUARD_TTL = IS_QQ_BROWSER \? (\d+) : (\d+);/.exec(source);
assert(ttlBlock, 'the timed entry guard is missing');

function guardTtl(userAgent) {
  const context = {navigator: {userAgent}};
  vm.createContext(context);
  vm.runInContext(qqBlock[0] + '\n' + 'const ENTRY_GUARD_TTL = IS_QQ_BROWSER ? ' + ttlBlock[1] +
    ' : ' + ttlBlock[2] + '; this.result = ENTRY_GUARD_TTL;', context);
  return context.result;
}

assert(guardTtl('Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36 QQBrowser/22.1.7007.400') === 240000,
  'QQ Browser must retain the no-credential guard for the bounded handoff window');
assert(guardTtl('Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36') === 60000,
  'non-QQ browsers must keep the shorter guard');

assert(source.includes("const LOGIN_PAGE = ORIGIN + '/login/10th_client/index.html';"),
  'fallback must target the 10th-client login page');
assert(!source.includes("location.replace(ORIGIN + '/login/index.html')"),
  'fallback must not send 10th-client players to the classic OL login page');
assert(source.includes('const name = routedHandoffName();'),
  'game handoff must use the recoverable route name');

console.log(JSON.stringify({ok: true, qqGuardMs: 240000, defaultGuardMs: 60000,
  loginPage: 'https://web.sanguosha.com/login/10th_client/index.html'}, null, 2));
