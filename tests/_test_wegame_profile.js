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
const hostContext = {
  currentProfileId: 'wegame:account-1', expectedProfileId: '', accountPhase: 'authorizing',
  Date, Number, String, Set, Object
};
vm.createContext(hostContext);
vm.runInContext(['liveAccountLabel', 'profileAccountLabel', 'profileZoneSummary', 'shortLoginTime']
  .map(name => functionSource(host, name)).join('\n'), hostContext);

const engine = fs.readFileSync('_direct_engine.js', 'utf8');
const engineContext = {
  page: {
    AccountInfo: {Self: {ServerId: 320023, Account: 'game-account', UserId: 778899}},
    UserData: {Self: {Nickname: '测试角色'}}
  },
  String, Object
};
vm.createContext(engineContext);
vm.runInContext(functionSource(engine, 'gameAuthFields'), engineContext);

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
  zoneKnown: hostContext.profileZoneSummary({...base, serverId: '320023'}),
  fields: engineContext.gameAuthFields()
};

const forbidden = /区服待返回|未打开|待登录/;
const allLabels = Object.entries(cases).filter(([name]) => name.startsWith('zone') || name === 'authorizing' ||
  name === 'saved' || name === 'loggedIn' || name === 'connected' || name === 'failed').map(([, value]) => String(value));
const ok = cases.authorizing === '正在登录' && cases.saved === '已授权' &&
  /^上次登录 \d\d\/\d\d \d\d:\d\d$/.test(cases.loggedIn) && cases.connected === '游戏已打开' &&
  cases.failed === '上次登录失败' && cases.zoneUnrecorded === '区服未记录' &&
  cases.zoneUnsynced === '区服未同步' && cases.zoneKnown === '区服 320023' &&
  cases.fields.serverId === '320023' && cases.fields.roleId === '778899' &&
  cases.fields.roleName === '测试角色' && cases.fields.loginAccount === 'game-account' &&
  allLabels.every(label => !forbidden.test(label));

console.log(JSON.stringify({ok, cases}, null, 2));
if (!ok) process.exit(1);
