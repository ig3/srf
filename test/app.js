'use strict';

const t = require('@ig3/test');
const fs = require('fs');
const path = require('path');

t.test('express app', t => {
  t.test('srf is required', t => {
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
  t.test('app loads and shuts down', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
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
  t.test('get home page', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
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
  t.test('get bad path', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
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
  t.test('get /rest/templateset/:id', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
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
  t.test('get /template/:id', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
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

  t.test('get /template', t => {
    const srf = require('../lib/srf.js')({
      directory: path.join(__dirname, '/data/app'),
    });
    t.ok(srf, 'got an srf instance');
    const app = require('../lib/app.js')(srf);
    t.ok(app, 'got an app instance');
    const listener = app.listen();
    const port = listener.address().port;
    t.ok(port, 'got a port');
    return fetch('http://localhost:' + port + '/template')
    .then(response => {
      t.equal(response.status, 200, 'Response status is 200');
      return response.text();
    })
    .then(data => {
      t.ok(data, 'got response data');
      console.log('data: ', data);
      // express-handlebars trims templates
      const expect = fs.readFileSync('test/data/template.html', 'utf-8').trim();
      t.equal(data, expect, 'template page rendered as expected');
      listener.close();
      t.end();
    });
  });
  t.end();
});
