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

const sandbox = {currentProfileId: '', expectedProfileId: '', accountPhase: 'waiting', Set, Date, String};
vm.createContext(sandbox);
vm.runInContext(['liveAccountLabel', 'profileLiveState', 'profileZone', 'profileZoneSummary',
  'profileGameId', 'shortLoginTime', 'profileListText']
  .map(name => extractFunction(main, name)).join('\n'), sandbox);

const now = Date.UTC(2026, 9, 20, 12, 34);
const time = sandbox.shortLoginTime(now);
const base = {id: 'wegame:demo', channelId: 'wegame', lastLoginAt: now, lastAuthorizedAt: now - 1000};
const cases = {
  full: sandbox.profileListText({...base, roleId: '778899', zoneNote: '微信区'}, '主账号'),
  noId: sandbox.profileListText({...base, zoneNote: '微信区'}, '主账号'),
  noNote: sandbox.profileListText({...base, roleId: '778899'}, '主账号'),
  serverWithoutNote: sandbox.profileListText({...base, roleId: '778899', serverId: '320023'}, '主账号'),
  minimum: sandbox.profileListText(base, ''),
  zoneSummary: sandbox.profileZoneSummary({...base, serverId: '320023'}),
  gameId: sandbox.profileGameId({...base, roleId: '778899'}),
  invalidGameId: sandbox.profileGameId({...base, roleId: '0'})
};

assert.strictEqual(cases.full, 'ID 778899 · 主账号 · 区服备注：微信区 · 上次登录 ' + time);
assert.strictEqual(cases.noId, '主账号 · 区服备注：微信区 · 上次登录 ' + time);
assert.strictEqual(cases.noNote, 'ID 778899 · 主账号 · 上次登录 ' + time);
assert.strictEqual(cases.serverWithoutNote, 'ID 778899 · 主账号 · 上次登录 ' + time);
assert.strictEqual(cases.minimum, '上次登录 ' + time);
assert.strictEqual(cases.zoneSummary, '');
assert.strictEqual(cases.gameId, '778899');
assert.strictEqual(cases.invalidGameId, '');
assert(!Object.values(cases).some(value => /区服未同步|区服未记录/.test(value)));
assert(!Object.values(cases).some(value => /(?:^| · ) · /.test(value)));

assert(main.includes("accountsView.className = 'accounts'"), 'custom account listbox is missing');
assert(main.includes("option.className = 'account-choice'"), 'account options are not full-row buttons');
assert(main.includes("option.setAttribute('role', 'option')"), 'account options are not accessible listbox options');
assert(main.includes('.accounts{display:block;width:100%;') && main.includes('padding:4px 0;'),
  'account list still reserves horizontal padding around selected rows');
assert(main.includes('.account-choice{display:block;width:100%;'), 'account choice does not span the full row');
assert(main.includes('.account-choice[aria-selected="true"]'), 'selected account has no full-row highlight');
assert(main.includes("if (gameId) detailLines.push('游戏内 ID：' + gameId)"),
  'account detail must omit an unknown game ID instead of showing a placeholder');
assert(!main.includes("'区服：' + (profile.serverId ||"),
  'account detail must not render the old server placeholder');

console.log(JSON.stringify({ok: true, cases}, null, 2));
