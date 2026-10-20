const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const connects = new Set([...source.matchAll(/^\/\/ @connect\s+(\S+)/gm)].map(match => match[1]));
if (!source.includes('// @match        https://passport.vivo.com.cn/*')) {
  console.error('FAIL missing Vivo passport @match');
  process.exit(1);
}
if (!source.includes('// @match        https://10th-ly-login.sanguosha.com/steam/oauth/callback.html*')) {
  console.error('FAIL missing Steam OAuth callback @match');
  process.exit(1);
}
if (!/location\.hostname === 'passport\.vivo\.com\.cn'[\s\S]{0,160}vivoPassportBridge\(\)/.test(source)) {
  console.error('FAIL missing Vivo passport dispatch');
  process.exit(1);
}
const start = source.indexOf('const ChannelRegistry = (() => {');
const end = source.indexOf('})();', start) + '})();'.length;
const context = {Object, Array, Set, Map, URL, JSON, console};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.__registry = ChannelRegistry;', context);
const registry = context.__registry;

let failures = 0;
const fail = message => { failures++; console.error('FAIL', message); };
for (const channel of registry.channels) {
  if (channel.authMode === 'portal') continue;
  for (const rule of channel.requestPolicy) {
    const host = new URL(rule.origin).hostname;
    if (!connects.has(host)) fail(channel.id + ' missing @connect ' + host);
    if (!rule.paths.length) fail(channel.id + ' empty policy for ' + rule.origin);
  }
  for (const key of ['loginEndpoint', 'accountPage', 'launchPage']) {
    const value = channel[key];
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch (_) { fail(channel.id + ' invalid ' + key); continue; }
    if (url.username || url.password) fail(channel.id + ' credentials in ' + key);
  }
}
const callback = registry.get('xiaomi').callback;
if (!callback || callback.hostname !== 'game.xiaomi.com' || callback.pathname !== '/oauthcallback/mioauth') {
  fail('xiaomi callback changed');
}
const steam = registry.get('steam');
const steamPage = steam?.loginOptions.find(option => option.mode === 'browser')?.page || '';
if (!steamPage.startsWith('https://store.steampowered.com/oauth/login?') || !steamPage.includes('state={state}')) {
  fail('steam browser OAuth entry is not bound to the official origin and state');
}
for (const host of ['id.cloud.huawei.com', 'passport.biligame.com']) {
  if (!connects.has(host)) fail('missing @connect ' + host);
}
if (failures) process.exit(1);
console.log('PASS connections=' + connects.size + ', channels=' + registry.channels.length);
