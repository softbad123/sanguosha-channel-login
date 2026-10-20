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

const report = feedback.report({version: '1.2.0', channelId: 'xiaomi', browser: 'QQ 浏览器 138'});
assert.strictEqual(report.schema, 'sgs-feedback-log-v1');
assert.strictEqual(report.privacy.autoUpload, false);
assert.strictEqual(report.environment.version, '1.2.0');
assert(!JSON.stringify(report).includes('token=supersecret'), 'feedback report retained a credential');

const versionSource = extractFunction(main, 'versionParts') + '\n' + extractFunction(main, 'versionIsNewer');
const versionSandbox = {};
vm.runInNewContext(versionSource + '\nthis.isNewer = versionIsNewer;', versionSandbox);
assert.strictEqual(versionSandbox.isNewer('v1.2.0', '1.1.4'), true);
assert.strictEqual(versionSandbox.isNewer('1.1.4', '1.2.0'), false);
assert.strictEqual(versionSandbox.isNewer('1.10.0', '1.9.9'), true);
assert.strictEqual(versionSandbox.isNewer('release-latest', '1.2.0'), false);

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
  {metadataVersion: '1.2.0', hostVersion: '1.2.0', engineVersion: '1.2.0', packageVersion: '1.2.0'});

assert(main.includes('// @updateURL    https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js'), 'update URL is not pinned');
assert(main.includes('// @downloadURL  https://github.com/softbad123/sanguosha-channel-login/releases/latest/download/sanguosha-channel-login.user.js'), 'download URL is not pinned');
assert(main.includes('// @connect      api.github.com'), 'GitHub update endpoint is not declared');
assert(main.includes('const COLLAPSED_PANEL_WIDTH = 208;'), 'compact collapsed width is missing');
assert(main.includes('.box.is-collapsed .panel-hide{display:none}'), 'collapsed header still shows the hide action');
assert(main.includes('panelHost.style.width = (next ? COLLAPSED_PANEL_WIDTH : EXPANDED_PANEL_WIDTH)'), 'panel width does not follow collapsed state');
assert(main.includes('gameLoginAutoCollapsed = true;'), 'game login watcher does not stop after one success');
assert(main.includes("feedbackLog.add('success', '检测到游戏账号资料，已自动折叠登录面板。'"), 'official login auto-collapse is not logged');
assert(main.includes('复制反馈日志') && main.includes('导出反馈日志') && main.includes('问题反馈'), 'feedback actions are not wired into the panel');
assert(main.includes('clear(); status('), 'feedback log cannot be cleared');
assert(main.includes("tabs.className = 'panel-tabs'") && main.includes("['login', '登录'], ['account', '账号'], ['diagnostics', '诊断']"), 'menu-style panel tabs are missing');
assert(main.includes('loginView.appendChild(channelCard)') && main.includes('accountView.appendChild(manager)') && main.includes('diagnosticsView.appendChild(diagnostics)'), 'panel sections are still stacked in one view');
assert(main.includes('content.append(tabs, loginView, accountView, diagnosticsView)'), 'tab views are not attached to the panel');
assert(main.includes("diagnosticsTabButton.textContent = '诊断' + (unusual.length ? ' ' + unusual.length : '')"), 'diagnostics tab does not expose the anomaly count');

console.log(JSON.stringify({ok: true, versions: {metadataVersion, hostVersion, engineVersion, packageVersion: pkg.version},
  feedbackEntries: feedback.items().length, collapsedWidth: 208}, null, 2));
