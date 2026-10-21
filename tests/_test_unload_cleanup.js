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
  throw new Error(name + ' is incomplete');
}

assert(!main.includes('gameAccountRefresh'), 'undefined timer reference is still present');
assert(main.includes('clearTimeout(gameAccountSyncTimer)'), 'account sync timeout is not cleared');
assert(main.includes('clearTimeout(gameLoginWatchTimer)'), 'game login watcher timeout is not cleared');

const calls = [];
const sandbox = {
  accountRefresh: 41,
  gameAccountSyncTimer: 42,
  gameLoginWatchTimer: 43,
  instanceId: 'tab-1',
  focusListener: 'focus',
  presenceListener: 'presence',
  PREFIX: 'test:',
  active: {
    state: 'state-1',
    controller: {abort() { calls.push('abort'); }}
  },
  clearInterval(id) { calls.push('interval:' + id); },
  clearTimeout(id) { calls.push('timeout:' + id); },
  accounts: {release(id) { calls.push('release:' + id); throw new Error('release failed'); }},
  GM_removeValueChangeListener(id) { calls.push('remove:' + id); },
  GM_deleteValue(key) { calls.push('delete:' + key); },
  pendingKey(state) { return 'pending:' + state; },
  resultKey(state) { return 'result:' + state; }
};
vm.createContext(sandbox);
vm.runInContext(extractFunction(main, 'cleanupPageResources') +
  '\nthis.cleanup = cleanupPageResources;', sandbox);
sandbox.cleanup();

assert(calls.includes('interval:41'), 'account refresh interval was not cleared');
assert(calls.includes('timeout:42'), 'account sync timeout was not cleared');
assert(calls.includes('timeout:43'), 'game watcher timeout was not cleared');
assert(calls.includes('release:tab-1'), 'presence was not released');
assert(calls.includes('remove:focus') && calls.includes('remove:presence'), 'listeners were not removed');
assert(calls.includes('delete:test:focus:tab-1') && calls.includes('delete:test:presence:tab-1'),
  'temporary presence keys were not removed');
assert(calls.includes('abort'), 'authorization polling was not aborted after an earlier cleanup failure');
assert(calls.includes('delete:pending:state-1') && calls.includes('delete:result:state-1'),
  'pending authorization keys were not cleared');
assert.strictEqual(sandbox.gameAccountSyncTimer, 0);
assert.strictEqual(sandbox.gameLoginWatchTimer, 0);

console.log(JSON.stringify({ok: true, steps: calls}, null, 2));
