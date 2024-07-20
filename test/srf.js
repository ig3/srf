'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('path');

const tmpdir = fs.mkdtempSync(path.join(__dirname, 'data', 'tmp'));
process.on('exit', () => {
  fs.rmSync(tmpdir, { recursive: true, force: true });
});
fs.mkdirSync(path.join(tmpdir, 'no-permissions'), { mode: 0x000 });

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
    console.log('call t.throws');
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
    console.log('t.throws done');
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
    console.log('call t.throws');
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
    console.log('t.throws done');
    t.end();
  });

  const srf = require('../lib/srf.js')({
    directory: path.join(tmpdir, 'srf'),
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

  await t.test('getChartDuePerHour', t => {
    const data = srf.getChartDuePerHour();
    t.ok(data, 'returns data');
    console.log('data: ', data);
    t.equal(data.x.length, 0, 'no x values');
    t.equal(data.y.length, 0, 'no y values');
    t.equal(data.type, 'bar', 'bar chart');
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
    console.log('data: ', data);
    t.equal(data.x.length, 24, 'no x values');
    t.equal(data.y.length, 24, 'no y values');
    t.equal(data.type, 'bar', 'bar chart');
    t.end();
  });

  await t.test('getChartDuePerHour', t => {
    const data = srf.getChartDuePerHour();
    t.ok(data, 'returns data');
    console.log('data: ', data);
    t.equal(data.x.length, 2, 'one x values');
    t.equal(data.y.length, 2, 'one y values');
    t.equal(data.type, 'bar', 'bar chart');
    t.end();
  });

  await t.test('getChartCardsPerlLastInterval', t => {
    const data = srf.getChartCardsPerLastInterval();
    t.ok(data, 'returns data');
    console.log('data: ', data);
    t.equal(data.x.length, 1, 'one x values');
    t.equal(data.y.length, 1, 'one y values');
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
    console.log('templatesets: ', JSON.stringify(templatesets, null, 2));
    t.end();
  });

  await t.test('Attempt to bind a privileged port', t => {
    // Force a reload of the module to get a new instance
    delete require.cache[require.resolve('../lib/srf.js')];
    const srf2 = require('../lib/srf.js')({
      directory: path.join(tmpdir, 'srf'),
    });
    // This will fail and write to console but otherwise silent
    srf2.runServer({
      port: 1,
      verbose: true,
    }, []);
    t.pass('does not throw');
    t.end();
  });

  srf.shutdown();
  t.end();
});
