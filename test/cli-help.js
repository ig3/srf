'use stcript';

const t = require('node:test');
const assert = require('node:assert/strict');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli --help', async t => {
  await t.test('should produce a help message', (t, done) => {
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js');
    exec(cmd + ' --help', (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        assert.fail('should not fail');
        return done(true);
      }
      assert(stdout.startsWith('Usage:'), 'produces usage message');
      done();
    });
  });
});
