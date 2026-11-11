'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('_direct_engine.js', 'utf8');
const CHOICE_HELPERS = ['choiceText', 'choiceIdSuffix', 'choiceTime'];

function extract(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].lastIndexOf('{');
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

function failure(code, stage) {
  return Object.assign(new Error(code), {code, stage});
}

function fields(value, keys, stage) {
  const result = {};
  for (const key of keys) {
    const item = value?.[key];
    if ((typeof item !== 'string' && typeof item !== 'number') || String(item).length === 0) {
      throw failure('RESPONSE_SCHEMA_CHANGED', stage);
    }
    result[key] = String(item);
  }
  return result;
}

function success(value, stage) {
  if (!value || value.code !== 0) throw failure('OFFICIAL_REJECTED', stage);
  return value;
}

function load(names) {
  const context = {
    Date, Number, String, Object, Array, Promise, JSON, Set, Map,
    assert: (ok, code, stage) => { if (!ok) throw failure(code, stage); },
    failure, fields, success, active: () => {}, reportDiagnostic: () => {},
    setBrowserNotice: (attempt, text) => { attempt.browserNotice = text; },
    cancelFlow: () => false, attempt: null
  };
  vm.createContext(context);
  vm.runInContext('let accountChoice = null;\n' + names.map(extract).join('\n') +
    '\nthis.api={' + names.join(',') + '};', context);
  return {api: context.api, context};
}

function oppoValue(accounts) {
  return {code: 200, ticket: 'OPPO-TICKET', userDto: {userId: 'OWNER-1'}, gameAccounts: accounts};
}

function oppoAccount(id, changes = {}) {
  return {id, accountName: '角色 ' + id, userId: 'OWNER-1', pkgName: 'com.sgs10th.nearme.gamecenter',
    accountSharingTag: 0, needFaceScan: false, needLoginPop: false,
    accountIsProtected: false, tradeLimit: false, ...changes};
}

function vivoValue(accounts) {
  return {code: 0, data: {nickName: 'Vivo 主账号', openId: 'PARENT', subAccounts: accounts},
    extraData: {minor: false, forceNative: false}, extraInfo: 'EXTRA'};
}

async function main() {
  {
    const {api} = load([...CHOICE_HELPERS, 'chooseAccount']);
    const id = await api.chooseAccount({clientToken: 'a'.repeat(32)},
      {accounts: [{id: 'ONLY-SAFE', name: '唯一角色'}]});
    assert.strictEqual(id, 'ONLY-SAFE', 'one usable account must auto-select');
  }

  {
    const {api, context} = load(['accountChoiceCancelled', 'dismissAccountChoice']);
    let cleaned = 0, rejected = null;
    context.cleanup = () => { cleaned += 1; };
    context.reject = error => { rejected = error; };
    vm.runInContext('accountChoice={cleanup,reject};', context);
    assert.strictEqual(api.dismissAccountChoice(), true, 'active chooser must be dismissed');
    assert.strictEqual(cleaned, 1, 'dismissal must remove the chooser UI exactly once');
    assert.strictEqual(rejected?.code, 'LOGIN_CANCELLED');
    assert.strictEqual(rejected?.stage, 'account_choice');
    assert.strictEqual(api.dismissAccountChoice(), false, 'dismissal must be idempotent');
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    const value = oppoValue([
      {...oppoAccount('SGS-ONE'), lastLogin: true},
      {id: 'OTHER-GAME', pkgName: 'com.example.other', userId: 'OWNER-1'}
    ]);
    const choice = api.oppoGameAccountChoices(value);
    assert.strictEqual(choice.accounts.length, 1, 'non-SGS packages must be ignored');
    assert.strictEqual(choice.token, 'OPPO-TICKET');
    assert.strictEqual(choice.accounts[0].name, '角色 SGS-ONE');
    assert.strictEqual(choice.accounts[0].lastLogin, '最近登录');
    assert(!choice.accounts[0].meta.includes('SGS-ONE'), 'full SSO id must not be displayed');
    assert(/••••/.test(choice.accounts[0].meta), 'masked SSO id suffix is required');
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    const choice = api.oppoGameAccountChoices(oppoValue([oppoAccount('OPPO-AAA'), oppoAccount('OPPO-BBB')]));
    assert.strictEqual(choice.accounts.length, 2);
    assert.notStrictEqual(choice.accounts[0].meta, choice.accounts[1].meta);
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    const value = oppoValue([oppoAccount('NUMERIC-ACCOUNT', {userId: 123456789})]);
    value.userDto.userId = 123456789;
    const choice = api.oppoGameAccountChoices(value);
    assert.strictEqual(choice.accounts.length, 1, 'numeric OPPO owner ids must compare by value');
  }

  for (const pkgName of [undefined, null, '', '   ']) {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    const choice = api.oppoGameAccountChoices(oppoValue([
      oppoAccount('SCOPED-BY-REQUEST', {pkgName})
    ]));
    assert.strictEqual(choice.accounts.length, 1,
      'an absent package name inherits the pkgName-scoped OPPO request');
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    assert.throws(() => api.oppoGameAccountChoices(oppoValue([null, undefined])),
      error => error.message === 'OPPO_GAME_PACKAGE_MISMATCH',
      'empty game-account entries must be ignored, not crash');
    assert.throws(() => api.oppoGameAccountChoices(oppoValue([
      oppoAccount('BAD-TYPE', {pkgName: 1})
    ])), error => error.message === 'OPPO_GAME_PACKAGE_MISMATCH',
    'non-string package names must not inherit the request scope');
  }

  {
    const {api, context} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices', 'oppoGameCredentials']);
    let spec = null;
    context.chooseAccount = async (_attempt, value) => { spec = value; return value.accounts[1].id; };
    vm.runInContext('this.chooseAccount = chooseAccount;', context);
    const credentials = await api.oppoGameCredentials({clientToken: 'b'.repeat(32)},
      oppoValue([oppoAccount('FIRST'), oppoAccount('SECOND')]));
    assert.strictEqual(credentials.ssoid, 'SECOND', 'selected OPPO account must become ssoid');
    assert.strictEqual(credentials.token, 'OPPO-TICKET');
    assert.strictEqual(credentials.accountName, '角色 SECOND');
    assert.strictEqual(spec.accounts.length, 2);
  }

  {
    const calls = [];
    let selected = 'SECOND';
    const {api, context} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices', 'oppoGameCredentials',
      'exchangeOppoGameAccount', 'exchangeOppoGrant']);
    context.console = console;
    context.CONFIG = {TD_SDK_APP_ID: 'TD-SDK'};
    context.oppoSDKHeaders = () => ({});
    context.transport = async () => ({responseText: JSON.stringify(oppoValue([
      oppoAccount('FIRST'), oppoAccount('SECOND')
    ]))});
    context.chooseAccount = async () => selected;
    context.json = async (_attempt, stage, _url, payload) => {
      calls.push({stage, payload});
      if (stage === 'sgs_session') return {code: 0, data: {session: 'SGS-SESSION'}};
      if (stage === 'sgs_grant') return {code: 0, data: {
        account: 'SGS-' + selected, token: 'GAME-TOKEN', sign: 'GAME-SIGN', timestamp: 1
      }};
      throw failure('UNEXPECTED_STAGE', stage);
    };
    context.queryURL = (base, params) => base + '?' + Object.entries(params)
      .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
    context.validateGrant = value => value;
    vm.runInContext('Object.assign(this,{transport,json,queryURL,validateGrant,chooseAccount,' +
      'oppoSDKHeaders,CONFIG});', context);

    for (const ssoid of ['SECOND', 'FIRST']) {
      selected = ssoid;
      const attempt = {provider: 'oppo', stage: 'setup', device: 'oppo-device',
        oppoAccount: {accountToken: 'OPPO-ACCOUNT-TOKEN'}};
      attempt.oppo = await api.exchangeOppoGameAccount(attempt);
      const grant = await api.exchangeOppoGrant(attempt);
      const sessionCall = calls.filter(call => call.stage === 'sgs_session').at(-1);
      assert.strictEqual(sessionCall.payload.data.uid, ssoid,
        'selected OPPO ssoid must be the AnySDK uid');
      assert.strictEqual(sessionCall.payload.data.session, 'OPPO-TICKET');
      assert.strictEqual(attempt.oppo.ssoid, ssoid);
      assert.strictEqual(attempt.oppo.credentialType, 'game-ticket');
      assert.strictEqual(grant.account, 'SGS-' + ssoid,
        'different selected roles must reach different final game accounts');
    }
  }

  for (const [name, value, code] of [
    ['non-SGS only', oppoValue([{id: 'X', pkgName: 'com.example.other', userId: 'OWNER-1'}]), 'OPPO_GAME_PACKAGE_MISMATCH'],
    ['owner mismatch', oppoValue([oppoAccount('X', {userId: 'OTHER'})]), 'OPPO_GAME_ACCOUNT_OWNER_MISMATCH'],
    ['unsafe account', oppoValue([oppoAccount('X', {needFaceScan: true})]), 'OPPO_GAME_ACCOUNT_CONFIRMATION_REQUIRED']
  ]) {
    const {api} = load([...CHOICE_HELPERS, 'oppoGameAccountChoices']);
    assert.throws(() => api.oppoGameAccountChoices(value), error => error.message === code, name);
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'vivoAccountChoices']);
    const realName = {data: {accountRealName: true}};
    const choices = api.vivoAccountChoices(vivoValue([
      {subOpenId: 'SUB-ONE', nickName: '大号', subRole: '主角色', subLevel: 80,
        lastLoginAtString: '2026/11/01 10:00', frozenFlag: false},
      {subOpenId: 'SUB-TWO', nickName: '小号', lastLogin: true, frozenFlag: false},
      {subOpenId: 'FROZEN', nickName: '冻结号', frozenFlag: true}
    ]), realName);
    assert.strictEqual(choices.length, 2, 'frozen Vivo subaccounts must not be offered');
    assert.strictEqual(choices[0].lastLogin, '2026/11/01 10:00');
    assert.strictEqual(choices[1].lastLogin, '最近登录');
    assert(choices.every(choice => !choice.meta.includes(choice.id)), 'Vivo subOpenId must be masked');
  }

  {
    const {api} = load([...CHOICE_HELPERS, 'vivoAccountChoices']);
    const realName = {data: {accountRealName: true}};
    assert.throws(() => api.vivoAccountChoices(vivoValue([
      {subOpenId: 'FROZEN', frozenFlag: true}
    ]), realName), error => error.message === 'VIVO_ACCOUNT_UNAVAILABLE');
    assert.throws(() => api.vivoAccountChoices(vivoValue([]), realName),
      error => error.message === 'VIVO_ACCOUNT_SELECTION_REQUIRED');
    assert.throws(() => api.vivoAccountChoices(vivoValue([{subOpenId: 'SUB'}]),
      {data: {accountRealName: false}}), error => error.message === 'VIVO_REAL_NAME_REQUIRED');
  }

  {
    const calls = [];
    const {api, context} = load([...CHOICE_HELPERS,
      'vivoAccountChoices', 'vivoAccountChoice', 'exchangeVivo']);
    context.VIVO_PACKAGE = 'com.yoka.sgstenth.vivo';
    context.chooseAccount = async () => 'SUB-TWO';
    context.vivoUnion = async (_attempt, path, values, post) => {
      calls.push({path, values, post});
      if (path === '/h5/union/get') return {code: 0, data: {nickName: 'Vivo 主账号', openId: 'PARENT',
        subAccounts: [
          {subOpenId: 'SUB-ONE', nickName: '大号', lastLogin: true, frozenFlag: false},
          {subOpenId: 'SUB-TWO', nickName: '小号', lastLogin: false, frozenFlag: false}
        ]}, extraData: {minor: false, forceNative: false}, extraInfo: 'EXTRA'};
      if (path === '/h5/account/realName') return {code: 0, data: {accountRealName: true}};
      if (path === '/h5/union/use') return {code: 0, data: 'NEW-OPEN-TOKEN',
        extraData: {minor: false, forceNative: false}, noticeData: null, vipRecall: 0};
      throw failure('UNEXPECTED_PATH', 'vivo_account');
    };
    context.json = async (_attempt, stage) => {
      if (stage === 'sgs_session') return {code: 0, data: {session: 'SGS-SESSION'}};
      if (stage === 'sgs_grant') return {code: 0, data: {account: 'vivo-account'}};
      throw failure('UNEXPECTED_STAGE', stage);
    };
    context.queryURL = (base, params) => base + '?' + new URLSearchParams(params).toString();
    context.validateGrant = value => value;
    context.remember = attempt => calls.push({path: 'remember', uid: attempt.vivo.uid});
    vm.runInContext('Object.assign(this,{chooseAccount,vivoUnion,json,queryURL,validateGrant,remember});', context);
    const attempt = {provider: 'vivo', mode: 'qr', device: 'vivo-device', clientToken: 'c'.repeat(32),
      expires: Date.now() + 600000, vivoConfirmed: true, vivoAuthorized: true,
      cookies: {clear() {}}, requests: new Set()};
    await api.exchangeVivo(attempt);
    const used = calls.find(call => call.path === '/h5/union/use');
    assert(used && used.post === true, 'selected Vivo UID must be sent through union/use');
    assert.strictEqual(used.values.subOpenId, 'SUB-TWO');
    assert.strictEqual(attempt.vivo.uid, 'SUB-TWO');
    assert.strictEqual(attempt.vivo.session, 'NEW-OPEN-TOKEN');
    assert.strictEqual(attempt.vivo.accountName, '小号');
    assert.strictEqual(calls.some(call => call.path === 'remember'), false,
      'fresh Vivo grant must wait for the host to bind the selected subaccount profile');
  }

  {
    const {api} = load(['selectedSubaccount']);
    const oppo = api.selectedSubaccount({provider: 'oppo', oppo: {ssoid: 'OPPO-SUB', accountName: 'OPPO 小号'}});
    const vivo = api.selectedSubaccount({provider: 'vivo', vivo: {uid: 'VIVO-SUB', accountName: 'Vivo 小号'}});
    assert.strictEqual(oppo.id, 'OPPO-SUB');
    assert.strictEqual(oppo.name, 'OPPO 小号');
    assert.strictEqual(vivo.id, 'VIVO-SUB');
    assert.strictEqual(vivo.name, 'Vivo 小号');
  }

  assert(!/\.innerHTML\b/.test(source.slice(source.indexOf('function chooseAccount'), source.indexOf('function emitDirectEvent'))),
    'account selector must use textContent, not innerHTML');
  console.log(JSON.stringify({ok: true, checks: 37}, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
