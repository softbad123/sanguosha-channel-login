'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', '三国杀多渠道登录.user.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '..', '_direct_engine.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

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
  throw new Error(name + ' body is incomplete');
}

function loadFeedbackLog() {
  const begin = main.indexOf('/* FEEDBACK-LOG-BEGIN */');
  const end = main.indexOf('/* FEEDBACK-LOG-END */');
  assert(begin >= 0 && end > begin, 'feedback log markers are missing');
  const source = main.slice(begin + '/* FEEDBACK-LOG-BEGIN */'.length, end);
  const sandbox = {};
  vm.runInNewContext(source + '\nthis.createFeedbackLog = createFeedbackLog;', sandbox);
  return sandbox.createFeedbackLog;
}

const createFeedbackLog = loadFeedbackLog();
let clock = Date.parse('2026-10-21T01:00:00.000Z');
const storage = {
  value: [],
  read() { return this.value; },
  write(entries) { this.value = JSON.parse(JSON.stringify(entries)); }
};
const feedback = createFeedbackLog(storage, {
  limit: 20,
  ttl: 60 * 1000,
  now: () => clock,
  session: '0123456789abcdef'
});

feedback.add('error', '请求 https://example.test/login?token=secret&ticket=abc123 失败');
let items = feedback.items();
assert.strictEqual(items.length, 1, 'feedback entry was not stored');
assert(!items[0].message.includes('secret'), 'URL token leaked into feedback log');
assert(!items[0].message.includes('abc123'), 'URL ticket leaked into feedback log');
assert(items[0].message.includes('<已隐藏>'), 'private URL query was not redacted');

feedback.add('error', 'token=supersecret ticket=ticket-value cookie=session-value');
items = feedback.items();
assert(!/supersecret|ticket-value|session-value/.test(items.at(-1).message), 'credential fields leaked');

feedback.add('info', 'id 0123456789abcdef0123456789abcdef');
items = feedback.items();
assert(!items.at(-1).message.includes('0123456789abcdef0123456789abcdef'), 'long opaque id leaked');

feedback.add('warning', '同一错误');
feedback.add('warning', '同一错误');
items = feedback.items();
assert.strictEqual(items.at(-1).count, 2, 'repeated message was not coalesced');
clock += 9000;
feedback.add('warning', '同一错误');
assert.strictEqual(feedback.items().length, items.length + 1, 'deduplication window was too wide');

clock += 61000;
assert.strictEqual(feedback.items().length, 0, 'expired feedback was not removed');

for (let index = 0; index < 25; index += 1) {
  clock += 1000;
  feedback.add('info', 'entry-' + index);
}
assert.strictEqual(feedback.items().length, 20, 'feedback limit was not enforced');

const report = feedback.report({version: '1.3.0', channelId: 'xiaomi', browser: 'QQ 浏览器 138'});
assert.strictEqual(report.schema, 'sgs-feedback-log-v1');
assert.strictEqual(report.privacy.autoUpload, false);
assert.strictEqual(report.environment.version, '1.3.0');
assert(!JSON.stringify(report).includes('token=supersecret'), 'feedback report retained a credential');

const sessionStorage = {
  value: [],
  read() { return this.value; },
  write(entries) { this.value = JSON.parse(JSON.stringify(entries)); }
};
let sessionClock = Date.parse('2026-10-21T02:00:00.000Z');
const sessionLog = session => createFeedbackLog(sessionStorage, {
  limit: 100,
  ttl: 24 * 60 * 60 * 1000,
  maxSessions: 2,
  now: () => sessionClock,
  session
});
const firstSession = sessionLog('aaaaaaaaaaaaaaaa');
firstSession.add('info', 'first-session', {version: '1.2.0', channelId: 'vivo'});
sessionClock += 1000;
const secondSession = sessionLog('bbbbbbbbbbbbbbbb');
secondSession.add('warning', 'second-session-warning', {version: '1.3.0', channelId: 'vivo', channelName: 'Vivo'});
secondSession.add('warning', 'second-session-warning', {version: '1.3.0', channelId: 'vivo', channelName: 'Vivo'});
sessionClock += 1000;
const thirdSession = sessionLog('cccccccccccccccc');
thirdSession.add('error', 'third-session-error', {version: '1.3.0', channelId: 'xiaomi', channelName: '小米'});
let retained = thirdSession.items();
assert.strictEqual(JSON.stringify(retained.map(entry => entry.session)),
  JSON.stringify(['bbbbbbbbbbbbbbbb', 'cccccccccccccccc']),
  'session retention did not keep only the most recently active sessions');
const sessionReport = thirdSession.report({version: '1.3.0'});
assert.strictEqual(JSON.stringify(sessionReport.retention), JSON.stringify({
  maxEntries: 100, ttlMs: 24 * 60 * 60 * 1000, maxSessions: 2, maxBytes: 48 * 1024
}), 'feedback report retention metadata is incorrect');
assert.strictEqual(sessionReport.sessionSummary.length, 2, 'feedback report session summary is incomplete');
assert.strictEqual(JSON.stringify(sessionReport.sessionSummary.map(summary => summary.session)),
  JSON.stringify(['cccccccccccccccc', 'bbbbbbbbbbbbbbbb']),
  'feedback sessions are not ordered by latest activity');
assert.strictEqual(JSON.stringify(sessionReport.sessionSummary.map(summary => ({
  version: summary.version, channelId: summary.channelId, channelName: summary.channelName,
  count: summary.count, errors: summary.errors, warnings: summary.warnings
}))), JSON.stringify([
  {version: '1.3.0', channelId: 'xiaomi', channelName: '小米', count: 1, errors: 1, warnings: 0},
  {version: '1.3.0', channelId: 'vivo', channelName: 'Vivo', count: 2, errors: 0, warnings: 2}
]), 'feedback session summary fields are incorrect');
assert.strictEqual(sessionReport.sessionSummary[0].firstAt, '2026-10-21T02:00:02.000Z',
  'feedback session first timestamp is incorrect');
assert.strictEqual(sessionReport.sessionSummary[0].lastAt, '2026-10-21T02:00:02.000Z',
  'feedback session last timestamp is incorrect');

const updateDownloadMatch = /const UPDATE_DOWNLOAD_URL = '([^']+)'/.exec(main);
const updatePageMatch = /const UPDATE_PAGE_URL = '([^']+)'/.exec(main);
const updateMetaMatch = /const UPDATE_META_URL = '([^']+)'/.exec(main);
assert(updateDownloadMatch && updatePageMatch && updateMetaMatch, 'update URLs are missing');
const updateContext = {
  VERSION: '1.3.0',
  latestVersion: '',
  updateCheckActive: false,
  remoteTag: 'v9.9.9',
  remoteDownload: 'https://github.com/softbad123/sanguosha-channel-login/releases/download/v9.9.9/sanguosha-channel-login.user.js',
  statusTexts: [],
  openedUrls: [],
  reportedErrors: [],
  saved: {},
  Date, JSON, Object, String, Number, URL,
  status(text) { updateContext.statusTexts.push(text); },
  renderUpdateButton() {},
  reportFeedbackError(error, context) { updateContext.reportedErrors.push({error, context}); },
  feedbackLog: {traceId(prefix) { return 'fb-' + prefix + '-test'; }, add() {}},
  GM_setValue(key, value) { updateContext.saved[key] = value; },
  GM_xmlhttpRequest(options) {
    options.onload({status: 200, responseText: JSON.stringify({tag_name: updateContext.remoteTag,
      assets: [{name: 'sanguosha-channel-login.user.js', browser_download_url: updateContext.remoteDownload}]})});
  },
  GM_openInTab(url) { updateContext.openedUrls.push(url); },
  window: {open() { throw new Error('GM_openInTab fallback should not be used in tests'); }}
};
vm.createContext(updateContext);
vm.runInContext([
  'const UPDATE_DOWNLOAD_URL = ' + JSON.stringify(updateDownloadMatch[1]) + ';',
  'const UPDATE_PAGE_URL = ' + JSON.stringify(updatePageMatch[1]) + ';',
  'const UPDATE_META_URL = ' + JSON.stringify(updateMetaMatch[1]) + ';',
  "const UPDATE_ASSET_NAME = 'sanguosha-channel-login.user.js';",
  "const UPDATE_CHECK_KEY = 'sgs-update-check-v1';",
  extractFunction(main, 'versionParts'),
  extractFunction(main, 'versionIsNewer'),
  extractFunction(main, 'safeUpdateDownload'),
  extractFunction(main, 'releaseAssetDownload'),
  extractFunction(main, 'openUpdatePage'),
  extractFunction(main, 'checkForUpdate')
].join('\n'), updateContext);
vm.runInContext('checkForUpdate(true)', updateContext);
assert.deepStrictEqual(updateContext.openedUrls, [updateContext.remoteDownload],
  'manual update check did not open the API-provided release asset URL');
assert.strictEqual(updateContext.saved['sgs-update-check-v1'].download, updateContext.remoteDownload,
  'release asset URL was not cached for the update button');
assert(/正在跳转到 Tampermonkey 安装页/.test(updateContext.statusTexts.at(-1) || ''),
  'manual update check did not report the installer handoff');

const signedAsset = 'https://release-assets.githubusercontent.com/github-production-release-asset/1426803503/611ae7b1-17de-4a82-beec-5fc2450e8c5c?response-content-disposition=attachment%3B%20filename%3Dsanguosha-channel-login.user.js&response-content-type=application%2Foctet-stream';
assert.strictEqual(vm.runInContext('safeUpdateDownload(' + JSON.stringify(signedAsset) + ')', updateContext), signedAsset,
  'signed release-assets installer URL was rejected');

updateContext.updateCheckActive = false;
updateContext.latestVersion = '';
updateContext.openedUrls = [];
updateContext.statusTexts = [];
vm.runInContext('checkForUpdate(false)', updateContext);
assert.strictEqual(updateContext.latestVersion, 'v9.9.9', 'automatic update check did not retain the newer tag');
assert.strictEqual(updateContext.openedUrls.length, 0,
  'automatic update check opened a tab without user action');

updateContext.updateCheckActive = false;
updateContext.latestVersion = '';
updateContext.remoteTag = 'v1.3.0';
updateContext.openedUrls = [];
updateContext.statusTexts = [];
vm.runInContext('checkForUpdate(true)', updateContext);
assert.strictEqual(updateContext.openedUrls.length, 0, 'up-to-date check opened an installer tab');
assert.strictEqual(updateContext.statusTexts.at(-1), '已是最新版本 v1.3.0。');

const versionSource = extractFunction(main, 'versionParts') + '\n' + extractFunction(main, 'versionIsNewer');
const versionSandbox = {};
vm.runInNewContext(versionSource + '\nthis.isNewer = versionIsNewer;', versionSandbox);
assert.strictEqual(versionSandbox.isNewer('v1.3.0', '1.2.0'), true);
assert.strictEqual(versionSandbox.isNewer('1.2.0', '1.3.0'), false);
assert.strictEqual(versionSandbox.isNewer('1.10.0', '1.9.9'), true);
assert.strictEqual(versionSandbox.isNewer('release-latest', '1.3.0'), false);

const identitySource = extractFunction(main, 'gameIdentityReady');
const identitySandbox = {};
vm.runInNewContext(identitySource + '\nthis.ready = gameIdentityReady;', identitySandbox);
assert.strictEqual(identitySandbox.ready(null), false);
assert.strictEqual(identitySandbox.ready({roleId: '0', roleName: 'null'}), false);
assert.strictEqual(identitySandbox.ready({roleName: '测试角色'}), true);
assert.strictEqual(identitySandbox.ready({loginAccount: 'sgs-user'}), true);

const routeMatch = /const GAME_ROUTE_PATTERN = (\/[^\n]+\/);/.exec(main);
assert(routeMatch, 'game route pattern is missing');
const routePattern = vm.runInNewContext(routeMatch[1]);
for (const allowed of ['/x/pc/index.php', '/10/pc/index.php', '/10th/pc/index.html', '/login/pc/index.php']) {
  assert(routePattern.test(allowed), 'game route was rejected: ' + allowed);
}
assert(!routePattern.test('/login/10th_client/index.html'), 'login page was treated as a game page');

const metadataVersion = /^\/\/\s*@version\s+([0-9.]+)\s*$/m.exec(main)?.[1];
const hostVersion = /const VERSION = '([0-9.]+)'/.exec(main)?.[1];
const engineVersion = /const VERSION = '([0-9.]+)'/.exec(engine)?.[1];
assert.deepStrictEqual({metadataVersion, hostVersion, engineVersion, packageVersion: pkg.version},
  {metadataVersion: pkg.version, hostVersion: pkg.version, engineVersion: pkg.version, packageVersion: pkg.version});

assert(main.includes('// @updateURL    https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js'), 'update URL is not pinned');
assert(main.includes('// @downloadURL  https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js'), 'download URL is not pinned');
assert(main.includes('{limit: FEEDBACK_LOG_LIMIT, ttl: FEEDBACK_LOG_TTL, maxSessions: FEEDBACK_LOG_SESSIONS,'),
  'feedback retention is not bounded to the compact session policy');
assert(main.includes('const FEEDBACK_LOG_LIMIT = 80;') && main.includes('const FEEDBACK_LOG_TTL = 3 * 24 * 60 * 60 * 1000;') &&
  main.includes('const FEEDBACK_LOG_SESSIONS = 3;') && main.includes('const FEEDBACK_LOG_MAX_BYTES = 48 * 1024;'),
  'feedback retention constants are not compact');
assert(main.includes('AgoraRTC|PERMISSION_DENIED'), 'known game/audio runtime noise is not filtered');
assert(main.includes('if (manual) openUpdatePage();'), 'manual update checks do not directly open the installer');
assert(main.includes('// @connect      api.github.com'), 'GitHub update endpoint is not declared');
assert(main.includes('const COLLAPSED_PANEL_WIDTH = 208;'), 'compact collapsed width is missing');
assert(main.includes('.box.is-collapsed .panel-hide{display:none}'), 'collapsed header still shows the hide action');
assert(main.includes('panelHost.style.width = (next ? COLLAPSED_PANEL_WIDTH : EXPANDED_PANEL_WIDTH)'), 'panel width does not follow collapsed state');
assert(main.includes('gameLoginAutoCollapsed = true;'), 'game login watcher does not stop after one success');
assert(main.includes("autoCollapseForLogin('检测到游戏账号资料，已自动折叠登录面板。'"), 'game login auto-collapse is not logged');
assert(main.includes("autoCollapseForLogin('检测到进入游戏，已自动折叠登录面板。'"), 'official entry auto-collapse is not logged');
assert(main.includes('function officialLoginReady()') && main.includes("getElementById('goInGameBtn')") &&
  main.includes("closest?.('#goInGameBtn')"), 'official entry click probe is missing');
assert(main.includes("const LOGIN_PAGE_AUTO_EXPAND_KEY = 'sgs-login-page-auto-expand-v1';") &&
  main.includes("autoExpandToggle.id = 'sgs-login-page-auto-expand'") &&
  main.includes("autoExpandTitle.textContent = '主登录页自动展开'"),
  'persistent main-login auto-expand setting is missing');
assert(main.includes('复制反馈日志') && main.includes('导出反馈日志') && main.includes('问题反馈'), 'feedback actions are not wired into the panel');
assert(main.includes('clear(); status('), 'feedback log cannot be cleared');
assert(main.includes("tabs.className = 'panel-tabs'") && main.includes("['login', '登录'], ['account', '账号'], ['diagnostics', '诊断']"), 'menu-style panel tabs are missing');
assert(main.includes('loginView.appendChild(channelCard)') && main.includes('accountView.appendChild(manager)') && main.includes('diagnosticsView.appendChild(diagnostics)'), 'panel sections are still stacked in one view');
assert(main.includes('content.append(tabs, loginView, accountView, diagnosticsView)'), 'tab views are not attached to the panel');
assert(main.includes("diagnosticsTabButton.textContent = '诊断' + (unusual.length ? ' ' + unusual.length : '')"), 'diagnostics tab does not expose the anomaly count');

console.log(JSON.stringify({ok: true, versions: {metadataVersion, hostVersion, engineVersion, packageVersion: pkg.version},
  feedbackEntries: feedback.items().length, collapsedWidth: 208}, null, 2));
