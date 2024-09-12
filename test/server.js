'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('node:path');

const tmpdir = fs.mkdtempSync(path.join(__dirname, 'data', 'tmp'));
function cleanup () {
  fs.rmSync(tmpdir, {
    force: true,
    recursive: true,
  });
}
process.on('SIGINT', cleanup);
process.on('exit', cleanup);

t.test('srf server', t => {
  t.test('server loads', t => {
    console.log('tmpdir: ' + tmpdir);
    const srf = require('../lib/srf.js')({
      directory: tmpdir,
    });
    t.ok(srf, 'srf is set');
    srf.runServer();
    srf.shutdown();
    t.pass('survived!!');
    t.end();
  });
  t.end();
});
