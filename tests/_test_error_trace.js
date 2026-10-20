'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', '三国杀多渠道登录.user.js'), 'utf8');

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
let clock = Date.parse('2026-10-21T02:00:00.000Z');
const storage = {value: [], read() { return this.value; }, write(entries) { this.value = JSON.parse(JSON.stringify(entries)); }};
const log = createFeedbackLog(storage, {limit: 80, ttl: 3600000, now: () => clock, session: '0123456789abcdef'});

const causeStack = 'Error: socket reset\n    at request (https://web.sanguosha.com/userscripts/sanguosha.user.js:88:9)';
const cause = Object.assign(new Error('socket reset'), {
  code: 'ECONNRESET', stage: 'channel_network', httpStatus: 502,
  fileName: 'https://web.sanguosha.com/userscripts/sanguosha.user.js',
  lineNumber: 88, columnNumber: 9, stack: causeStack
});
const errorStack = 'Error: SGS 兑换失败\n    at exchange (https://web.sanguosha.com/userscripts/sanguosha.user.js:245:7)';
const error = Object.assign(new Error('SGS 兑换失败'), {
  code: 'SGS_GRANT_FAILED', stage: 'sgs_grant', cause,
  fileName: 'https://web.sanguosha.com/userscripts/sanguosha.user.js',
  lineNumber: 245, columnNumber: 7, stack: errorStack
});
const details = log.errorDetails(error, {traceId: 'fb-auth-test', flow: 'authorization', provider: 'qq'});
assert.strictEqual(details.message, 'SGS 兑换失败');
assert.strictEqual(details.meta.code, 'SGS_GRANT_FAILED');
assert.strictEqual(details.meta.stage, 'sgs_grant');
assert.strictEqual(details.meta.httpStatus, 502);
assert.strictEqual(details.meta.source, 'https://web.sanguosha.com/userscripts/sanguosha.user.js');
assert.strictEqual(details.meta.line, 245);
assert.strictEqual(details.meta.column, 7);
assert.strictEqual(details.meta.cause, 'socket reset');
assert.strictEqual(details.meta.causeCode, 'ECONNRESET');
assert.strictEqual(details.meta.causeStage, 'channel_network');
assert.strictEqual(details.meta.causeLine, 88);
assert.strictEqual(details.meta.causeColumn, 9);
assert(details.meta.stack.includes('exchange'));
assert(details.meta.causeStack.includes('request'));
assert.strictEqual(details.meta.traceId, 'fb-auth-test');
assert.strictEqual(details.meta.flow, 'authorization');
assert.strictEqual(details.meta.provider, 'qq');

log.addError(error, {traceId: 'fb-auth-test', flow: 'authorization', stage: 'sgs_grant', provider: 'qq',
  message: '授权兑换失败'});
const stored = log.items().at(-1);
assert.strictEqual(stored.level, 'error');
assert.strictEqual(stored.meta.code, 'SGS_GRANT_FAILED');
assert.strictEqual(stored.meta.causeCode, 'ECONNRESET');
assert(stored.meta.stack.includes('sanguosha.user.js:245:7'));

const stackOnly = log.errorDetails({
  name: 'TypeError', message: 'bad response',
  stack: 'TypeError: bad response\n    at parse (https://web.sanguosha.com/userscripts/sanguosha.user.js:321:19)'
});
assert.strictEqual(stackOnly.meta.source, 'https://web.sanguosha.com/userscripts/sanguosha.user.js');
assert.strictEqual(stackOnly.meta.line, 321);
assert.strictEqual(stackOnly.meta.column, 19);

const nestedStackOnly = new Error('outer failure');
nestedStackOnly.cause = {
  name: 'Error', message: 'inner failure',
  stack: 'Error: inner failure\n    at inner (chrome-extension://abcd/userscripts/sanguosha.user.js:456:3)'
};
const nestedDetails = log.errorDetails(nestedStackOnly);
assert.strictEqual(nestedDetails.meta.causeLine, 456);
assert.strictEqual(nestedDetails.meta.causeColumn, 3);
assert.strictEqual(nestedDetails.meta.causeSource,
  'chrome-extension://abcd/userscripts/sanguosha.user.js');

const engineCapture = [];
const ingestSandbox = {
  feedbackLog: {
    errorDetails: log.errorDetails,
    add(...args) { engineCapture.push(args); }
  },
  diagnosticMeta: extra => ({traceId: 'fb-engine-test', flow: 'direct', ...extra})
};
vm.createContext(ingestSandbox);
vm.runInContext(extractFunction(main, 'ingestDiagnostic'), ingestSandbox);
ingestSandbox.ingestDiagnostic({
  level: 'error', message: '直接登录失败：ENGINE_FAIL', code: 'ENGINE_FAIL', stage: 'direct_login',
  stack: 'Error: ENGINE_FAIL\n    at request (https://web.sanguosha.com/userscripts/sanguosha.user.js:456:7)'
});
assert.strictEqual(engineCapture.length, 1);
assert.strictEqual(engineCapture[0][0], 'error');
assert.strictEqual(engineCapture[0][1], '直接登录失败：ENGINE_FAIL');
assert.strictEqual(engineCapture[0][2].code, 'ENGINE_FAIL');
assert.strictEqual(engineCapture[0][2].source,
  'https://web.sanguosha.com/userscripts/sanguosha.user.js');
assert.strictEqual(engineCapture[0][2].line, 456);
assert.strictEqual(engineCapture[0][2].column, 7);
assert.strictEqual(engineCapture[0][2].traceId, 'fb-engine-test');

const cyclic = new Error('cyclic cause');
cyclic.cause = cyclic;
assert.doesNotThrow(() => log.errorDetails(cyclic));

const broken = createFeedbackLog({
  read() { throw new Error('corrupt storage'); },
  write() { throw new Error('storage denied'); }
}, {limit: 20, now: () => clock});
assert.doesNotThrow(() => broken.add('error', '内存回退日志'));
assert.strictEqual(broken.items().length, 1);
assert.strictEqual(broken.items()[0].message, '内存回退日志');
assert.doesNotThrow(() => broken.add('warning', '第二条回退日志'));
assert.strictEqual(broken.items().length, 2);

log.add('error', 'Bearer supersecret token=abc123 ticket=xyz789 cookie=sid=1 https://example.test/a?state=public');
const redacted = log.items().at(-1).message;
assert(!/supersecret|abc123|xyz789|sid=1|state=public/.test(redacted), 'trace log leaked credentials');
assert(redacted.includes('<已隐藏>'));

const captured = [];
const listeners = {};
const sandbox = {
  feedbackLog: {
    add(...args) { captured.push({kind: 'add', args}); },
    addError(...args) { captured.push({kind: 'error', args}); }
  },
  diagnosticMeta: extra => ({traceId: 'fb-runtime-test', flow: 'runtime', ...extra}),
  ingestDiagnostic() {},
  unsafeWindow: {},
  window: {addEventListener(name, listener) { listeners[name] = listener; }},
  console: {warn() {}, error() {}}
};
vm.createContext(sandbox);
vm.runInContext(extractFunction(main, 'installFeedbackCapture') + '\ninstallFeedbackCapture();', sandbox);

const vmError = vm.runInContext("Object.assign(new Error('engine error'), {code: 'ENGINE_FAIL', stage: 'direct_login'})", sandbox);
sandbox.console.error('[统一登录器]', vmError);
assert.strictEqual(captured.length, 1);
assert.strictEqual(captured[0].kind, 'error');
assert.strictEqual(captured[0].args[0], vmError);

sandbox.console.error('[其他脚本]', 'must not be captured');
assert.strictEqual(captured.length, 1);

const rejection = vm.runInContext("Object.assign(new Error('async failure'), {code: 'ASYNC_FAIL'})", sandbox);
listeners.unhandledrejection({reason: rejection});
assert.strictEqual(captured.length, 2);
assert.strictEqual(captured[1].kind, 'error');
assert(captured[1].args[1].message.startsWith('未处理的异步异常'));

const uncaught = vm.runInContext("Object.assign(new Error('uncaught failure'), {code: 'UNCAUGHT_FAIL'})", sandbox);
listeners.error({filename: 'https://web.sanguosha.com/userscripts/sanguosha.user.js',
  message: uncaught.message, error: uncaught, lineno: 45, colno: 12});
assert.strictEqual(captured.length, 3);
assert.strictEqual(captured[2].kind, 'error');
assert.strictEqual(captured[2].args[1].line, 45);
assert.strictEqual(captured[2].args[1].column, 12);

assert.strictEqual(typeof sandbox.unsafeWindow.__SGS_DIAGNOSTIC__, 'function');
console.log(JSON.stringify({ok: true, stored: log.items().length, captured: captured.length,
  engineCaptured: engineCapture.length, trace: details.meta}, null, 2));
