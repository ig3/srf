'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('path');

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
  await t.test('get bad path', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
    return fetch('http://localhost:' + port + '/no-such-page')
    .then(response => {
      t.equal(response.status, 404, 'Response status is 404');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data, 'Not found', 'body is "Not found"');
      listener.close();
      t.end();
    });
  });
  await t.test('get home page', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
    return fetch('http://localhost:' + port + '/')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      t.equal(data.indexOf('<!DOCTYPE html>'), 0, 'doc starts with <!DOCTYPE html>');
      listener.close();
      t.end();
    });
  });
  await t.test('POST /template/0', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
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
      listener.close();
      t.end();
    });
  });
  await t.test('POST /template/0', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
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
      listener.close();
      t.end();
    });
  });
  await t.test('get /rest/templateset/9999', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
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
      listener.close();
      t.end();
    });
  });

  await t.test('get /rest/templateset/ts1', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
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
      listener.close();
      t.end();
    });
  });

  await t.test('get /template/9999', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
    return fetch('http://localhost:' + port + '/template/9999')
    .then(response => {
      t.equal(response.status, 500, 'Response status is 500');
      t.equal(response.statusText, 'Internal Server Error', 'Internal Server Error');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      listener.close();
      t.end();
    });
  });

  await t.test('get /template', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
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
      listener.close();
      t.end();
    });
  });

  await t.test('POST /template/1', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
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
      listener.close();
      t.end();
    });
  });

  await t.test('get /templates', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
    return fetch('http://localhost:' + port + '/templates')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      const expect = fs.readFileSync('test/data/templates.html', 'utf-8').trim();
      t.equal(data, expect, 'templates page rendered as expected');
      console.log('templates data: ', data);
      listener.close();
      t.end();
    });
  });

  await t.test('get /templateset/ts1', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
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
      listener.close();
      t.end();
    });
  });

  await t.test('get /templateset', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
    return fetch('http://localhost:' + port + '/templateset')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      listener.close();
      t.end();
    });
  });

  await t.test('get /templatesets', t => {
    const srf = require('../lib/srf.js')({
      directory: appdir,
    });
    const app = require('../lib/app.js')(srf);
    const listener = app.listen();
    const port = listener.address().port;
    return fetch('http://localhost:' + port + '/templatesets')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      t.equal(response.statusText, 'OK', 'OK');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      listener.close();
      t.end();
    });
  });

  t.end();
});
