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
const sessionValues = new Map();
const gmValues = new Map([['sgs-login-page-auto-expand-v1', true]]);
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
    sessionValues.set('sgs-panel-collapsed-v1', collapsed ? '1' : '0');
    return true;
  },
  feedbackLog: {add(level, message, meta) { state.logs.push({level, message, meta}); }},
  diagnosticMeta: extra => ({traceId: 'fb-autocollapse-test', ...extra}),
  reportFeedbackError(error, context) { state.logs.push({level: 'error', message: context?.message || error?.message}); },
  sessionStorage: {
    getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
    removeItem(key) { sessionValues.delete(key); }
  },
  GM_getValue(key, fallback) { return gmValues.has(key) ? gmValues.get(key) : fallback; },
  GM_setValue(key, value) { gmValues.set(key, value); },
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
  "const SESSION_LOGIN_KEY = 'sgs-tab-login-success-v1';",
  "const PANEL_COLLAPSED_KEY = 'sgs-panel-collapsed-v1';",
  "const LOGIN_PAGE_AUTO_EXPAND_KEY = 'sgs-login-page-auto-expand-v1';",
  'let gameLoginAutoCollapsed = false;',
  'let gameLoginWatchTimer = 0;',
  'let gameLoginWatchDeadline = 0;',
  'let loginPageAutoExpand = true;',
  ['isGamePage', 'isOfficialLoginPage', 'officialLoginReady', 'markGameLoginSession',
    'clearGameLoginSession', 'gameLoginSessionMarked', 'savedPanelCollapsed', 'restoreGameLoginCollapse',
    'loginPageAutoExpandEnabled', 'setLoginPageAutoExpand', 'restorePanelStateForPage',
    'toggleLoginPanelCollapsed', 'collapseForOfficialEntry',
    'autoCollapseForLogin', 'watchGameLogin']
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
assert.strictEqual(sandbox.gameLoginSessionMarked(), true, 'login success marker was not persisted');

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
state.logs.length = 0;
sandbox.panelContent.hidden = true;
assert.strictEqual(sandbox.autoCollapseForLogin('面板已经收起。', 'official_login'), true);
assert.strictEqual(state.collapseCalls, 1);
assert.strictEqual(state.logs.length, 0);

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
state.pathname = '/10/pc/index.php';
assert.strictEqual(sandbox.restoreGameLoginCollapse(), true, 'reload did not restore the collapsed state');
assert.strictEqual(state.collapseCalls, 1);
sandbox.clearGameLoginSession();
assert.strictEqual(sandbox.restoreGameLoginCollapse(), false, 'logged-out tab restored a stale collapsed state');

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.pathname = '/login/10th_client/index.html';
sandbox.markGameLoginSession();
sandbox.setLoginPanelCollapsed(true);
state.collapseCalls = 0;
assert.strictEqual(sandbox.restorePanelStateForPage(), false, 'main login page did not default to expanded');
assert.strictEqual(sandbox.panelContent.hidden, false, 'main login page restored a remembered collapsed state');
assert.strictEqual(vm.runInContext('gameLoginAutoCollapsed', sandbox), false,
  'main login page disabled automatic collapse before a new login');

sandbox.setLoginPageAutoExpand(false);
assert.strictEqual(gmValues.get('sgs-login-page-auto-expand-v1'), false, 'auto-expand preference was not persisted');
sandbox.setLoginPanelCollapsed(true);
assert.strictEqual(sandbox.restorePanelStateForPage(), true,
  'disabled auto-expand still forced the remembered collapsed panel open');
sandbox.setLoginPanelCollapsed(false);
assert.strictEqual(sandbox.restorePanelStateForPage(), false,
  'disabled auto-expand did not preserve the remembered expanded state');
sandbox.setLoginPageAutoExpand(true);
sandbox.setLoginPanelCollapsed(true);
assert.strictEqual(sandbox.restorePanelStateForPage(), false,
  'enabled auto-expand did not force the main login panel open');

vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
sandbox.panelContent.hidden = true;
sandbox.toggleLoginPanelCollapsed();
assert.strictEqual(sandbox.panelContent.hidden, false, 'manual expand did not open the panel');
assert.strictEqual(vm.runInContext('gameLoginAutoCollapsed', sandbox), false,
  'manual expand disabled automatic collapse for the next login');
sandbox.panelContent.hidden = false;
assert.strictEqual(sandbox.autoCollapseForLogin('手动展开后登录成功。', 'official_login'), true,
  'a successful login did not collapse a manually expanded panel');

state.pathname = '/10/pc/index.php';
vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
sandbox.markGameLoginSession();
state.collapseCalls = 0;
sandbox.setLoginPanelCollapsed(false);
assert.strictEqual(sandbox.restoreGameLoginCollapse(), true, 'game page did not restore the successful-login collapse');
assert.strictEqual(sandbox.panelContent.hidden, true, 'game page kept the panel expanded after a successful login');
assert.strictEqual(vm.runInContext('gameLoginAutoCollapsed', sandbox), true,
  'game page did not register the restored successful login');
state.pathname = '/login/10th_client/index.html';
vm.runInContext('gameLoginAutoCollapsed = false; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
sandbox.panelContent.hidden = false;
sandbox.__scheduled = null;
sandbox.watchGameLogin();
assert.strictEqual(sandbox.__scheduled, null,
  'the main login page started an official-login watcher that can collapse the plugin');
assert.strictEqual(state.collapseCalls, 0, 'the main login page auto-collapsed without a channel login');

vm.runInContext('gameLoginAutoCollapsed = true; gameLoginWatchTimer = 0; gameLoginWatchDeadline = 0;', sandbox);
state.collapseCalls = 0;
sandbox.panelContent.hidden = false;
assert.strictEqual(sandbox.collapseForOfficialEntry(), true,
  'entering the game did not force-collapse a manually expanded panel');
assert.strictEqual(sandbox.panelContent.hidden, true, 'the panel stayed expanded after entering the game');

console.log(JSON.stringify({ok: true, collapseCalls: state.collapseCalls,
  officialLog: state.logs.map(item => item.message)}, null, 2));
