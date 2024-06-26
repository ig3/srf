'use stcript';

const t = require('node:test');
const assert = require('node:assert/strict');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli unsupported command', async t => {
  await t.test('should produce an error message', (t, done) => {
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js') + ' asdf';
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        assert.equal(err.code, 1, 'exit status is 1');
        assert.equal(stderr, 'Unsupported command: asdf\n', 'check stderr');
        return done();
      }
      assert.fail('should not succeed');
      done(true);
    });
  });
});
