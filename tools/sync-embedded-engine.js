'use strict';

// Keep the browser-facing userscript self-contained while making the engine
// source authoritative. Run this after editing _direct_engine.js.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, '三国杀多渠道登录.user.js');
const enginePath = path.join(root, '_direct_engine.js');
const beginMarker = '/* DIRECT-ENGINE-BEGIN */';
const endMarker = '/* DIRECT-ENGINE-END */';
const main = fs.readFileSync(mainPath, 'utf8');
const engine = fs.readFileSync(enginePath, 'utf8').replace(/\r\n/g, '\n').trim();
const begin = main.indexOf(beginMarker);
const end = main.indexOf(endMarker);

if (begin < 0 || end <= begin) throw new Error('embedded engine markers are missing');

const newline = main.includes('\r\n') ? '\r\n' : '\n';
const embedded = newline + engine.replace(/\n/g, newline) + newline;
const next = main.slice(0, begin + beginMarker.length) + embedded + main.slice(end);
if (next === main) {
  console.log('Embedded engine already synchronized.');
} else {
  fs.writeFileSync(mainPath, next, 'utf8');
  console.log('Synchronized embedded engine: ' + Buffer.byteLength(engine) + ' bytes.');
}
