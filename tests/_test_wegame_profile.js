const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function functionSource(source, name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].length - 1;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(name + ' is incomplete');
}

const host = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
assert(!/AccountInfo\.Self\.UserId/.test(host), 'Xiaomi injection must not use AccountInfo.Self.UserId');
assert(host.includes('const u=UserData.Self||{}'), 'Xiaomi injection must read UserData.Self');
assert(host.includes('b.userID'), 'Xiaomi injection must read UserBrief.userID');
const hostContext = {
  currentProfileId: 'wegame:account-1', expectedProfileId: '', accountPhase: 'authorizing',
  Date, Number, String, Set, Object
};
vm.createContext(hostContext);
vm.runInContext(['liveAccountLabel', 'profileLiveState', 'profileAccountLabel', 'profileZoneSummary',
  'profileGameId', 'shortLoginTime', 'profileListText']
  .map(name => functionSource(host, name)).join('\n'), hostContext);

const engine = fs.readFileSync('_direct_engine.js', 'utf8');
const engineContext = {
  page: {
    AccountInfo: {Self: {SeverID: 320023, Account: 'game-account', UserId: 111}},
    UserData: {Self: {UserBrief: {userID: 778899, nickname: '测试角色'}}}
  },
  String, Object
};
vm.createContext(engineContext);
vm.runInContext(functionSource(engine, 'gameAuthFields'), engineContext);

const legacyContext = {
  page: {AccountInfo: {Self: {SeverID: 320023, UserId: 222}}, UserData: {Self: {Nickname: '旧字段角色'}}},
  String, Object
};
vm.createContext(legacyContext);
vm.runInContext(functionSource(engine, 'gameAuthFields'), legacyContext);

const now = Date.UTC(2026, 9, 20, 12, 34);
const base = {id: 'wegame:account-1', channelId: 'wegame', lastAuthorizedAt: now - 5000};
const cases = {
  authorizing: hostContext.profileAccountLabel(base, []),
  saved: hostContext.profileAccountLabel({...base, id: 'wegame:saved'}, []),
  loggedIn: hostContext.profileAccountLabel({...base, id: 'wegame:saved', lastLoginAt: now}, []),
  connected: hostContext.profileAccountLabel(base, ['connected', 'loading']),
  failed: hostContext.profileAccountLabel({...base, id: 'wegame:saved'}, ['failed']),
  zoneUnrecorded: hostContext.profileZoneSummary(base),
  zoneUnsynced: hostContext.profileZoneSummary({...base, lastLoginAt: now}),
  zoneServerNoNote: hostContext.profileZoneSummary({...base, serverId: '320023'}),
  zoneNote: hostContext.profileZoneSummary({...base, zoneNote: '微信区'}),
  gameId: hostContext.profileGameId({...base, roleId: '778899'}),
  listFull: hostContext.profileListText({...base, id: 'wegame:list', roleId: '778899', zoneNote: '微信区', lastLoginAt: now}, '游戏账号'),
  listNoId: hostContext.profileListText({...base, id: 'wegame:list', zoneNote: '微信区', lastLoginAt: now}, '游戏账号'),
  listNoNote: hostContext.profileListText({...base, id: 'wegame:list', roleId: '778899', lastLoginAt: now}, '游戏账号'),
  listNoEmptyParts: hostContext.profileListText({...base, id: 'wegame:list', lastLoginAt: now}, ''),
  fields: engineContext.gameAuthFields(),
  legacyFields: legacyContext.gameAuthFields()
};

const forbidden = /区服待返回|未打开|待登录/;
const allLabels = Object.entries(cases).filter(([name]) => !['fields', 'legacyFields'].includes(name))
  .map(([, value]) => String(value));
const loginTime = hostContext.shortLoginTime(now);
const ok = cases.authorizing === '正在登录' && cases.saved === '已授权' &&
  /^上次登录 \d\d\/\d\d \d\d:\d\d$/.test(cases.loggedIn) && cases.connected === '游戏已打开' &&
  cases.failed === '上次登录失败' && cases.zoneUnrecorded === '' &&
  cases.zoneUnsynced === '' && cases.zoneServerNoNote === '' && cases.zoneNote === '区服备注：微信区' &&
  cases.gameId === '778899' &&
  cases.listFull === 'ID 778899 · 游戏账号 · 区服备注：微信区 · 上次登录 ' + loginTime &&
  cases.listNoId === '游戏账号 · 区服备注：微信区 · 上次登录 ' + loginTime &&
  cases.listNoNote === 'ID 778899 · 游戏账号 · 上次登录 ' + loginTime &&
  cases.listNoEmptyParts === '上次登录 ' + loginTime &&
  cases.fields.serverId === '320023' && cases.fields.roleId === '778899' &&
  cases.fields.roleName === '测试角色' && cases.fields.loginAccount === 'game-account' &&
  cases.legacyFields.roleId === '222' && cases.legacyFields.roleName === '旧字段角色' &&
  allLabels.every(label => !forbidden.test(label) && !/(?:^| · ) · (?: · |$)/.test(label));

console.log(JSON.stringify({ok, cases}, null, 2));
if (!ok) process.exit(1);
