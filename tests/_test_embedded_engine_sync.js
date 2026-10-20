const fs = require('fs');

const mainPath = '三国杀多渠道登录.user.js';
const enginePath = '_direct_engine.js';
const main = fs.readFileSync(mainPath, 'utf8');
const engine = fs.readFileSync(enginePath, 'utf8');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const begin = main.indexOf('/* DIRECT-ENGINE-BEGIN */');
const end = main.indexOf('/* DIRECT-ENGINE-END */');
assert(begin >= 0 && end > begin, 'embedded engine markers are missing');
const embedded = main.slice(begin + '/* DIRECT-ENGINE-BEGIN */'.length, end)
  .replace(/\r\n/g, '\n').trim();
const standalone = engine.replace(/\r\n/g, '\n').trim();
assert(embedded === standalone, 'embedded engine differs from _direct_engine.js');

function version(source, pattern, label) {
  const match = pattern.exec(source);
  assert(match, label + ' version is missing');
  return match[1];
}

const versions = {
  metadata: version(main, /^\/\/\s*@version\s+([0-9.]+)\s*$/m, 'metadata'),
  host: version(main, /const VERSION = '([0-9.]+)'/g, 'host'),
  engine: version(engine, /const VERSION = '([0-9.]+)'/g, 'engine')
};
assert(new Set(Object.values(versions)).size === 1,
  'version mismatch: ' + JSON.stringify(versions));

console.log(JSON.stringify({ok: true, embeddedBytes: Buffer.byteLength(embedded), versions}, null, 2));
