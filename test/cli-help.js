'use stcript';

const t = require('tape');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli --help', t => {
  t.test('should produce a help message', t => {
    console.log('pwd: ', process.cwd());
    console.log('script directory: ', __dirname);
    const cmd = path.join(__dirname, '..', 'bin', 'cmd.js');
    exec(cmd + ' --help', (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      // eslint-disable-next-line
      t.match(stdout, /usage:\n  cmd\.js --help\n  cmd\.js \[--directory <root-directory>\] \[--config <config-file>\] \[--media <media-directory>\] \[--database <database-name>\]\n  cmd\.js \[--directory <root-directory>\] \[--config <config-file>\] \[--media <media-directory>\] \[--database <database-name>\] import <filename>\n/, 'usage message appears');
      t.end();
    });
  });
});
