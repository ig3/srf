'use stcript';

const t = require('@ig3/test');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli --help', async t => {
  await t.test('should produce a help message', t => {
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js');
    exec(cmd + ' --help', (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end(true);
      }
      t.ok(stdout.startsWith('Usage:'), 'produces usage message');
      t.end();
    });
  });
  t.end();
});
