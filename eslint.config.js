'use strict';

const eslintConfigEntrain = require('@ig3/eslint-config-entrain');

module.exports = [
  ...eslintConfigEntrain,
  {
    ignores: ['public/js/**'],
  },
];
