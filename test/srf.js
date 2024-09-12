'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('path');

const tmpdir = fs.mkdtempSync(path.join(__dirname, 'data', 'tmp'));
process.on('exit', () => {
  fs.rmSync(tmpdir, { recursive: true, force: true });
});
fs.mkdirSync(path.join(tmpdir, 'no-permissions'), { mode: 0x000 });
fs.mkdirSync(path.join(tmpdir, 'srf'));
for (let i = 0; i < 25; i++) {
  const p = path.join(tmpdir, 'srf', 'srf.db.' + i + '.bak');
  fs.writeFileSync(p, 'test data');
  const ts = (Date.now() / 1000) - 60 * 60 * 24 * 30;
  fs.utimesSync(p, ts, ts);
}

t.test('srf.js', async t => {
  await t.test('load no opts', t => {
    const srf = require('../lib/srf.js')();
    t.ok(srf, 'got srf');
    t.pass('loaded');
    t.end();
  });

  await t.test('load with bad scheduler 1', t => {
    t.throws(
      () => {
        const srf = require('../lib/srf.js')({
          scheduler: 'bad',
        });
        t.ok(!srf, 'should not get srf');
      },
      /Cannot find module/,
      'bad scheduler'
    );
    t.pass('loaded');
    t.end();
  });

  await t.test('load with scheduler object', t => {
    let loadCalled = false;
    let unloadCalled = false;
    const srf = require('../lib/srf.js')({
      scheduler: {
        load: () => {
          loadCalled = true;
        },
        unload: () => {
          unloadCalled = true;
        },
      },
    });
    t.ok(srf, 'got srf');
    t.ok(loadCalled, 'load was called');
    return srf.shutdown()
    .then(() => {
      t.ok(unloadCalled, 'unload was called');
      t.end();
    });
  });

  await t.test('load with bad scheduler 2', t => {
    t.throws(
      () => {
        require('../lib/srf.js')({
          scheduler: '../test/data/bad-scheduler.js',
        });
        t.fail('should not get here');
      },
      /Invalid scheduler:/,
      'bad scheduler'
    );
    t.end();
  });

  await t.test('load with bad scheduler 3', t => {
    t.throws(
      () => {
        require('../lib/srf.js')({
          scheduler: 10,
          debug: true,
        });
        t.fail('should not get here');
      },
      /Invalid scheduler option:/,
      'bad scheduler'
    );
    t.end();
  });

  await t.test('load with bad database path', t => {
    t.throws(
      () => {
        require('../lib/srf.js')({
          database: path.join(tmpdir, 'no-permissions', 'x', 'x.db'),
        });
        t.fail('should not get here');
      },
      /EACCES/,
      'inaccessible database path'
    );
    t.end();
  });

  const srf = require('../lib/srf.js')({
    directory: path.join(tmpdir, 'srf'),
  });

  await t.test('getCountDaysStudied', t => {
    const days = srf.getCountDaysStudied();
    t.equal(days, 0, '0 days studied');
    t.end();
  });

  await t.test('get/setParam', t => {
    srf.setParam('new', 'first');
    let value = srf.getParam('new');
    t.equal(value, 'first', 'value should be 1');
    srf.setParam('new', 'second');
    value = srf.getParam('new');
    t.equal(value, 'second', 'value should be 2');
    t.end();
  });

  await t.test('invalid unit', t => {
    t.throws(
      () => {
        srf.resolveUnits('10xxx');
      },
      /Unsupported unit: xxx/,
      'getMultiplier throws on invalid unit'
    );
    const value = srf.resolveUnits('10minutes');
    t.equal(value, 600, '10 minutes is 600 seconds');
    t.end();
  });

  await t.test('createTemplate', t => {
    srf.createTemplate(
      'ts1',
      'card 1',
      '{{English}}',
      '{{Hanzi}}<br>{{Pinhin}}<br>{{English}}',
      ''
    );
    srf.createTemplate(
      'ts1',
      'card 2',
      '{{Hanzi}}',
      '{{Hanzi}}<br>{{Pinhin}}<br>{{English}}',
      ''
    );
    srf.createTemplate(
      'ts1',
      'card 2',
      '{{Pinyin}}',
      '{{Hanzi}}<br>{{Pinhin}}<br>{{English}}',
      ''
    );
    srf.createTemplate(
      'ts2',
      'card 1',
      '{{English}}',
      '{{English}}<br>{{French}}<br>{{#person}}{{name}}{{/person}}',
      ''
    );
    srf.createTemplate(
      'ts2',
      'card 2',
      '{{French}}',
      '{{English}}<br>{{French}}',
      ''
    );
    t.pass('should not throw exception');
    t.end();
  });

  await t.test('createFieldset', t => {
    srf.createFieldset(
      'a',
      'ts1',
      0,
      JSON.stringify({
        Hanzi: '你做了什么？',
        English: 'What did you do?',
        Pinyin: 'nǐ zuò le shénme ?',
      })
    );
    srf.createFieldset(
      'b',
      'ts1',
      0,
      JSON.stringify({
        Hanzi: '我会做。',
        English: 'I can do it.',
        Pinyin: 'Wǒ huì zuò.',
      })
    );
    t.pass('should not throw exception');
    t.end();
  });

  await t.test('reviewCard', t => {
    [1, 2, 3, 4, 1, 2, 3]
    .forEach(id => {
      const card = srf.getCard(id);
      srf.reviewCard(card, 15, 20, 'good');
    });
    t.pass('should not throw');
    t.end();
  });

  await t.test('fixDatabase', t => {
    try {
      const db = require('better-sqlite3')(path.join(tmpdir, 'srf', 'srf.db'));
      const ts = Date.now();
      const insertRevlog = db.prepare(
        `insert into revlog (
          id,
          revdate,
          cardid,
          ease,
          interval,
          lastinterval,
          factor,
          viewtime,
          studytime
        ) values (?,?,?,?,?,?,?,?,?)`
      );

      insertRevlog.run(ts, '20240101', 1, 'good', 500, 0, 2, 20, 20);
      insertRevlog.run(ts, '20240101', 1, 'good', 500, 0, 2, 20, 20);
      insertRevlog.run(ts, '20240101', 1, 'good', 500, 0, 2, 20, 20);
      srf.fixDatabase();
      t.pass('should not throw');
      t.end();
    } catch (err) {
      console.log('fixDatabase threw: ' + err);
      t.fail('should not throw');
      t.end();
    }
  });

  await t.test('getChartStudyTimePerHour', t => {
    const data = srf.getChartStudyTimePerHour();
    t.ok(data, 'returns data');
    t.equal(data.x.length, 24, 'no x values');
    t.equal(data.y.length, 24, 'no y values');
    t.equal(data.type, 'bar', 'bar chart');
    t.end();
  });

  await t.test('getChartDuePerHour', t => {
    const data = srf.getChartDuePerHour();
    t.ok(data, 'returns data');
    t.ok(data.x.length > 0, 'some x values');
    t.ok(data.y.length > 0, 'some y values');
    t.equal(data.type, 'bar', 'bar chart');
    t.end();
  });

  await t.test('updateFieldset', t => {
    srf.updateFieldset(
      2,
      'ts2',
      0,
      JSON.stringify({
        English: 'I can do it.',
        French: 'Je peux le faire.',
      })
    );
    t.pass('should not throw exception');
    t.end();
  });

  await t.test('getTemplatesets', t => {
    const templatesets = srf.getTemplatesets();
    t.pass('should not throw exception');
    t.equal(templatesets.length, 2, 'two templatesets');
    t.end();
  });

  await t.test('Attempt to bind a privileged port', t => {
    // Force a reload of the module to get a new instance
    delete require.cache[require.resolve('../lib/srf.js')];
    const srf2 = require('../lib/srf.js')({
      directory: path.join(tmpdir, 'srf'),
    });
    // This will fail and write to console but otherwise silent
    return srf2.runServer({
      port: 1,
      verbose: true,
    }, [])
    .then(() => {
      t.fail('should not resolve');
    })
    .catch(err => {
      t.pass('should reject');
      t.ok(err.message.indexOf('permission denied') > 0, 'expected error');
    })
    .finally(() => {
      t.end();
    });
  });

  await t.test('Bind an available port', t => {
    // Force a reload of the module to get a new instance
    delete require.cache[require.resolve('../lib/srf.js')];
    const srf2 = require('../lib/srf.js')({
      directory: path.join(tmpdir, 'srf'),
    });
    const origIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
    // This will fail and write to console but otherwise silent
    return srf2.runServer({
      port: 0,
      verbose: true,
    }, [])
    .then(() => {
      t.pass('should resolve');
      srf2.shutdown();
    })
    .catch(err => {
      t.fail('should not reject');
      console.log('err: ', err);
    })
    .finally(() => {
      process.stdout.isTTY = origIsTTY;
      t.end();
    });
  });

  await t.test('updateTemplate', t => {
    srf.updateTemplate(
      'ts2',
      'card 1',
      '{{English}}',
      '{{Hanzi}}<br>{{Pinhin}}<br>{{English}}',
      '',
      1
    );
    t.pass('should not throw exception');
    t.end();
  });

  await t.test('getChartDuePerHour', t => {
    const db = require('better-sqlite3')(path.join(tmpdir, 'srf', 'srf.db'));
    db.prepare('update card set due = ?, interval = ? where id = 2')
    .run(Date.now() / 1000 - 10, 60);
    const data = srf.getChartDuePerHour();
    t.ok(data, 'returns data');
    t.equal(data.x.length, 1, 'one x values');
    t.equal(data.y.length, 1, 'one y values');
    t.equal(data.type, 'bar', 'bar chart');
    t.end();
  });

  await t.test('importAnki - unsupported zip file', t => {
    const p = path.join(__dirname, 'data', 'bad.apkg');
    return srf.importAnki(p)
    .then(() => {
      t.fail('should not resolve');
    })
    .catch(err => {
      t.pass('should reject');
      t.ok(err.message.indexOf('not a supported Anki .apkg file') >= 0, 'expected error message');
      console.log('import error: ', err);
    })
    .finally(() => {
      t.end();
    });
  });

  await t.test('importFile - CSV missing column', t => {
    const p = path.join(__dirname, 'data', 'bad-templates.csv');
    return srf.importFile(p)
    .then(() => {
      t.fail('should not resolve');
    })
    .catch(err => {
      t.pass('should reject');
      t.ok(err.message.indexOf('unsupported content') !== -1, 'expected error');
    })
    .finally(() => {
      t.end();
    });
  });

  await t.test('importFile - CSV with no rows', t => {
    const p = path.join(__dirname, 'data', 'bad-templates2.csv');
    return srf.importFile(p)
    .then(() => {
      t.fail('should not resolve');
    })
    .catch(err => {
      t.pass('should reject');
      t.ok(err.message.indexOf('no data') !== -1, 'expected error');
    })
    .finally(() => {
      t.end();
    });
  });

  await t.test('importFile - unsupported file type', t => {
    const p = path.join(__dirname, 'data', 'templates.html');
    return srf.importFile(p)
    .then(() => {
      t.fail('should not resolve');
    })
    .catch(err => {
      t.pass('should reject');
      t.ok(err.message.indexOf('Unsupported file type') !== -1, 'expected error');
    })
    .finally(() => {
      t.end();
    });
  });

  await t.test('getChartCardsPerLastInterval', t => {
    const db = require('better-sqlite3')(path.join(tmpdir, 'srf', 'srf.db'));
    db.prepare('update card set lastinterval = ?, interval = ? where id = 3')
    .run(60 * 60 * 24 * 365, 60);
    const data = srf.getChartCardsPerLastInterval();
    t.ok(data, 'returns data');
    t.ok(data.x.length > 0, 'some x values');
    t.ok(data.y.length > 0, 'some y values');
    t.end();
  });

  await t.test('getChartCardsPerInterval', t => {
    const db = require('better-sqlite3')(path.join(tmpdir, 'srf', 'srf.db'));
    db.prepare('update card set lastinterval = ?, interval = ? where id = 3')
    .run(60 * 60 * 24 * 365, 60 * 60 * 24 * 365);
    const data = srf.getChartCardsPerInterval();
    t.ok(data, 'returns data');
    t.ok(data.x.length > 0, 'some x values');
    t.ok(data.y.length > 0, 'some y values');
    t.end();
  });

  await t.test('getCountNewCards', t => {
    const data = srf.getCountNewCards();
    t.ok(data, 'returns data');
    t.equal(data, 4, '4 new cards');
    t.end();
  });

  await t.test('getCountDaysStudied', t => {
    const days = srf.getCountDaysStudied();
    t.equal(days, 1, '0 days studied');
    t.end();
  });

  await t.test('deferRelated', t => {
    srf.deferRelated(3, 3600);
    // TODO: check for updates
    t.end();
  });

  await t.test('getDueCard', t => {
    const card = srf.getDueCard();
    t.ok(card, 'got a card');
    t.equal(card.id, 2, 'got card 2');
    t.end();
  });

  await t.test('formatSeconds', t => {
    t.equal(srf.formatSeconds(30), '30s', '30 seconds');
    t.equal(srf.formatSeconds(120), '2.0m', '2 minutes');
    t.equal(srf.formatSeconds(660), '11m', '11 minutes');
    t.equal(srf.formatSeconds(3600), '1.0h', '1 hour');
    t.equal(srf.formatSeconds(3600 * 15), '15h', '15 hours');
    t.equal(srf.formatSeconds(3600 * 24), '1.0d', '1 day');
    t.equal(srf.formatSeconds(3600 * 24 * 11), '11d', '11 days');
    t.end();
  });

  await t.test('getFieldset - No fieldset ID', t => {
    const result = srf.getFieldset(99);
    t.equal(result, undefined, 'No fieldset ID 99');
    t.end();
  });

  srf.shutdown();
  t.end();
});
