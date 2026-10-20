'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', '三国杀多渠道登录.user.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = source.indexOf('(', start); index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')' && --parameterDepth === 0) { parameterEnd = index; break; }
  }
  if (parameterEnd < 0) throw new Error(name + ' parameters are incomplete');
  const body = source.indexOf('{', parameterEnd);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(name + ' body is incomplete');
}

const officialPattern = /const OFFICIAL_LOGIN_ROUTE_PATTERN = (\/[^\n]+\/);/.exec(main)?.[1];
const gamePattern = /const GAME_ROUTE_PATTERN = (\/[^\n]+\/);/.exec(main)?.[1];
assert(officialPattern && gamePattern, 'login route patterns are missing');

const state = {
  pathname: '/login/10th_client/index.html',
  display: 'block',
  pickerHidden: false,
  hasPicker: true,
  hasEnter: true,
  hasAccount: true,
  collapseCalls: 0,
  logs: []
};
const picker = {
  hidden: false,
  style: {display: 'block'},
  querySelector(selector) { return selector === '.account-box' && state.hasAccount ? {className: 'account-box'} : null; }
};
const sandbox = {
  location: {get pathname() { return state.pathname; }},
  document: {getElementById(id) {
    if (id === 'selectGame') return state.hasPicker ? picker : null;
    if (id === 'goInGameBtn') return state.hasEnter ? {nodeName: 'INPUT'} : null;
    return null;
  }},
  getComputedStyle() { return {display: state.display, visibility: 'visible'}; },
  panelContent: {hidden: false},
  panelCollapseButton: {},
  setLoginPanelCollapsed(collapsed) {
    state.collapseCalls += 1;
    sandbox.panelContent.hidden = !!collapsed;
    return true;
  },
  feedbackLog: {add(level, message, meta) { state.logs.push({level, message, meta}); }},
  diagnosticMeta: extra => ({traceId: 'fb-autocollapse-test', ...extra}),
  reportFeedbackError(error, context) { state.logs.push({level: 'error', message: context?.message || error?.message}); },
  readGameIdentity() { return null; },
  gameIdentityReady() { return false; },
  setTimeout(callback) { sandbox.__scheduled = callback; return 1; },
  clearTimeout() {}
};
vm.createContext(sandbox);

const source = [
  'const OFFICIAL_LOGIN_ROUTE_PATTERN = ' + officialPattern + ';',
  'const GAME_ROUTE_PATTERN = ' + gamePattern + ';',
  'const GAME_LOGIN_WATCH_MS = 100;',
  'let gameLoginAutoCollapsed = false;',
  'let gameLoginWatchTimer = 0;',
  'let gameLoginWatchDeadline = 0;',
  ['isGamePage', 'isOfficialLoginPage', 'officialLoginReady', 'autoCollapseForLogin', 'watchGameLogin']
    .map(name => extractFunction(main, name)).join('\n')
].join('\n');
vm.runInContext(source, sandbox);

assert.strictEqual(sandbox.isOfficialLoginPage(), true);
state.pathname = '/login/x/index';
assert.strictEqual(sandbox.isOfficialLoginPage(), true);
state.pathname = '/login/10th_client/index.html';
assert.strictEqual(sandbox.officialLoginReady(), true);
state.display = 'none';
assert.strictEqual(sandbox.officialLoginReady(), false);
state.display = 'block';
state.hasAccount = false;
assert.strictEqual(sandbox.officialLoginReady(), false);
state.hasAccount = true;

state.collapseCalls = 0;
state.logs.length = 0;
sandbox.panelContent.hidden = false;
assert.strictEqual(sandbox.autoCollapseForLogin('官服已登录，折叠面板。', 'official_login'), true);
assert.strictEqual(state.collapseCalls, 1);
assert.strictEqual(state.logs.filter(item => item.level === 'success').length, 1);
assert.strictEqual(sandbox.autoCollapseForLogin('重复通知不应再次折叠。', 'official_login'), false);
assert.strictEqual(state.collapseCalls, 1);

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
state.logs.length = 0;
sandbox.panelContent.hidden = true;
assert.strictEqual(sandbox.autoCollapseForLogin('面板已经收起。', 'official_login'), true);
assert.strictEqual(state.collapseCalls, 1);
assert.strictEqual(state.logs.length, 0);

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
state.logs.length = 0;
sandbox.panelContent.hidden = false;
sandbox.watchGameLogin();
assert.strictEqual(typeof sandbox.__scheduled, 'function', 'official login watcher did not schedule a probe');
sandbox.__scheduled();
assert.strictEqual(state.collapseCalls, 1, 'official login watcher did not collapse the panel');
assert.strictEqual(vm.runInContext('gameLoginAutoCollapsed', sandbox), true);
sandbox.watchGameLogin();
assert.strictEqual(state.collapseCalls, 1, 'official login watcher collapsed more than once');

console.log(JSON.stringify({ok: true, collapseCalls: state.collapseCalls,
  officialLog: state.logs.map(item => item.message)}, null, 2));
