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

const gamePattern = /const GAME_ROUTE_PATTERN = (\/[^\n]+\/);/.exec(main)?.[1];
assert(gamePattern, 'game route pattern is missing');

function element(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    attributes: {},
    className: '',
    id: '',
    textContent: '',
    hidden: false,
    type: '',
    style: {cssText: '', setProperty() {}},
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener() {},
    get isConnected() { return this.__connected !== false; },
    attachShadow() {
      if (!this.shadowRoot) this.shadowRoot = element('shadow-root');
      return this.shadowRoot;
    }
  };
  return node;
}

const body = element('body');
const state = {pathname: '/10/pc/index.php', search: '', panelVisible: true, prefs: null, logs: []};
const sessionValues = new Map();
const timers = new Map();
let timerId = 0;
const unsafeWindow = {
  name: '',
  channel_id: 210100,
  ReqObj: {channel_id: 210100},
  AccountInfo: {BaseChannel: 210100, Self: {BaseChannel: 210100}},
  UserData: {Self: {BaseChannel: 210100}},
  ChannelTyp: {CHATOL: 210100, CHATOLWD: 110101, CHATOLTencentStartWD: 120063}
};
function setGameChannel(value) {
  unsafeWindow.channel_id = value;
  unsafeWindow.ReqObj.channel_id = value;
  unsafeWindow.AccountInfo.BaseChannel = value;
  unsafeWindow.AccountInfo.Self.BaseChannel = value;
  unsafeWindow.UserData.Self.BaseChannel = value;
}
function setRouteChannels(values = []) {
  state.search = values.length ? '?' + values.map(value =>
    'channel_id=' + encodeURIComponent(String(value))).join('&') : '';
}
const handoffName = seed => 'jnd-wg-qq-' + String(seed || 'a').repeat(32);
function setXiaomiAttempt(options = {}) {
  const name = options.name || handoffName();
  const value = {
    name,
    id: options.id || 'b'.repeat(32),
    profileId: options.profileId === undefined ? '' : String(options.profileId),
    clientToken: options.clientToken || 'c'.repeat(32)
  };
  sessionValues.set('sgs-direct-login-attempt-v1', JSON.stringify({
    v: 1,
    provider: options.attemptProvider || 'xiaomi',
    ...value,
    restored: options.restored === true,
    saveSession: options.saveSession !== false,
    expires: options.attemptExpires === undefined ? Date.now() + 60000 : options.attemptExpires
  }));
  return value;
}
function setXiaomiHandoff(options = {}) {
  const attempt = setXiaomiAttempt(options);
  sessionValues.set('sgs-direct-handoff-v1', JSON.stringify({
    ...attempt,
    provider: options.provider || 'xiaomi',
    expires: options.expires === undefined ? Date.now() + 60000 : options.expires
  }));
  unsafeWindow.name = attempt.name;
  return attempt;
}
function clearHandoff(options = {}) {
  sessionValues.delete('sgs-direct-handoff-v1');
  if (!options.keepAttempt) sessionValues.delete('sgs-direct-login-attempt-v1');
  unsafeWindow.name = '';
}
function setXiaomiBootstrap(options = {}) {
  unsafeWindow.__SGS_XIAOMI_BOOTSTRAP__ = {
    provider: options.provider || 'xiaomi',
    channelId: options.channelId || '320052',
    expires: options.expires === undefined ? Date.now() + 60000 : options.expires
  };
}
function clearXiaomiBootstrap() {
  delete unsafeWindow.__SGS_XIAOMI_BOOTSTRAP__;
}
const sandbox = {
  location: {get pathname() { return state.pathname; }, get search() { return state.search; }},
  document: {body, documentElement: element('html'), createElement: element},
  sessionStorage: {
    getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
    removeItem(key) { sessionValues.delete(key); }
  },
  URL,
  URLSearchParams,
  unsafeWindow,
  ChannelRegistry: {channels: [
    {id: 'xiaomi', shortName: '小米服', gameChannelId: 320052,
      bridge: {channelId: 320052}, launchPage: 'https://web.sanguosha.com/x/pc/index.php'},
    {id: 'vivo', shortName: 'Vivo服', gameChannelId: 320056,
      bridge: {channelId: 320056}, launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320056'},
    {id: 'yyb', shortName: '应用宝服', gameChannelId: 320460,
      bridge: {channelId: 320460}, launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320460'},
    {id: 'wegame', shortName: 'WeGame服', gameChannelId: 320023,
      bridge: {channelId: 320023}, launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320023'}
  ]},
  CHANNEL: {id: 'vivo', shortName: 'Vivo服'},
  panelHost: {hidden: false},
  setPanelVisible(visible) {
    state.panelVisible = !!visible;
    sandbox.panelHost.hidden = !visible;
  },
  savePreferences(changes) { state.prefs = {...state.prefs, ...changes}; },
  feedbackLog: {add(level, message, meta) { state.logs.push({level, message, meta}); }},
  diagnosticMeta: extra => ({traceId: 'login-success-test', ...extra}),
  reportFeedbackError(error, context) { state.logs.push({level: 'error', message: context?.message || error?.message}); },
  setTimeout(callback, delay) { const id = ++timerId; timers.set(id, {callback, delay}); return id; },
  clearTimeout(id) { timers.delete(id); }
};
vm.createContext(sandbox);

const source = [
  'const GAME_ROUTE_PATTERN = ' + gamePattern + ';',
  "const LOGIN_SUCCESS_PROMPT_KEY = 'sgs-login-success-prompt-v1';",
  'const LOGIN_SUCCESS_PROMPT_MS = 4200;',
  'const PANEL_AUTO_HIDE_DELAY_MS = 700;',
  "const PANEL_HIDDEN_KEY = 'sgs-panel-hidden-v1';",
  "const OFFICIAL_GAME_CHANNEL_IDS = Object.freeze(['210100', '110101']);",
  "const GAME_CHANNEL_ID_ALIASES = Object.freeze({yyb: Object.freeze(['1036']), wegame: Object.freeze(['321023'])});",
  "const GAME_ROUTE_DEFAULT_CHANNEL_IDS = Object.freeze({'/x/pc/index.php': Object.freeze(['320052'])});",
  "const EMBEDDED_HANDOFF_KEY = 'sgs-direct-handoff-v1';",
  'const EMBEDDED_HANDOFF_MAX_BYTES = 65536;',
  "const DIRECT_LOGIN_ATTEMPT_KEY = 'sgs-direct-login-attempt-v1';",
  "const XIAOMI_BOOTSTRAP_KEY = '__SGS_XIAOMI_BOOTSTRAP__';",
  "const XIAOMI_CHANNEL_ID = '320052';",
  'const XIAOMI_HANDOFF_NAME_PATTERN = /^jnd-wg-qq-[a-f0-9]{32}$/;',
  'const XIAOMI_PROMPT_RESOLVE_MS = 15000;',
  'const XIAOMI_PROMPT_POLL_MS = 200;',
  'let loginSuccessPrompt = null, loginSuccessPromptTimer = 0, panelAutoHideTimer = 0;',
  'let loginSuccessCopy = null, gameChannelLookup = null;',
  'let loginSuccessPromptShown = false;',
  'let pendingGameEntryNotice = null;',
  ['isGamePage', 'loginSuccessPromptMarked', 'ensureLoginSuccessPrompt', 'hideLoginSuccessPrompt',
    'showLoginSuccessPrompt', 'schedulePanelAutoHide', 'clearPendingGameEntryNotice',
    'discardDirectLoginAttemptMarker', 'clearLoginSuccessPromptState', 'presentGameEntrySuccess',
    'queueGameEntryNotice', 'notifyGameEntrySuccess', 'notifySavedLoginEntry',
    'normalizedGameChannelId', 'currentGameChannelIds', 'routeGameChannelIds',
    'knownGameChannels', 'officialGameChannelIds', 'xiaomiGameChannel', 'readEmbeddedHandoff',
    'directLoginAttemptMarker', 'handoffWindowName', 'pendingXiaomiHandoffChannel',
    'documentXiaomiProvenanceChannel', 'xiaomiProvenanceChannel', 'xiaomiDirectLoginAmbiguous',
    'detectGameLoginChannel',
    'loginSuccessChannelCopy'].map(name => extractFunction(main, name)).join('\n')
].join('\n');
vm.runInContext(source, sandbox);

assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'official game channel was not identified independently of the selected channel');
setGameChannel(320056);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用Vivo服账号进入游戏。',
  'the actual Vivo game channel was not identified');
setGameChannel(210100);
setRouteChannels([320056]);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用Vivo服账号进入游戏。',
  'the Vivo route was overridden by an unrelated official runtime channel');
setGameChannel(320056);
setRouteChannels([210100]);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'the official route was not honored when runtime fields still contained a vendor channel');
setGameChannel(null);
setRouteChannels([320056, 320023]);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'conflicting route channels were resolved instead of staying neutral');
setGameChannel(210100);
setRouteChannels([999999]);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'an unrecognized route channel fell back to a stale runtime channel');
setRouteChannels();
setGameChannel(320056);
unsafeWindow.ReqObj.channel_id = 210100;
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'a stale vendor channel overrode the official channel present elsewhere');
setGameChannel(320056);
unsafeWindow.ReqObj.channel_id = 320023;
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'conflicting vendor channels were resolved by source order instead of staying neutral');
setGameChannel(320056);
unsafeWindow.channel_id = 999999;
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'an unrecognized channel id was ignored while claiming a known stale channel');
setGameChannel(320460);
unsafeWindow.ReqObj.channel_id = 1036;
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用应用宝服账号进入游戏。',
  'multiple ids belonging to the same channel were treated as a conflict');
setGameChannel(120063);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'an unrelated CHATOL-prefixed partner channel was mislabeled as official');
setGameChannel(null);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用账号进入游戏。',
  'unknown channel state did not fall back to neutral copy');
setGameChannel(210100);
state.pathname = '/x/pc/index.php';
setRouteChannels();
const originalChannel = sandbox.CHANNEL;
sandbox.CHANNEL = {id: 'xiaomi', shortName: '小米服'};
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'an official login on /x/pc was mislabeled as Xiaomi even with Xiaomi as the active channel');
unsafeWindow.ReqObj.channel_id = 320052;
unsafeWindow.channel_id = 320052;
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用小米服账号进入游戏。',
  'the injected Xiaomi channel was overridden by the official runtime placeholder');
setGameChannel(210100);
setRouteChannels();
clearXiaomiBootstrap();
clearHandoff();
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'official login without a Xiaomi handoff was mislabeled as Xiaomi');
setXiaomiHandoff();
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用小米服账号进入游戏。',
  'the account-management Xiaomi handoff was not honored before the bootstrap ran');
setXiaomiHandoff({provider: 'vivo'});
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'a non-Xiaomi handoff was treated as Xiaomi provenance');
setXiaomiHandoff({expires: Date.now() - 1});
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'an expired Xiaomi handoff mislabeled an official login');
clearHandoff();
setXiaomiBootstrap();
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用小米服账号进入游戏。',
  'the document Xiaomi bootstrap provenance was not honored');
setXiaomiBootstrap({expires: Date.now() - 1});
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'an expired Xiaomi bootstrap provenance mislabeled an official login');
setXiaomiBootstrap();
setGameChannel(320056);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用Vivo服账号进入游戏。',
  'Xiaomi provenance overrode a conflicting Vivo runtime channel');
setGameChannel(210100);
setRouteChannels([210100]);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用官服账号进入游戏。',
  'the official route lost to Xiaomi document provenance');
setRouteChannels();
clearXiaomiBootstrap();
setXiaomiHandoff();
setGameChannel(null);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用小米服账号进入游戏。',
  'a Xiaomi handoff was ignored when the game runtime was still empty');
clearHandoff();
setGameChannel(210100);
const originalNotifier = sandbox.notifyGameEntrySuccess;
let savedLoginNotifications = 0;
sandbox.notifyGameEntrySuccess = () => { savedLoginNotifications += 1; return true; };
assert.strictEqual(sandbox.notifySavedLoginEntry(), false,
  'saved account login notified before the old game page navigated to the routed channel');
assert.strictEqual(savedLoginNotifications, 0,
  'saved account login displayed success against the stale pre-navigation channel');
state.pathname = '/login/10th_client/index.html';
assert.strictEqual(sandbox.notifySavedLoginEntry(), true,
  'saved account login did not hand the notification to the next page lifecycle');
assert.strictEqual(savedLoginNotifications, 1,
  'saved account login was not allowed to notify outside the stale game page');
sandbox.notifyGameEntrySuccess = originalNotifier;
sandbox.CHANNEL = originalChannel;
state.pathname = '/10/pc/index.php';
setGameChannel(320052);
assert.strictEqual(sandbox.loginSuccessChannelCopy(), '已使用小米服账号进入游戏。',
  'the actual Xiaomi game channel was not identified');
setGameChannel(210100);

assert.strictEqual(sandbox.notifyGameEntrySuccess('测试登录成功。', 'game_login', {source: 'test'}), true,
  'game entry did not show the success prompt');
assert.strictEqual(body.children.length, 1, 'success prompt host was not appended once');
const prompt = body.children[0];
assert.strictEqual(prompt.id, 'sgs-login-success-prompt');
assert.strictEqual(prompt.hidden, false, 'success prompt stayed hidden');
assert(prompt.style.cssText.includes('place-items:center'), 'success prompt is not centered');
assert.strictEqual(sessionValues.get('sgs-login-success-prompt-v1'), '1',
  'success prompt idempotency marker was not persisted');
assert.strictEqual(state.panelVisible, true, 'panel hid before the success prompt became visible');
assert.strictEqual(sessionValues.get('sgs-panel-hidden-v1'), '1',
  'panel hidden state was not persisted before the visual delay');
assert.strictEqual(state.prefs?.hidden, true, 'panel hidden preference was not persisted immediately');
assert.strictEqual(state.logs.filter(item => item.level === 'success').length, 1,
  'success prompt was not recorded in feedback');

const dialog = prompt.shadowRoot.children.find(item => item.className === 'success-dialog');
assert(dialog, 'success dialog was not created');
assert(dialog.children.some(item => item.tagName === 'H2' && item.textContent === '登录成功'),
  'success dialog title is missing');
assert(dialog.children.some(item => item.tagName === 'P' && item.textContent.includes('进入游戏')),
  'success dialog copy is missing');
assert.strictEqual(dialog.children.find(item => item.tagName === 'P')?.textContent,
  '已使用官服账号进入游戏。', 'success dialog reused the selected channel instead of the actual game channel');
assert(dialog.children.some(item => item.tagName === 'SMALL' && item.textContent.includes('自动隐藏')),
  'success dialog hide hint is missing');
assert.strictEqual(state.logs.filter(item => item.level === 'success')[0]?.meta?.channelId, 'official',
  'success feedback did not record the detected official channel');

assert.strictEqual(sandbox.notifyGameEntrySuccess('重复通知。', 'game_login', {source: 'test'}), false,
  'a repeated game event showed the success prompt again');
assert.strictEqual(body.children.length, 1, 'repeat notification added a second prompt host');

const panelTimer = [...timers.values()].find(item => item.delay === 700);
assert(panelTimer, 'panel auto-hide timer was not scheduled');
panelTimer.callback();
assert.strictEqual(state.panelVisible, false, 'panel was not hidden after the prompt delay');
assert.strictEqual(state.prefs?.hidden, true, 'panel hidden preference was not persisted');
assert.strictEqual(prompt.hidden, false, 'success prompt disappeared together with the panel');

const promptTimer = [...timers.values()].find(item => item.delay === 4200);
assert(promptTimer, 'success prompt auto-dismiss timer was not scheduled');
promptTimer.callback();
assert.strictEqual(prompt.hidden, true, 'success prompt did not auto-dismiss');

sandbox.clearLoginSuccessPromptState();
state.pathname = '/login/10th_client/index.html';
assert.strictEqual(sandbox.notifyGameEntrySuccess('登录页事件。', 'game_login', {source: 'test'}), false,
  'success prompt appeared before entering the game');

function runTimer(delay) {
  const entry = [...timers.entries()].filter(([, item]) => item.delay === delay).pop();
  assert(entry, 'expected a ' + delay + 'ms timer');
  timers.delete(entry[0]);
  entry[1].callback();
}
function successCopy() {
  return vm.runInContext('loginSuccessCopy?.textContent || ""', sandbox);
}
function resetXiaomiPromptTest() {
  sandbox.clearLoginSuccessPromptState();
  clearXiaomiBootstrap();
  clearHandoff();
  state.pathname = '/x/pc/index.php';
  setRouteChannels();
  setGameChannel(210100);
}

resetXiaomiPromptTest();
setXiaomiHandoff();
assert.strictEqual(sandbox.notifyGameEntrySuccess('小米直登成功。', 'game_login',
  {source: 'game_page_restore'}), false,
  'the game success prompt locked the official placeholder before the Xiaomi bootstrap ran');
assert.strictEqual(prompt.hidden, true, 'the early official prompt was shown despite Xiaomi provenance');
assert.strictEqual(sessionValues.has('sgs-login-success-prompt-v1'), false,
  'the early official prompt persisted its idempotency marker');
setXiaomiBootstrap();
clearHandoff();
runTimer(200);
assert.strictEqual(prompt.hidden, false, 'the deferred success prompt was not shown after Xiaomi identity arrived');
assert.strictEqual(successCopy(), '已使用小米服账号进入游戏。',
  'the deferred success prompt did not use the verified Xiaomi identity');

resetXiaomiPromptTest();
assert.strictEqual(sandbox.notifyGameEntrySuccess('官服登录成功。', 'game_login',
  {source: 'game_page_restore'}), true,
  'an official /x/pc login without Xiaomi evidence was incorrectly deferred');
assert.strictEqual(successCopy(), '已使用官服账号进入游戏。',
  'an official /x/pc login was mislabeled after the prompt deferral change');

resetXiaomiPromptTest();
setXiaomiHandoff();
unsafeWindow.name = handoffName('e');
assert.strictEqual(sandbox.notifyGameEntrySuccess('官服登录成功。', 'game_login',
  {source: 'game_page_restore'}), true,
  'a stale Xiaomi handoff without the matching tab name deferred an official login');
assert.strictEqual(successCopy(), '已使用官服账号进入游戏。',
  'a stale Xiaomi handoff contaminated an official login prompt');

resetXiaomiPromptTest();
setXiaomiAttempt();
assert.strictEqual(sandbox.notifyGameEntrySuccess('小米直登结果未知。', 'game_login',
  {source: 'game_page_restore'}), false,
  'an unconsumed Xiaomi direct attempt was not deferred');
vm.runInContext('pendingGameEntryNotice.deadline = Date.now() - 1;', sandbox);
runTimer(200);
assert.strictEqual(successCopy(), '已使用账号进入游戏。',
  'an unresolved Xiaomi direct attempt fell back to the official label');
assert.strictEqual(sessionValues.has('sgs-direct-login-attempt-v1'), false,
  'the unresolved Xiaomi attempt marker was not cleared after the neutral prompt');

console.log(JSON.stringify({ok: true, title: '登录成功', panelHidden: !state.panelVisible,
  promptDismissed: prompt.hidden, logs: state.logs.map(item => item.message)}, null, 2));
