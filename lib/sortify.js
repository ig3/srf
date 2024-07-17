'use strict';

module.exports = function (value, replacer, space) {
  if (!replacer) {
    const allKeys = [];
    const seen = {};
    JSON.stringify(value, function (key, value) {
      if (!(key in seen)) {
        allKeys.push(key);
        seen[key] = null;
      }
      return value;
    });
    replacer = allKeys.sort();
  }
  return JSON.stringify(value, replacer, space);
};
