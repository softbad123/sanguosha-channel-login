'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.basename(__dirname) === 'tests' ? path.resolve(__dirname, '..') : __dirname;
const main = fs.readFileSync(path.join(root, '三国杀多渠道登录.user.js'), 'utf8');
const localReadme = path.join(root, 'README-多渠道说明.md');
const readme = fs.readFileSync(fs.existsSync(localReadme) ? localReadme : path.join(root, 'README.md'), 'utf8');
const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const license = fs.readFileSync(path.join(root, 'LICENSES', 'Apache-2.0.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sourceUrl = 'https://github.com/Clarrycy/jinnangmiaoji/blob/main/jinnangdai/payload/unified-login.user.js';

assert(main.includes('// @author       @暗鹊（第一作者；《统一登录器》原始源码）'), 'metadata must credit @暗鹊 as first author');
assert(main.includes('// @author       softbad123（维护者）'), 'metadata must identify the maintainer');
assert(main.includes('// @version      ' + pkg.version), 'metadata version must match package.json');
assert(main.includes('第一作者与源码来源'), 'panel must show a source-credit heading');
assert(main.includes('谨向 @暗鹊 致以诚挚感谢'), 'panel must thank @暗鹊');
assert(main.includes(sourceUrl), 'panel must link to the pinned upstream source');
assert(main.includes('并非 @暗鹊 官方发布'), 'panel must not imply official endorsement');

assert(readme.includes(sourceUrl), 'README must link to the pinned upstream source');
assert(readme.includes('第一作者：**@暗鹊**'), 'README must name @暗鹊 as first author');
assert(notices.includes(sourceUrl), 'third-party notices must link to the pinned upstream source');
assert(notices.includes('Apache License 2.0'), 'third-party notices must state the upstream license');
assert(notices.includes('9d7dfc4833664eeb9eda17b7499e2a6667e8d8907b7c67b53cb10dc25affba73'), 'notices must record the verified source hash');
assert(/Apache License\s+Version 2\.0/.test(license), 'Apache-2.0 license text must be bundled');

console.log(JSON.stringify({ok: true, firstAuthor: '@暗鹊', sourceUrl, license: 'Apache-2.0'}, null, 2));
