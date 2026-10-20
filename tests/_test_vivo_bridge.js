const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const start = source.indexOf('const VIVO_PENDING_NONCE_KEY');
const end = source.indexOf('  function oppoPageBridge()', start);
if (start < 0 || end < 0) throw new Error('Vivo bridge block not found');
const block = source.slice(start, end);

const nonce = 'a'.repeat(32);
const resultPrefix = 'sgs-vivo-page-result-v1:';
const statePrefix = 'sgs-vivo-page-state-v1:';
const pendingKey = 'sgs-vivo-pending-nonce-v1';

function run(name, options = {}) {
  const store = new Map();
  if (options.pending) store.set(pendingKey, options.pending);
  const writes = [];
  const intervals = new Set();
  let cookieJar = options.cookie || '';
  const document = {
    get cookie() { return cookieJar; },
    set cookie(value) {
      const first = String(value).split(';')[0];
      if (first && !cookieJar.split(';').some(part => part.trim().startsWith(first.split('=')[0] + '='))) {
        cookieJar = (cookieJar ? cookieJar + '; ' : '') + first;
      }
    }
  };
  const session = new Map();
  if (options.name) session.set('sgs-vivo-bridge-nonce', options.name);
  const window = {name: options.name || ''};
  const context = {
    window, document,
    location: {
      href: options.href || 'https://joint.vivo.com.cn/game-subaccount-login/?from=login',
      pathname: '/game-subaccount-login/',
      hash: options.hash || ''
    },
    sessionStorage: {
      getItem: key => session.has(key) ? session.get(key) : null,
      setItem: (key, value) => session.set(key, String(value))
    },
    GM_getValue: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    GM_setValue: (key, value) => { store.set(key, value); writes.push([key, value]); },
    GM_deleteValue: key => { store.delete(key); },
    URL, URLSearchParams,
    setTimeout: () => 0,
    setInterval: () => { const id = intervals.size + 1; intervals.add(id); return id; },
    clearInterval: id => intervals.delete(id),
    console: {info: () => {}}
  };
  vm.createContext(context);
  vm.runInContext(block + '\nthis.__vivoBridge = vivoPageBridge;', context);
  context.__vivoBridge();
  if (options.officialCall) {
    context.window.AppWebClient.onVivoAccountLogin(options.officialCall);
  }
  if (options.rerun) context.__vivoBridge();
  const result = [...store.entries()].find(([key]) => key.startsWith(resultPrefix));
  if (result && Object.hasOwn(result[1], 'phone')) throw new Error('Vivo result must not store phone');
  const states = [...store.entries()].filter(([key]) => key.startsWith(statePrefix));
  console.log(JSON.stringify({
    name,
    result: result ? {key: result[0], keys: Object.keys(result[1]).sort(), ttl: result[1].expires - result[1].createdAt} : null,
    pending: store.has(pendingKey),
    states: states.map(([, value]) => value.phase),
    bridgeType: typeof context.window.AppWebClient?.onVivoAccountLogin
  }));
}

run('valid-pending-nonce', {
  pending: {nonce, expires: Date.now() + 60000},
  hash: '#/home',
  cookie: 'vvf_subopenid=SUB123; vvf_opentoken=TOKEN123456; vvf_openid=OPEN123; vvf_phone=PHONE123'
});
run('wrong-host', {
  name: nonce,
  href: 'https://evil.example/game-subaccount-login/?from=login',
  cookie: 'vvf_subopenid=SUB123; vvf_opentoken=TOKEN123456'
});
run('missing-cookie', {name: nonce});
run('expired-pending', {pending: {nonce, expires: Date.now() - 1}});
run('official-callback', {
  name: nonce,
  pending: {nonce, expires: Date.now() + 60000},
  officialCall: 'https://joint.vivo.com.cn/game-subaccount-login/?from=login',
  cookie: 'vvf_subopenid=SUB123; vvf_opentoken=TOKEN123456'
});
run('reload-after-result', {
  name: nonce,
  hash: '#/home',
  rerun: true,
  cookie: 'vvf_subopenid=SUB123; vvf_opentoken=TOKEN123456'
});
