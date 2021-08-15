'use stcript';

const t = require('tape');

const exec = require('child_process').exec;
const path = require('path');

t.test('cli unsupported command', t => {
  t.test('should produce an error message', t => {
    const cmd = path.join(__dirname, '..', 'index.js') + ' asdf';
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        t.equal(stderr, 'Unsupported command: asdf\n', 'check stderr');
        t.equal(stdout, 'opts:  {\n  _: [ \'asdf\' ],\n  directory: \'/home/ian/.local/share/srf\',\n  dir: \'/home/ian/.local/share/srf\',\n  database: \'srf.db\',\n  db: \'srf.db\',\n  media: \'media\',\n  m: \'media\',\n  config: \'config.json\',\n  c: \'config.json\'\n}\nusage:\n  index.js --help\n  index.js [--directory <root-directory>] [--config <config-file>] [--media <media-directory>] [--database <database-name>]\n  index.js [--directory <root-directory>] [--config <config-file>] [--media <media-directory>] [--database <database-name>] import <filename>\n', 'check stdout');
        return t.end();
      }
      t.fail('should not succeed');
      t.end();
    });
  });
});
