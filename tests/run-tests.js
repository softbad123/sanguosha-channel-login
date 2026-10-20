const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(__dirname)
  .filter(name => /^_test_.*\.js$/.test(name))
  .sort();

if (!tests.length) {
  console.error('No tests found.');
  process.exit(1);
}

const failed = [];
for (const name of tests) {
  console.log('\n▶ ' + name);
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed.push(name);
}

if (failed.length) {
  console.error('\nFailed: ' + failed.join(', '));
  process.exit(1);
}
console.log('\nAll ' + tests.length + ' tests passed.');