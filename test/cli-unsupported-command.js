'use stcript';

const t = require('@ig3/test');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli unsupported command', t => {
  t.test('should produce an error message', t => {
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js') + ' asdf';
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        t.equal(err.code, 1, 'exit status is 1');
        t.equal(stderr, 'Unsupported command: asdf\n', 'check stderr');
        return t.end();
      }
      t.fail('should not succeed');
      t.end(true);
    });
  });
  t.end();
});
