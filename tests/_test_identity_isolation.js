'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', '三国杀多渠道登录.user.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const signature = source.indexOf(') {', start);
  const body = source.indexOf('{', signature >= 0 ? signature : start);
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

const runtime = [
  'gameField', 'gameIdentityReady', 'gameIdentityFromEvent', 'accountIdentityKey',
  'normalizedIdentityValue', 'normalizedAccountValue', 'profileGameId', 'profileChannel',
  'gameIdentityBinding', 'resolveGameIdentityProfile', 'profileName', 'updateAccountHeading',
  'applyGameIdentity'
].map(name => extractFunction(main, name)).join('\n');

function harness(profile, options = {}) {
  const updates = [];
  const logs = [];
  const statuses = [];
  const collapses = [];
  const session = new Map();
  if (options.sessionProfileId) session.set('sgs-vivo-account-context', options.sessionProfileId);
  const channel = {
    id: 'vivo', name: 'Vivo', shortName: 'Vivo服', accountLabel: 'Vivo账号',
    contextPrefix: 'sgs-vivo', accountPrefix: 'sgs-vivo-', windowPrefix: 'sgs-vivo'
  };
  const sandbox = {
    CHANNEL: channel,
    ACCOUNT_CONTEXT: 'sgs-vivo-account-context',
    ChannelRegistry: {get: id => id === channel.id ? channel : null},
    currentProfileId: options.currentProfileId || null,
    expectedProfileId: options.expectedProfileId || null,
    verifiedProfileId: options.verifiedProfileId || null,
    selectedProfileId: '', selectedProfileChannelId: 'vivo',
    gameIdentityCache: null, gameIdentityAppliedSignature: '',
    accountPhase: options.accountPhase || 'waiting',
    ownerName: 'sgs-vivo-manager-test',
    currentAccountNode: {textContent: ''},
    document: {title: options.title || '[Vivo服 · 旧角色] 三国杀一将成名'},
    window: {name: 'sgs-vivo-profile-old'},
    location: {pathname: '/login/10th_client/index.html'},
    sessionStorage: {
      getItem: key => session.has(key) ? session.get(key) : null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: key => session.delete(key)
    },
    accounts: {
      profiles: () => [profile],
      get: id => id === profile.id ? profile : null,
      label: value => value.alias || value.roleName || value.id,
      update(id, changes) {
        updates.push({id, changes: {...changes}});
        Object.assign(profile, changes);
        return profile;
      }
    },
    profileById(id, channelId) {
      return id === profile.id && (!channelId || channelId === channel.id) ? profile : null;
    },
    setAccountPhase(phase) { sandbox.accountPhase = phase; },
    selectProfile(value) {
      sandbox.selectedProfileId = value.id;
      sandbox.selectedProfileChannelId = value.channelId;
    },
    saveLoginInfoEnabled: () => true,
    transientProfileMatches: () => false,
    updateTransientProfile() { throw new Error('persisted identity must not use transient storage'); },
    renderAccounts() {}, heartbeat() {},
    markGameLoginSession() {},
    autoCollapseForLogin(reason, stage, meta) { collapses.push({reason, stage, meta}); return true; },
    feedbackLog: {
      add(level, message, meta) { logs.push({level, message, meta}); }
    },
    status(message) { statuses.push(message); },
    diagnosticMeta(extra) { return {version: 'test', channelId: 'vivo', ...extra}; },
    Object, Set, Date, String, Number
  };
  vm.createContext(sandbox);
  vm.runInContext(runtime, sandbox);
  sandbox.apply = identity => {
    sandbox.identity = identity;
    vm.runInContext('this.result = applyGameIdentity(gameIdentityFromEvent(identity), {source: "test_probe"});', sandbox);
    return sandbox.result;
  };
  return {sandbox, profile, updates, logs, statuses, collapses, session};
}

const staleVivo = () => ({
  id: 'vivo:account-1', channelId: 'vivo', roleId: '654321', roleName: '旧Vivo角色',
  serverId: '320056', loginAccount: 'vivo-old', channelAccount: 'vivo-channel'
});
const official = {
  serverId: '1001', roleId: '987654', roleName: '官服角色',
  loginAccount: 'official-login', channelAccount: 'official-channel'
};

// A restored Vivo selection followed by official login must never overwrite it.
{
  const box = harness(staleVivo(), {expectedProfileId: 'vivo:account-1', sessionProfileId: 'vivo:account-1'});
  assert.strictEqual(box.sandbox.apply(official), true);
  assert.strictEqual(box.updates.length, 0, 'official identity was written into the stale Vivo account');
  assert.strictEqual(box.profile.roleId, '654321');
  assert.strictEqual(box.sandbox.currentProfileId, null);
  assert.strictEqual(box.sandbox.expectedProfileId, null);
  assert.strictEqual(box.sandbox.verifiedProfileId, null);
  assert.strictEqual(box.session.has('sgs-vivo-account-context'), false, 'stale context was not cleared');
  assert.strictEqual(box.sandbox.document.title, '三国杀一将成名', 'stale Vivo label remained in tab title');
  assert(box.logs.some(item => item.level === 'warning' && item.meta.stage === 'game_identity_conflict'));
  assert(box.statuses.some(item => /阻止写入账号管理/.test(item)));
}

// The same account after reload may still be re-associated from exact role evidence.
{
  const box = harness(staleVivo(), {expectedProfileId: 'vivo:account-1', sessionProfileId: 'vivo:account-1'});
  assert.strictEqual(box.sandbox.apply({...official, roleId: '654321', roleName: 'Vivo新角色',
    loginAccount: 'vivo-old', channelAccount: 'vivo-channel'}), true);
  assert.strictEqual(box.updates.length, 1, 'matching Vivo identity was not written');
  assert.strictEqual(box.profile.roleId, '654321');
  assert.strictEqual(box.profile.roleName, 'Vivo新角色');
  assert.strictEqual(box.sandbox.verifiedProfileId, 'vivo:account-1');
  assert.strictEqual(box.session.get('sgs-vivo-account-context'), 'vivo:account-1');
  assert(/^\[Vivo服 · Vivo新角色\]/.test(box.sandbox.document.title), box.sandbox.document.title);
}

// Back/bfcache can preserve the in-memory current binding, so conflict checks
// must also run against a verified current binding.
{
  const box = harness(staleVivo(), {
    currentProfileId: 'vivo:account-1', expectedProfileId: 'vivo:account-1',
    verifiedProfileId: 'vivo:account-1', sessionProfileId: 'vivo:account-1'
  });
  assert.strictEqual(box.sandbox.apply(official), true);
  assert.strictEqual(box.updates.length, 0, 'stale in-memory binding accepted another game account');
  assert.strictEqual(box.sandbox.verifiedProfileId, null);
  assert.strictEqual(box.sandbox.document.title, '三国杀一将成名');
}

// A newly authorized account may have no role ID yet; an explicit verified
// binding from this document is still allowed to receive its first game data.
{
  const fresh = {id: 'vivo:account-1', channelId: 'vivo', roleId: '', roleName: '', serverId: ''};
  const box = harness(fresh, {
    currentProfileId: 'vivo:account-1', expectedProfileId: 'vivo:account-1',
    verifiedProfileId: 'vivo:account-1'
  });
  assert.strictEqual(box.sandbox.apply({roleId: '123456', roleName: '新角色', serverId: '320056',
    loginAccount: 'vivo-login', channelAccount: 'channel-7'}), true);
  assert.strictEqual(box.updates.length, 1, 'verified fresh account did not receive game identity');
  assert.strictEqual(box.profile.roleId, '123456');
}

// Partial identity data must not authorize a restored selection by itself.
{
  const box = harness(staleVivo(), {expectedProfileId: 'vivo:account-1', sessionProfileId: 'vivo:account-1'});
  assert.strictEqual(box.sandbox.apply({roleName: '只返回角色名'}), true);
  assert.strictEqual(box.updates.length, 0, 'insufficient identity evidence was accepted');
  assert.strictEqual(box.sandbox.verifiedProfileId, null);
  assert.strictEqual(box.sandbox.document.title, '三国杀一将成名');
}

assert(!extractFunction(main, 'resolveGameIdentityProfile').includes('sessionStorage'),
  'identity resolution must not read the restored tab context');
assert(!extractFunction(main, 'resolveGameIdentityProfile').includes('window.name'),
  'identity resolution must not treat window.name as proof of identity');
const bridgeStart = main.indexOf("if (kind === 'user-data')");
const bridgeBlock = main.slice(bridgeStart, bridgeStart + 1800);
assert(bridgeStart >= 0 && bridgeBlock.includes('applyGameIdentity'),
  'game bridge role data does not use the shared identity gate');
assert(!bridgeBlock.includes('roleId: extra.roleId'),
  'game bridge still writes role identity directly');
const directStart = main.indexOf("if (event.type === 'game-auth')");
const directBlock = main.slice(directStart, directStart + 2400);
assert(directStart >= 0 && directBlock.includes('gameIdentityBinding'),
  'direct game-auth path does not verify the selected account');
assert(!directBlock.includes('currentProfileId || expectedProfileId'),
  'direct game-auth path still trusts a restored preselection');

console.log(JSON.stringify({ok: true, scenarios: 5}, null, 2));
