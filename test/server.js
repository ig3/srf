'use strict';

const t = require('@ig3/test');

t.test('srf server', t => {
  t.test('server loads', t => {
    const srf = require('../lib/srf.js')({
      directory: 'test/data/srf',
    });
    t.ok(srf, 'srf is set');
    srf.runServer();
    srf.shutdown();
    t.pass('survived!!');
    t.end();
  });
  t.end();
});
