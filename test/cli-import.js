'use stcript';

const t = require('tape');

const exec = require('child_process').exec;
const path = require('path');
const tmp = require('tmp');
const fs = require('fs');

t.test('cli import', t => {
  t.test('should fail with no file to import', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'index.js') +
      ' --directory ' + tmpDir.name +
      ' import';
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        t.equal(stderr, 'Missing file to import\n', 'check stderr');
        return t.end();
      }
      t.fail('should not succeed');
      t.end();
    });
  });

  t.test('should fail with missing file to import', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'index.js') +
      ' --directory ' + tmpDir.name +
      ' import nosuchfile';
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        t.ok(stderr.indexOf('ENOENT: no such file or directory, open \'nosuchfile\'') !== -1, 'check stderr');
        return t.end();
      }
      t.fail('should not succeed');
      t.end();
    });
  });

  t.test('should produce a database', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    console.log('script directory: ', __dirname);
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    console.log('tmpDir: ', tmpDir.name);
    const cmd =
      path.join(__dirname, '..', 'index.js') +
      ' --directory ' + tmpDir.name +
      ' import ' + path.join(__dirname, 'data', 'collection-2021-08-16@08-24-34.colpkg');
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      console.log('stderr: ', stderr);
      console.log('stdout: ', stdout);
      t.ok(fs.existsSync(tmpDir.name), 'check for data directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'srf.db')), 'check for database');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media')), 'check for media directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media', 'audio1-1exercise2.mp3')), 'check for media file');
      const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
      t.ok(db, 'get a database handle');
      t.equals(db.prepare('select value from config where name = \'srf schema version\'').get().value, '1', 'check schema version');
      t.equals(db.prepare('select count() from card').get()['count()'], 31, 'check count of cards');
      db.close();
      t.end();
    });
  });
});
