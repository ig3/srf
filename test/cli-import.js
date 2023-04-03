'use stcript';

const dbSchema = '12';
const t = require('tape');

const exec = require('child_process').exec;
// const execSync = require('child_process').execSync;
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
      path.join(__dirname, '..', 'bin', 'cmd.js') +
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
      path.join(__dirname, '..', 'bin', 'cmd.js') +
      ' --directory ' + tmpDir.name +
      ' import nosuchfile';
    exec(cmd, (err, stdout, stderr) => {
      console.log('stdout: ' + stdout);
      console.log('stderr: ' + stderr);
      if (err) {
        t.equal(stderr, 'nosuchfile: File not found.\n', 'check stderr');
        return t.end();
      }
      t.fail('should not succeed');
      t.end();
    });
  });

  t.test('import from an Anki 2.1 export file', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'bin', 'cmd.js') +
      ' --directory ' + tmpDir.name +
      ' import ' + path.join(__dirname, 'data', 'collection-2021-08-16@08-24-34.colpkg');
    exec(cmd, (err, stdout, stderr) => {
      console.log('import stdout:\n' + stdout);
      console.log('import stderr:\n' + stderr);
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      t.ok(fs.existsSync(tmpDir.name), 'check for data directory');
      const dbpath = path.join(tmpDir.name, 'srf.db');
      t.ok(fs.existsSync(dbpath), 'check for database "' + dbpath + '"');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media')), 'check for media directory');
      const p = path.join(tmpDir.name, 'media', 'audio1-1exercise2.mp3');
      t.ok(fs.existsSync(p), 'check for media file');
      const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
      t.ok(db, 'get a database handle');
      t.equals(db.prepare('select value from config where name = \'srf schema version\'').get().value, dbSchema, 'check schema version');
      const templates = db.prepare('select * from template').all();
      const templatesCopy = templates.map(template => {
        template.templateset = template.templateset.slice(0, -37);
        return template;
      });
      t.deepEqual(templatesCopy, [
        {
          id: 1,
          templateset: 'Basic (optional reversed card)-62f40',
          name: 'Card 1',
          front: '{{Front}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          css: '.card {\n font-familiy: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}'
        },
        {
          id: 2,
          templateset: 'Basic (optional reversed card)-62f40',
          name: 'Card 2',
          front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
          css: '.card {\n font-familiy: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}'
        },
        {
          id: 3,
          templateset: 'Basic',
          name: 'Card 1',
          front: '{{Front}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        },
        {
          id: 4,
          templateset: 'Cloze',
          name: 'Cloze',
          front: '{{cloze:Text}}',
          back: '{{cloze:Text}}<br>\n{{Back Extra}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n\n.cloze {\n font-weight: bold;\n color: blue;\n}\n.nightMode .cloze {\n color: lightblue;\n}\n'
        },
        {
          id: 5,
          templateset: 'Basic (and reversed card)',
          name: 'Card 1',
          front: '{{Front}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        },
        {
          id: 6,
          templateset: 'Basic (and reversed card)',
          name: 'Card 2',
          front: '{{Back}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        },
        {
          id: 7,
          templateset: 'Basic (type in the answer)',
          name: 'Card 1',
          front: '{{Front}}\n\n{{type:Back}}',
          back: '{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        },
        {
          id: 8,
          templateset: 'Basic (optional reversed card)',
          name: 'Card 1',
          front: '{{Front}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        },
        {
          id: 9,
          templateset: 'Basic (optional reversed card)',
          name: 'Card 2',
          front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
          css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n'
        }
      ], 'templates load correctly');

      const fieldsets = db.prepare('select * from fieldset').all();
      const fieldsetsCopy = fieldsets.map(fieldset => {
        // A guid is appended to templateset - it's random
        fieldset.templateset = fieldset.templateset.slice(0, -37);
        return fieldset;
      });
      t.deepEqual(fieldsetsCopy, [
        {
          id: 1,
          guid: 'fn~V>3Sf~@',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Nǐ hǎo!","Back":"Hello!","Add Reverse":"y"}',
          ord: 0
        },
        {
          id: 2,
          guid: 'dvs.e^4_pj',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: "{\"Front\":\"Nǐ jiào shénme míngzi?\",\"Back\":\"What's your name?\",\"Add Reverse\":\"y\"}",
          ord: 10
        },
        {
          id: 3,
          guid: 'P}<jcJ@M|t',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ jiào ...","Back":"My name is ...","Add Reverse":"y"}',
          ord: 20
        },
        {
          id: 4,
          guid: 'b+]Q/7@KJJ',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Xièxie.","Back":"Thank you.","Add Reverse":"y"}',
          ord: 30
        },
        {
          id: 5,
          guid: 'euPxiY=>{l',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Zàijiàn.","Back":"See you.","Add Reverse":"y"}',
          ord: 40
        },
        {
          id: 6,
          guid: 'nT<kzW!~88',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Tongue twister:<div>Māmɑ qí mǎ. Mǎ màn. Māmɑ mà mǎ.</div>","Back":"Mum is riding a horse. The horse goes slowly. Mum scolds the horse.<div>[sound:audio1-1exercise2.mp3]</div>","Add Reverse":""}',
          ord: 50
        },
        {
          id: 7,
          guid: 'QhWp1Kw-4N',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Nǐ shì nǎ guó rén?","Back":"Where are you from?","Add Reverse":"y"}',
          ord: 60
        },
        {
          id: 8,
          guid: 'dUWn&1<s-i',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Yīngguórén.","Back":"I am from UK.","Add Reverse":"y"}',
          ord: 70
        },
        {
          id: 9,
          guid: 'B5n6le}E39',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Déguórén.","Back":"I am from Germany.","Add Reverse":"y"}',
          ord: 80
        },
        {
          id: 10,
          guid: 'mB?16(U*0,',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Fǎguórén.","Back":"I am from France.","Add Reverse":"y"}',
          ord: 90
        },
        {
          id: 11,
          guid: 'nWTV3g#k8/',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Měiguórén.","Back":"I am from USA.","Add Reverse":"y"}',
          ord: 100
        },
        {
          id: 12,
          guid: 'Llc?-8r,+!',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Rìběnrén.","Back":"I am from Japan.","Add Reverse":"y"}',
          ord: 110
        },
        {
          id: 13,
          guid: 'y;~-~%:%&g',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Xìbānyá rén.&nbsp;(?)","Back":"I am from Spain.","Add Reverse":"y"}',
          ord: 120
        },
        {
          id: 14,
          guid: 'kXQnc=:[0h',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Yìndù rén.&nbsp;(?)","Back":"I am from India.","Add Reverse":"y"}',
          ord: 130
        },
        {
          id: 15,
          guid: 'I7O}+SRo9C',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Wǒ shì Zhōngguórén.","Back":"I am from China.","Add Reverse":"y"}',
          ord: 140
        },
        {
          id: 16,
          guid: 'G5@tMso$X',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"<div>Read aloud: qìchē(car)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>zìjǐ(self)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>rìjì(diary)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>sījī(driver)&nbsp;jìzhě(journalist)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>chūzūchē(taxi)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>zìxíngchē(bike)<span class=\\"Apple-tab-span\\" style=\\"white-space:pre\\"> </span>zìzhùcān(buffet)</div>","Back":"[sound:audio1-2exercise3.mp3]","Add Reverse":""}',
          ord: 150
        },
        {
          id: 17,
          guid: 'r`,)cxjZO>',
          templateset: 'Basic (optional reversed card)-62f40',
          fields: '{"Front":"Tongue twister:&nbsp;Sì shì sì，shí shì shí. Shísì shì shísì，sìshí shì sìshí.","Back":"4 is 4, 10 is 10, 14 is 14, 40 is 40.<div>[sound:audio1-2exercise4.mp3]</div>","Add Reverse":""}',
          ord: 160
        }
      ], 'templates loads correctly');
      const cards = db.prepare('select * from card').all();
      let modifiedOK = true;
      const cardsCopy = cards.map(card => {
        const now = new Date() / 1000;
        if (card.modified < now - 10 || card.modified > now) {
          modifiedOK = false;
        }
        delete card.modified; // the time import ran
        return card;
      });
      t.ok(modifiedOK, 'modified is set correctly');
      t.deepEqual(cardsCopy, [
        {
          id: 1,
          fieldsetid: 1,
          templateid: 1,
          interval: 345600,
          lastinterval: 345600,
          due: 1629388800,
          factor: 2,
          views: 1,
          lapses: 0,
          ord: 0
        },
        {
          id: 2,
          fieldsetid: 1,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9384
        },
        {
          id: 3,
          fieldsetid: 2,
          templateid: 1,
          interval: 345600,
          lastinterval: 345600,
          due: 1629388800,
          factor: 2,
          views: 1,
          lapses: 0,
          ord: 10
        },
        {
          id: 4,
          fieldsetid: 2,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9385
        },
        {
          id: 5,
          fieldsetid: 3,
          templateid: 1,
          interval: 60,
          lastinterval: 60,
          due: 1629059712,
          factor: 2,
          views: 1,
          lapses: 0,
          ord: 20
        },
        {
          id: 6,
          fieldsetid: 3,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9386
        },
        {
          id: 7,
          fieldsetid: 4,
          templateid: 1,
          interval: 60,
          lastinterval: 60,
          due: 1629059719,
          factor: 2,
          views: 1,
          lapses: 0,
          ord: 30
        },
        {
          id: 8,
          fieldsetid: 4,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9387
        },
        {
          id: 9,
          fieldsetid: 5,
          templateid: 1,
          interval: 60,
          lastinterval: 60,
          due: 1629059696,
          factor: 2,
          views: 1,
          lapses: 0,
          ord: 40
        },
        {
          id: 10,
          fieldsetid: 5,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9388
        },
        {
          id: 11,
          fieldsetid: 6,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9389
        },
        {
          id: 12,
          fieldsetid: 7,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9390
        },
        {
          id: 13,
          fieldsetid: 7,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9390
        },
        {
          id: 14,
          fieldsetid: 8,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9391
        },
        {
          id: 15,
          fieldsetid: 8,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9391
        },
        {
          id: 16,
          fieldsetid: 9,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9392
        },
        {
          id: 17,
          fieldsetid: 9,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9392
        },
        {
          id: 18,
          fieldsetid: 10,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9393
        },
        {
          id: 19,
          fieldsetid: 10,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9393
        },
        {
          id: 20,
          fieldsetid: 11,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9394
        },
        {
          id: 21,
          fieldsetid: 11,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9394
        },
        {
          id: 22,
          fieldsetid: 12,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9395
        },
        {
          id: 23,
          fieldsetid: 12,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9395
        },
        {
          id: 24,
          fieldsetid: 13,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9396
        },
        {
          id: 25,
          fieldsetid: 13,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9396
        },
        {
          id: 26,
          fieldsetid: 14,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9397
        },
        {
          id: 27,
          fieldsetid: 14,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9397
        },
        {
          id: 28,
          fieldsetid: 15,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9398
        },
        {
          id: 29,
          fieldsetid: 15,
          templateid: 2,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9398
        },
        {
          id: 30,
          fieldsetid: 16,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9399
        },
        {
          id: 31,
          fieldsetid: 17,
          templateid: 1,
          interval: 0,
          lastinterval: 0,
          due: 0,
          factor: 2,
          views: 0,
          lapses: 0,
          ord: 9400
        }
      ], 'cards load correctly');

      const revlogs = db.prepare('select * from revlog').all();
      t.deepEqual(revlogs, [
        {
          id: 1629059006719,
          revdate: '2021-08-16',
          cardid: 1,
          ease: 'easy',
          interval: 345600,
          lastinterval: 60,
          factor: 2.5,
          viewtime: 12,
          studytime: 12,
          lapses: 0
        },
        {
          id: 1629059013936,
          revdate: '2021-08-16',
          cardid: 3,
          ease: 'easy',
          interval: 345600,
          lastinterval: 60,
          factor: 2.5,
          viewtime: 7,
          studytime: 7,
          lapses: 0
        },
        {
          id: 1629059023099,
          revdate: '2021-08-16',
          cardid: 5,
          ease: 'good',
          interval: 600,
          lastinterval: 60,
          factor: 0,
          viewtime: 9,
          studytime: 9,
          lapses: 0
        },
        {
          id: 1629059027405,
          revdate: '2021-08-16',
          cardid: 7,
          ease: 'good',
          interval: 600,
          lastinterval: 60,
          factor: 0,
          viewtime: 4,
          studytime: 4,
          lapses: 0
        },
        {
          id: 1629059039045,
          revdate: '2021-08-16',
          cardid: 9,
          ease: 'good',
          interval: 600,
          lastinterval: 60,
          factor: 0,
          viewtime: 11,
          studytime: 11,
          lapses: 0
        }
      ], 'revlog loads correctly');

      db.close();
      t.end();
    });
  });

  t.test('import from an Anki 2 shared deck', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'bin', 'cmd.js') +
      ' --directory ' + tmpDir.name +
      ' import ' + path.join(__dirname, 'data', 'Coursera_-Chinese_for_Beginners.apkg');
    exec(cmd, (err, stdout, stderr) => {
      console.log('import stdout:\n' + stdout);
      console.log('import stderr:\n' + stderr);
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }

      t.ok(fs.existsSync(tmpDir.name), 'check for data directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'srf.db')), 'check for database');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media')), 'check for media directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media', 'audio1-1exercise2.mp3')), 'check for media file');
      const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
      t.ok(db, 'get a database handle');
      t.equals(db.prepare('select value from config where name = \'srf schema version\'').get().value, dbSchema, 'check schema version');
      t.equals(db.prepare('select count() from card').get()['count()'], 31, 'check count of cards');
      t.equals(db.prepare('select count() from revlog').get()['count()'], 0, 'check count of revlog');
      db.close();
      t.end();
    });
  });

  t.test('import from an Anki 2 shared deck with revlog', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'bin', 'cmd.js') +
      ' --directory ' + tmpDir.name +
      ' import ' + path.join(__dirname, 'data', 'Coursera_-Chinese_for_Beginners_modified.apkg');
    exec(cmd, (err, stdout, stderr) => {
      console.log('import stdout:\n' + stdout);
      console.log('import stderr:\n' + stderr);
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      t.ok(fs.existsSync(tmpDir.name), 'check for data directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'srf.db')), 'check for database');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media')), 'check for media directory');
      t.ok(fs.existsSync(path.join(tmpDir.name, 'media', 'audio1-1exercise2.mp3')), 'check for media file');
      const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
      t.ok(db, 'get a database handle');
      t.equals(db.prepare('select value from config where name = \'srf schema version\'').get().value, dbSchema, 'check schema version');
      t.equals(db.prepare('select count() from card').get()['count()'], 31, 'check count of cards');
      t.equals(db.prepare('select count() from revlog').get()['count()'], 3, 'check count of revlog');
      db.close();
      t.end();
    });
  });

  t.test('import templates CSV file', t => {
    t.teardown(() => {
      tmpDir.removeCallback();
    });
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const cmd =
      path.join(__dirname, '..', 'bin', 'cmd.js') +
      ' --directory ' + tmpDir.name +
      ' import ' + path.join(__dirname, 'data', 'templates.csv');
    exec(cmd, (err, stdout, stderr) => {
      console.log('import stdout:\n' + stdout);
      console.log('import stderr:\n' + stderr);
      if (err) {
        console.log('err: ', err);
        t.fail('should not fail');
        return t.end();
      }
      const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
      t.ok(db, 'get a database handle');
      const templates = db.prepare('select * from template').all();
      t.deepEqual(templates, [
        {
          id: 1,
          templateset: 'Test1',
          name: 'Card 1',
          front: '{{Front}}',
          back: '{{Back}}',
          css: '.card {\n  Background-color: red;\n}'
        },
        {
          id: 2,
          templateset: 'Test1',
          name: 'Card 2',
          front: '{{Back}}',
          back: '{{Front}}',
          css: '.card {\n  Background-color: red;\n}'
        }
      ], 'templates loaded successfully');
      db.close();
      const cmd =
        path.join(__dirname, '..', 'bin', 'cmd.js') +
        ' --directory ' + tmpDir.name +
        ' import ' + path.join(__dirname, 'data', 'fieldsets.csv');
      exec(cmd, (err, stdout, stderr) => {
        console.log('import stdout:\n' + stdout);
        console.log('import stderr:\n' + stderr);
        if (err) {
          console.log('err: ', err);
          t.fail('should not fail');
          return t.end();
        }
        const db = require('better-sqlite3')(path.join(tmpDir.name, 'srf.db'));
        t.ok(db, 'get a database handle');
        const templates = db.prepare('select * from template').all();
        t.deepEqual(templates, [
          {
            id: 1,
            templateset: 'Test1',
            name: 'Card 1',
            front: '{{Front}}',
            back: '{{Back}}',
            css: '.card {\n  Background-color: red;\n}'
          },
          {
            id: 2,
            templateset: 'Test1',
            name: 'Card 2',
            front: '{{Back}}',
            back: '{{Front}}',
            css: '.card {\n  Background-color: red;\n}'
          }
        ], 'templates loaded successfully');
        const fieldsets = db.prepare('select * from fieldset').all();
        t.deepEqual(fieldsets, [
          {
            id: 1,
            guid: 'asdf',
            templateset: 'Test1',
            fields: '{"Front": "test front", "Back": "test back"}',
            ord: 1
          },
          {
            id: 2,
            guid: 'qwer',
            templateset: 'Test1',
            fields: '{"Front": "test front 2", "Back": "test back 2"}',
            ord: 2
          }
        ], 'fieldsets loaded successfully');
        const cards = db.prepare('select id, fieldsetid, templateid, interval, due, factor, views, lapses, ord from card').all();
        t.ok(cards.length === 4, '4 cards created');
        t.deepEqual(cards, [
          {
            id: 1,
            fieldsetid: 1,
            templateid: 1,
            interval: 0,
            due: 0,
            factor: 2,
            views: 0,
            lapses: 0,
            ord: 1
          }, {
            id: 2,
            fieldsetid: 1,
            templateid: 2,
            interval: 0,
            due: 0,
            factor: 2,
            views: 0,
            lapses: 0,
            ord: 1
          }, {
            id: 3,
            fieldsetid: 2,
            templateid: 1,
            interval: 0,
            due: 0,
            factor: 2,
            views: 0,
            lapses: 0,
            ord: 2
          }, {
            id: 4,
            fieldsetid: 2,
            templateid: 2,
            interval: 0,
            due: 0,
            factor: 2,
            views: 0,
            lapses: 0,
            ord: 2
          }
        ], 'cards created correctly');
        db.close();
        t.end();
      });
    });
  });
});
