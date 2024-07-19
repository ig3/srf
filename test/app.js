'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('path');
// const wtf = require('wtfnode');

const tmpdir = fs.mkdtempSync(path.join(__dirname, 'data', 'tmp'));
process.on('exit', () => {
  fs.rmSync(tmpdir, { recursive: true, force: true });
});
const appdir = path.join(tmpdir, 'app');
fs.mkdirSync(appdir);

t.test('express app', async t => {
  await t.test('srf is required', t => {
    t.throws(
      () => {
        const app = require('../lib/app.js')();
        console.log('app: ', app);
        t.fail('require should throw');
      },
      /srf instance is required/,
      'srf instance is required'
    );
    t.end();
  });

  await t.test('app loads and shuts down', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
      views: '/tmp',
      htdocs: '/tmp',
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
    listener.close();
    t.end();
  });

  const srf = require('../lib/srf.js')({
    directory: appdir,
  });
  const app = require('../lib/app.js')(srf);
  const listener = app.listen();
  const port = listener.address().port;

  await t.test('get /next', t => {
    return fetch('http://localhost:' + port + '/next')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /studyNow', t => {
    return fetch('http://localhost:' + port + '/studyNow')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get bad path', t => {
    return fetch('http://localhost:' + port + '/no-such-page')
    .then(response => {
      t.equal(response.status, 404, 'Response status is 404');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, 'Not found', 'body is "Not found"');
      t.end();
    });
  });

  await t.test('get home page', t => {
    return fetch('http://localhost:' + port + '/')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data.indexOf('<!DOCTYPE html>'), 0, 'doc starts with <!DOCTYPE html>');
      t.end();
    });
  });

  await t.test('POST /template/0', t => {
    return fetch(
      'http://localhost:' + port + '/template/0',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          name: 'Card1',
          front: '{{English}}',
          back: '{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}',
          css: '.card { font-size: 35px; }',
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, 'ok', 'ok response');
      t.end();
    });
  });

  await t.test('POST /template/0', t => {
    return fetch(
      'http://localhost:' + port + '/template/0',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          name: 'Card2',
          front: '{{Hanzi}}',
          back: '{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}',
          css: '.card { font-size: 35px; }',
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, 'ok', 'ok response');
      t.end();
    });
  });

  await t.test('get /rest/templateset/9999', t => {
    return fetch('http://localhost:' + port + '/rest/templateset/9999')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, '{"name":"9999","templates":[],"fields":[],"fieldsJSON":"[]"}', 'body an empty template set');
      try {
        const x = JSON.parse(data);
        t.deepEqual(x, { name: '9999', templates: [], fields: [], fieldsJSON: '[]' }, 'templateset has no members');
      } catch (err) {
        t.fail('should not throw');
        console.log('err: ', err);
      }
      t.end();
    });
  });

  await t.test('get /rest/templateset/ts1', t => {
    return fetch('http://localhost:' + port + '/rest/templateset/ts1')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, '{"name":"ts1","templates":[{"id":1,"templateset":"ts1","name":"Card1","front":"{{English}}","back":"{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}","css":".card { font-size: 35px; }"},{"id":2,"templateset":"ts1","name":"Card2","front":"{{Hanzi}}","back":"{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}","css":".card { font-size: 35px; }"}],"fields":["English","Audio","Hanzi","Pinyin"],"fieldsJSON":"[\\"English\\",\\"Audio\\",\\"Hanzi\\",\\"Pinyin\\"]"}', 'got templateset data');
      try {
        const x = JSON.parse(data);
        t.deepEqual(
          x,
          {
            name: 'ts1',
            templates: [
              {
                id: 1,
                templateset: 'ts1',
                name: 'Card1',
                front: '{{English}}',
                back: '{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}',
                css: '.card { font-size: 35px; }',
              },
              {
                id: 2,
                templateset: 'ts1',
                name: 'Card2',
                front: '{{Hanzi}}',
                back: '{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}',
                css: '.card { font-size: 35px; }',
              },
            ],
            fields: ['English', 'Audio', 'Hanzi', 'Pinyin'],
            fieldsJSON: '["English","Audio","Hanzi","Pinyin"]',
          }, 'templateset parses ok');
      } catch (err) {
        t.fail('should not throw');
        console.log('err: ', err);
      }
      t.end();
    });
  });

  await t.test('get /template/9999', t => {
    return fetch('http://localhost:' + port + '/template/9999')
    .then(response => {
      t.equal(response.status, 500, 'Response status is 500');
      t.equal(response.statusText, 'Internal Server Error', 'Internal Server Error');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /template', t => {
    return fetch('http://localhost:' + port + '/template')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      // express-handlebars trims templates
      const expect = fs.readFileSync('test/data/template.html', 'utf-8').trim();
      t.equal(data, expect, 'template page rendered as expected');
      t.end();
    });
  });

  await t.test('POST /template/1', t => {
    return fetch(
      'http://localhost:' + port + '/template/1',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          name: 'Card2',
          front: '{{Audio}}',
          back: '{{Audio}}<br>{{Hanzi}}<br>{{Pinyin}}<br>{{English}}',
          css: '.card { font-size: 35px; }',
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, 'ok', 'ok response');
      t.end();
    });
  });

  await t.test('get /templates', t => {
    return fetch('http://localhost:' + port + '/templates')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      const expect = fs.readFileSync('test/data/templates.html', 'utf-8').trim();
      t.equal(data, expect, 'templates page rendered as expected');
      t.end();
    });
  });

  await t.test('get /templateset/ts1', t => {
    return fetch('http://localhost:' + port + '/templateset/ts1')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      const expect = fs.readFileSync('test/data/templateset-ts1.html', 'utf-8').trim();
      t.equal(data, expect, 'templates page rendered as expected');
      t.end();
    });
  });

  await t.test('get /templateset', t => {
    return fetch('http://localhost:' + port + '/templateset')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /templatesets', t => {
    return fetch('http://localhost:' + port + '/templatesets')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('POST /fieldset/new', t => {
    return fetch(
      'http://localhost:' + port + '/fieldset/new',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          ord: 1,
          fields: {
            Hanzi: '你好！',
            Pinyin: 'Nǐ hǎo!',
            English: 'Hello!',
          },
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.equal(data, 'ok', 'ok response');
      t.end();
    });
  });

  await t.test('POST /fieldset/new', t => {
    return fetch(
      'http://localhost:' + port + '/fieldset/new',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          ord: 1,
          fields: {
            Hanzi: '我会做。',
            Pinyin: 'Wǒ huì zuò.',
            English: 'I know how to do it.',
            Audio: '[sound:audio1.mp3]',
          },
          files: [
            {
              meta: {
                name: 'audio1.mp3',
              },
              data: 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//tUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AABvZACnGQAADBQgKDRASFBYaHB8hJCcpKy0xMzY4Oz5AQkRISk1PUlVXWVtfYWNmaWxucHJ2eHp9gIOFh4mNj5GUlpmcnqCkpqirrbCztbe7vb/CxMfKzM7S1NbZ297h4+Xp6+3w8vX4+vwAAAAATGF2YzU4LjkxAAAAAAAAAAAAAAAAJAS0AAAAAAApxkDjNiJp//uUZAAAAy4OUJUwwAIq4ViApggAD0CTS7nHgBDdjGVbDmAAAABgAAIA0JjJLBuI5bcowsWLFixYFkyZMmTJk00AAAAAAPDw8PDAAAAAAPDw8PDAAAAAAPDw8PDAAAAAAPDw8PSAAB/h7//X//////gAAIDw8PPwAAAz3h4eHhgAAAAAHh4eHpABevXr16/2BIAmB8Sz9+97vgAAAAhE4IAh8H4Pg+f/BDgmD4f+UM//wx/g+AE0kiSkrI3G4gGAwEABQYAkwY7gIKXJkAbEwkVOX6MQBlQIAApPpNYv0p9lEUaCZZyoeTtIrDiQ5iVNKMYu8IAyCpE9S6kSx5jiPhDXxzK6LNTHsn4ytVTSrXFuZnKDnNrW09wxNYIBoRPO/oER8Jf5ZqoS/9VpaEiwACBoCCCCCHcoEwTAtPQm/e7nhZas13xsvtuQlhyUtn/OBgaARa2Kae5OqzV5MbbR4C6n//UN7Qr+UyadI+6Lc9hJ4xfY0yYFcAAOAgQMFQQD//uUZA0Mw5Qgyxd3AAAvQkkR4pgADyRxIC93IECuhiSEASSigwMAwAbshJgVuUcFQIas6Q8WQoJErxoJQ5Yq9Y8q4a0+0nmM+YX+S6Nx+K2audq525X5+6tmpvHmO//v1hcICYPAA2xYogVCKqS9I…',
            },
          ],
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.equal(data, 'ok', 'ok response');
      if (fs.existsSync(path.join(appdir, 'media', 'audio1.mp3'))) {
        t.pass('audio file audio1.mp3 exists');
      } else {
        t.fail('audio file audio1.mp3 does not exist');
      }
      t.end();
    });
  });

  await t.test('POST /fieldset/2', t => {
    return fetch(
      'http://localhost:' + port + '/fieldset/2',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateset: 'ts1',
          ord: 1,
          fields: {
            Hanzi: '我会做。',
            Pinyin: 'Wǒ huì zuò.',
            English: 'I can to do it.',
            Audio: '[sound:audio1.mp3]',
          },
          files: [
          ],
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.equal(data, 'ok', 'ok response');
      t.end();
    });
  });

  await t.test('get /fieldset', t => {
    return fetch('http://localhost:' + port + '/fieldset')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /fieldset/1', t => {
    return fetch('http://localhost:' + port + '/fieldset/1')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /fieldsets', t => {
    return fetch('http://localhost:' + port + '/fieldsets')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /stats', t => {
    return fetch('http://localhost:' + port + '/stats')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('POST /card/1', t => {
    return fetch(
      'http://localhost:' + port + '/card/1',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime: Math.floor(Date.now() / 1000) - 10,
          ease: 'good',
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, '{"cardAvailable":true}', 'ok response');
      t.end();
    });
  });

  await t.test('POST /card/1', t => {
    return fetch(
      'http://localhost:' + port + '/card/1',
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime: Math.floor(Date.now() / 1000) - 10,
          ease: 'good',
        }),
      }
    )
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, '{"cardAvailable":true}', 'ok response');
      t.end();
    });
  });

  await t.test('get /card/1/front', t => {
    return fetch('http://localhost:' + port + '/card/1/front')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /card/10/front', t => {
    return fetch('http://localhost:' + port + '/card/10/front')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /card/1/back', t => {
    return fetch('http://localhost:' + port + '/card/1/back')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /card/2/back', t => {
    return fetch('http://localhost:' + port + '/card/2/back')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /card/10/back', t => {
    return fetch('http://localhost:' + port + '/card/10/back')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /new', t => {
    return fetch('http://localhost:' + port + '/new')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /studyNow', t => {
    return fetch('http://localhost:' + port + '/studyNow')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /next', t => {
    return fetch('http://localhost:' + port + '/next')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /stats', t => {
    return fetch('http://localhost:' + port + '/stats')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /help', t => {
    return fetch('http://localhost:' + port + '/help')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /config', t => {
    return fetch('http://localhost:' + port + '/config')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /admin', t => {
    return fetch('http://localhost:' + port + '/admin')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  await t.test('get /template/1', t => {
    return fetch('http://localhost:' + port + '/template/1')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  const db = require('better-sqlite3')(
    path.join(appdir, 'srf.db')
  );
  console.log('db: ', typeof db);
  db.prepare('update card set due = ?, interval = 10')
  .run(Math.floor(Date.now() / 1000) + 10);

  await t.test('get /new', t => {
    return fetch('http://localhost:' + port + '/new')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.end();
    });
  });

  listener.close();
  // wtf.dump();
  t.end();
});
