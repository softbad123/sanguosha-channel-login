const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const start = src.indexOf('function oppoPageBridge()');
if (start < 0) throw new Error('bridge not found');
let depth = 0, end = -1, seen = false;
for (let i = start; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') { depth++; seen = true; }
  else if (ch === '}') { depth--; if (seen && depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);
console.log('extracted', fnSrc.length, 'chars');
function run(name, href, nameValue) {
  const store = new Map();
  const writes = [];
  const ctx = {
    window: {name: nameValue || ''},
    location: {href, hash: new URL(href).hash},
    sessionStorage: {getItem: () => null, setItem: () => {}},
    GM_setValue: (k, v) => { store.set(k, v); writes.push([k, v]); },
    GM_getValue: (k, d) => store.has(k) ? store.get(k) : d,
    GM_deleteValue: k => store.delete(k),
    URL, URLSearchParams,
    setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\noppoPageBridge();', ctx);
  const entries = [...store.entries()];
  console.log(name, 'writes=' + writes.length, entries.map(([k, v]) => ({key: k, code: v.code, ticket: v.ticket, host: new URL(v.href).hostname})));
}
const n = 'a'.repeat(32);
run('query-code', 'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?code=ABC12345&state=x', 'sgs-oppo-' + n);
run('hash-code', 'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html#/home?code=HASH12345', 'sgs-oppo-' + n);
run('ticket-only', 'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?ticket=TICKET12345', 'sgs-oppo-' + n);
run('no-nonce', 'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?code=ABC12345', '');
run('wrong-host', 'https://evil.example/game-union-h5/h5/client-login/index.html?code=ABC12345', 'sgs-oppo-' + n);
