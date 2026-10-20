const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const start = source.indexOf('const ChannelRegistry = (() => {');
const end = source.indexOf('})();', start) + '})();'.length;
if (start < 0 || end < 5) throw new Error('registry not found');
const context = {Object, Array, Set, Map, URL, JSON, console};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.__registry = ChannelRegistry;', context);
const registry = context.__registry;

let failures = 0;
const fail = message => { failures++; console.error('FAIL', message); };
const visible = registry.visibleChannels();
const visibleIds = new Set(visible.map(channel => channel.id));
if (visible.length !== 7) fail('expected 7 visible bridge channels, got ' + visible.length);
for (const id of ['4399', 'feihuo', 'shunwang', '2144', 'zixia', 'qqgame', '7k7k', 'baidu', '360']) {
  if (visibleIds.has(id)) fail('portal channel must not be visible: ' + id);
}
for (const capability of Object.values(registry.CAPABILITIES)) {
  for (const channel of registry.byCapability(capability)) {
    if (channel.authMode === 'portal') fail('byCapability leaked portal channel: ' + channel.id);
  }
}
const ids = new Set();
for (const channel of registry.channels) {
  if (ids.has(channel.id)) fail('duplicate channel id: ' + channel.id);
  ids.add(channel.id);
  if (!registry.isBrowser(channel)) fail(channel.id + ' is visible but not browser capable');
  if (!channel.loginOptions.length) fail(channel.id + ' has no login option');
  const optionIds = new Set(), signatures = new Set(), labels = new Set();
  for (const option of channel.loginOptions) {
    if (optionIds.has(option.id)) fail(channel.id + ' duplicate option id: ' + option.id);
    optionIds.add(option.id);
    if (labels.has(option.label)) fail(channel.id + ' duplicate label: ' + option.label);
    labels.add(option.label);
    const signature = [option.kind, option.mode || '', option.page || '', option.provider || ''].join('|');
    if (signatures.has(signature)) fail(channel.id + ' duplicate target: ' + signature);
    signatures.add(signature);
    if (option.kind === 'disabled') fail(channel.id + ' exposes disabled option: ' + option.id);
    if (typeof option.hint !== 'string' || !option.hint || option.hint.length > 24) {
      fail(channel.id + ' login hint is not concise: ' + option.id);
    }
  }
  console.log(channel.id + ' -> ' + channel.loginOptions.map(option => option.id).join(', '));
}
const wxHint = registry.get('wegame')?.loginOptions.find(option => option.id === 'wegame-wx')?.hint;
if (wxHint !== '显示微信官方二维码') fail('wechat login hint must be exactly 显示微信官方二维码');
if (registry.get('honor')) fail('honor channel must be removed');
for (const channelId of ['huawei', 'bilibili']) {
  const channel = registry.get(channelId);
  if (!channel) fail(channelId + ' channel is missing');
  if (channel.loginOptions.some(option => option.kind === 'official')) {
    fail(channelId + ' must not expose an official page without a game handoff bridge');
  }
  if (channel.loginOptions.length !== 1 || channel.loginOptions[0].kind !== 'direct') {
    fail(channelId + ' must expose only the verified direct login option');
  }
  if (channel.standardLoginMethods.some(method => /密码|短信/.test(method))) {
    fail(channelId + ' must not advertise unsupported password or SMS login');
  }
}
const steam = registry.get('steam');
const steamWeb = steam?.loginOptions.find(option => option.id === 'steam-web');
if (!steamWeb || steamWeb.mode !== 'browser' || !/账号密码/.test(steamWeb.label) ||
  !steamWeb.page.startsWith('https://store.steampowered.com/oauth/login?') ||
  !steamWeb.page.includes('{state}') || !steamWeb.page.includes('client_id=6730F3F4')) {
  fail('steam must expose the official browser OAuth entry with state binding');
}
const portal = registry.get('4399');
if (!portal || portal.loginOptions[0]?.page !== 'https://my.4399.com/yxsgs/') {
  fail('4399 must keep the official portal entry');
}
const portals = {
  feihuo: {id: 'feihuo-web', gameChannelId: 220005,
    page: 'https://www.feihuo.com/game/index/slug/xsgs'},
  shunwang: {id: 'shunwang-web', gameChannelId: 220021,
    page: 'https://sgs.swjoy.com/'},
  2144: {id: '2144-web', gameChannelId: 220044,
    page: 'https://web.2144.cn/hlsgs'},
  zixia: {id: 'zixia-web', gameChannelId: 220017,
    page: 'https://game.zixia.com/game-xsgs'},
  qqgame: {id: 'qqgame-web', gameChannelId: 120042,
    page: 'https://qqgame.qq.com/webappframe/?appid=10951'},
  '7k7k': {id: '7k7k-web', gameChannelId: 520131,
    page: 'https://h5.7k7k.com/game/960982bec2f555de44ea43ca8a7ef418'},
  baidu: {id: 'baidu-web', gameChannelId: 220003,
    page: 'https://wan.baidu.com/game?gameId=19793616'},
  360: {id: '360-web', gameChannelId: 220061,
    page: 'https://sgsszn.wan.360.cn/game_login.php'}
};
for (const [channelId, expected] of Object.entries(portals)) {
  const channel = registry.get(channelId);
  const option = channel?.loginOptions.find(item => item.id === expected.id);
  if (!channel || channel.authMode !== 'portal') fail(channelId + ' must use portal auth');
  if (channel?.gameChannelId !== expected.gameChannelId) fail(channelId + ' game channel mismatch');
  if (option?.kind !== 'portal' || option?.page !== expected.page) {
    fail(channelId + ' official portal page mismatch');
  }
  if (!option?.page.startsWith('https://')) fail(channelId + ' portal must use HTTPS');
}
if (failures) process.exit(1);
console.log('PASS visible=' + visible.length + ', registry=' + registry.channels.length + ', options=' +
  registry.channels.reduce((sum, channel) => sum + channel.loginOptions.length, 0));
