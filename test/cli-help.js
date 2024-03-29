'use stcript';

const t = require('tape');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli --help', t => {
  t.test('should produce a help message', t => {
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js');
    exec(cmd + ' --help', (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      // eslint-disable-next-line
      console.log('stdout: ', stdout);
      t.ok(stdout.startsWith('usage:'), 'produces usage message');
      t.end();
    });
  });
});
