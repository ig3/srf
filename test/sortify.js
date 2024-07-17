'use strict';

const t = require('@ig3/test');
const sortify = require('../lib/sortify.js');

t.test('sortify', t => {
  t.test('basic', t => {
    const x = sortify({
      b: 1,
      a: 2,
      c: 3,
    });
    t.equal(x, '{"a":2,"b":1,"c":3}', 'sorted');
    t.end();
  });
  t.end();
});
