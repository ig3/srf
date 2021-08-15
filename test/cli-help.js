'use stcript';

const t = require('tape');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli --help', t => {
  t.test('should produce a help message', t => {
    console.log('pwd: ', process.cwd());
    console.log('script directory: ', __dirname);
    const cmd = path.join(__dirname, '..', 'index.js');
    exec(cmd + ' --help', (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      t.equal(stdout, 'opts:  {\n  _: [],\n  help: true,\n  h: true,\n  directory: \'/home/ian/.local/share/srf\',\n  dir: \'/home/ian/.local/share/srf\',\n  database: \'srf.db\',\n  db: \'srf.db\',\n  media: \'media\',\n  m: \'media\',\n  config: \'config.json\',\n  c: \'config.json\'\n}\n[ \'/usr/local/bin/node\', \'/home/ian/dev/srf/index.js\', \'--help\' ]\nindex.js\nusage:\n  index.js --help\n  index.js [--directory <root-directory>] [--config <config-file>] [--media <media-directory>] [--database <database-name>]\n  index.js [--directory <root-directory>] [--config <config-file>] [--media <media-directory>] [--database <database-name>] import <filename>\n');
      t.end();
    });
  });
});
