'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const hostSource = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const engineSource = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(source, name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error(name + ' not found');
  const signatureStart = match.index + match[0].lastIndexOf('(');
  let parens = 0, signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    if (source[index] === '(') parens += 1;
    else if (source[index] === ')') {
      parens -= 1;
      if (parens === 0) { signatureEnd = index; break; }
    }
  }
  if (signatureEnd < 0) throw new Error(name + ' signature is incomplete');
  const start = source.indexOf('{', signatureEnd);
  if (start < 0) throw new Error(name + ' body is missing');
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(name + ' is incomplete');
}

const channel = {id: 'oppo', name: 'OPPO', shortName: 'OPPO服', accountLabel: 'OPPO账号',
  accountPrefix: 'sgs-oppo-'};
const channelFor = id => id === channel.id ? channel : null;
const profiles = [];
const context = {
  CHANNEL: channel,
  ChannelRegistry: {channels: [channel], get: channelFor},
  channelFor,
  accounts: {profiles: () => profiles},
  profileById: (id, channelId) => profiles.find(profile => profile.id === id &&
    (!channelId || profile.channelId === channelId)) || null,
  Object, Array, Date, String, Number, Promise, JSON, Set, Map,
  encodeURIComponent
};
vm.createContext(context);
const hostRuntime = [
  'stableDirectKey', 'stableDirectProfileKey', 'accountIdentityKey', 'sameAccountIdentity',
  'directProfileBinding', 'createAccountStore'
].map(name => extract(hostSource, name)).join('\n');
vm.runInContext(hostRuntime + '\nthis.api={' + [
  'stableDirectKey', 'stableDirectProfileKey', 'accountIdentityKey', 'sameAccountIdentity',
  'directProfileBinding', 'createAccountStore'
].join(',') + '};', context);
const api = context.api;

function resetProfiles(...values) {
  profiles.splice(0, profiles.length, ...values);
}

function storage() {
  const values = new Map();
  return {
    get: (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value),
    remove: key => values.delete(key),
    keys: () => values.keys(),
    values
  };
}

function main() {
  const first = api.directProfileBinding({subaccountId: 'OPPO-SUB-FIRST'}, 'SAME-GRANT');
  const second = api.directProfileBinding({subaccountId: 'OPPO-SUB-SECOND'}, 'SAME-GRANT');
  assert(!first.conflict && !second.conflict);
  assert(first.providerKey && second.providerKey, 'subaccount fingerprints are required');
  assert.notStrictEqual(first.id, second.id,
    'different subaccounts must not share a profile when grant.account is identical');
  assert.notStrictEqual(first.providerKey, second.providerKey,
    'different subaccounts must have different fingerprints');
  assert(/^oppo:sub:[a-f0-9]{16}$/.test(first.id), 'provider profile ids must be bounded and opaque');
  assert.strictEqual(api.directProfileBinding({subaccountId: 'OPPO-SUB-FIRST'}, 'SAME-GRANT').id,
    first.id, 'the same subaccount must keep the same profile id');

  resetProfiles(
    {id: first.id, channelId: 'oppo', providerKey: first.providerKey, loginAccount: 'SAME-GRANT'},
    {id: second.id, channelId: 'oppo', providerKey: second.providerKey, loginAccount: 'SAME-GRANT'});
  assert.strictEqual(api.directProfileBinding({subaccountId: 'OPPO-SUB-FIRST'}, 'SAME-GRANT').id,
    first.id, 'provider identity lookup must survive a shared grant account');
  assert.strictEqual(api.directProfileBinding({subaccountId: 'OPPO-SUB-SECOND'}, 'SAME-GRANT').id,
    second.id, 'the second subaccount must resolve to its own profile');

  const wrong = api.directProfileBinding({subaccountId: 'OPPO-SUB-SECOND'}, 'SAME-GRANT', first.id);
  assert.strictEqual(wrong.conflict, true, 'selecting one subaccount then authorizing another must be blocked');
  const right = api.directProfileBinding({subaccountId: 'OPPO-SUB-FIRST'}, 'SAME-GRANT', first.id);
  assert.strictEqual(right.conflict, false, 'the selected subaccount must still be allowed');
  assert.strictEqual(right.id, first.id);

  const legacy = {id: 'oppo:LEGACY', channelId: 'oppo', loginAccount: 'LEGACY-GRANT'};
  resetProfiles(legacy);
  const adopted = api.directProfileBinding({subaccountId: 'LEGACY-SUB'}, 'LEGACY-GRANT', 'oppo:LEGACY');
  assert.strictEqual(adopted.conflict, false, 'a selected pre-1.4.4 profile may be upgraded in place');
  assert.strictEqual(adopted.id, 'oppo:LEGACY');
  assert(adopted.providerKey, 'upgraded profile must obtain a provider fingerprint');
  legacy.providerKey = adopted.providerKey;
  const other = api.directProfileBinding({subaccountId: 'OTHER-SUB'}, 'LEGACY-GRANT', 'oppo:LEGACY');
  assert.strictEqual(other.conflict, true, 'an upgraded legacy profile must reject another subaccount');

  resetProfiles();
  const plain = api.directProfileBinding({}, 'RAW-ACCOUNT');
  assert.strictEqual(plain.id, 'oppo:RAW-ACCOUNT', 'channels without subaccount ids keep legacy ids');
  assert.strictEqual(plain.conflict, false);
  const xiaomi = api.directProfileBinding({identityAccount: 'XIAOMI-ID'}, 'RAW-ACCOUNT', 'oppo:OTHER');
  assert.strictEqual(xiaomi.id, 'XIAOMI-ID');
  assert.strictEqual(xiaomi.conflict, true, 'non-subaccount identity mismatches remain blocked');

  const long = api.directProfileBinding({subaccountId: 'x'.repeat(5000)}, 'RAW-ACCOUNT');
  assert(/^oppo:sub:[a-f0-9]{16}$/.test(long.id), 'oversized provider ids must be hashed');

  const values = storage();
  let windowId = 0;
  const store = api.createAccountStore(values, () => 1000, () => 'window-' + (++windowId), 'oppo');
  store.register({id: first.id, nickname: 'first', providerKey: first.providerKey});
  store.register({id: second.id, nickname: 'second', providerKey: second.providerKey});
  store.update(first.id, {loginAccount: 'SAME-GRANT'}, false, 'oppo');
  store.update(second.id, {loginAccount: 'SAME-GRANT'}, false, 'oppo');
  const saved = store.profiles(false);
  assert.strictEqual(saved.length, 2, 'two subaccounts with one grant account must remain two records');
  assert.strictEqual(saved.find(profile => profile.id === first.id).providerKey, first.providerKey);
  assert.strictEqual(saved.find(profile => profile.id === second.id).providerKey, second.providerKey);

  const engineContext = {Object, Array, String};
  vm.createContext(engineContext);
  vm.runInContext(extract(engineSource, 'selectedSubaccount') + '\nthis.api=selectedSubaccount;', engineContext);
  const oppo = engineContext.api({provider: 'oppo', oppo: {ssoid: 'OPPO-SUB', accountName: 'OPPO子账号'}});
  const vivo = engineContext.api({provider: 'vivo', vivo: {uid: 'VIVO-SUB', accountName: 'Vivo子账号'}});
  assert.strictEqual(oppo.id, 'OPPO-SUB');
  assert.strictEqual(oppo.name, 'OPPO子账号');
  assert.strictEqual(vivo.id, 'VIVO-SUB');
  assert.strictEqual(vivo.name, 'Vivo子账号');
  assert(engineSource.includes('subaccountId: subaccount.id'), 'ready event must carry the selected subaccount id');
  assert(hostSource.includes('providerKey: binding.providerKey'), 'host must persist the provider fingerprint');
  assert(hostSource.includes('directProfileBinding(event, account, expectedProfileId)'),
    'ready handling must compare the authorized subaccount with the selected profile');
  assert(hostSource.includes("cancel?.(eventToken, 'account_mismatch')"),
    'a ready-event profile conflict must cancel the engine before it can persist credentials');
  const reset = extract(hostSource, 'prepareCurrentWindowForNewAccount');
  assert(/currentProfileId\s*=\s*expectedProfileId\s*=\s*verifiedProfileId\s*=\s*null/.test(reset),
    'adding a sibling subaccount must clear the previous profile binding');
  assert(reset.includes("removeItem('sgs-direct-profile-v1')"),
    'adding a sibling subaccount must clear the pending direct-login profile');
  assert(/if \(a\.restored\) remember\(a\);/.test(engineSource),
    'fresh OPPO/Vivo grants must defer session persistence until the host binds the profile');
  assert(/const fallbackProfileId = a\.restored \?/.test(engineSource),
    'a fresh ready event must not fall back to a stale preselected profile');

  console.log(JSON.stringify({ok: true, checks: 28,
    firstProfile: first.id, secondProfile: second.id, records: saved.length}, null, 2));
}

main();
