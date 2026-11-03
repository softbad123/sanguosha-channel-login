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
  'let loginSuccessPrompt = null, loginSuccessPromptTimer = 0, panelAutoHideTimer = 0;',
  'let loginSuccessCopy = null, gameChannelLookup = null;',
  'let loginSuccessPromptShown = false;',
  ['isGamePage', 'loginSuccessPromptMarked', 'ensureLoginSuccessPrompt', 'hideLoginSuccessPrompt',
    'showLoginSuccessPrompt', 'schedulePanelAutoHide', 'clearLoginSuccessPromptState',
    'notifyGameEntrySuccess', 'normalizedGameChannelId', 'currentGameChannelIds', 'routeGameChannelIds',
    'knownGameChannels', 'officialGameChannelIds', 'detectGameLoginChannel',
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

console.log(JSON.stringify({ok: true, title: '登录成功', panelHidden: !state.panelVisible,
  promptDismissed: prompt.hidden, logs: state.logs.map(item => item.message)}, null, 2));
