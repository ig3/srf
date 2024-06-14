#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const optionsConfig = {
  help: {
    type: 'boolean',
    short: 'h',
    description: 'print usage'
  },
  port: {
    type: 'string',
    short: 'p',
    default: '8000',
    description: 'The port the server will listen on'
  },
  dir: {
    type: 'string',
    description: 'Alias for directory'
  },
  directory: {
    type: 'string',
    short: 'd',
    default: path.join(process.env.HOME, '.local', 'share', 'srf'),
    description: 'The directory containing the srf data'
  },
  db: {
    type: 'string',
    description: 'The name of the srf database file'
  },
  database: {
    type: 'string',
    short: 'D',
    default: 'srf.db',
    description: 'The name of the srf database file'
  },
  config: {
    type: 'string',
    short: 'c',
    default: 'config.json',
    description: 'The name of the configuraiton file'
  },
  verbose: {
    type: 'boolean',
    short: 'v',
    description: 'Produce verbose output'
  },
  media: {
    type: 'string',
    default: 'media',
    description: 'The name of the sub-directory containing media files'
  },
  htdocs: {
    type: 'string',
    default: 'htdocs',
    description: 'The name of the sub-directory containing static content overrides'
  },
  views: {
    type: 'string',
    default: 'views',
    description: 'The name of the sub-directory containing view overrides'
  }
};

const { values: options, positionals } = ((optionsConfig) => {
  try {
    const parseArgs = require('node:util').parseArgs;
    return parseArgs({
      options: optionsConfig,
      allowPositionals: true
    });
  } catch (e) {
    console.log('failed with error:');
    console.log('    ' + e.code);
    console.log('    ' + e.message);
    console.log(usage(optionsConfig));
    showUsage();
    process.exit(1);
  }
})(optionsConfig);

if (options.dir) {
  console.warning('Option dir is deprecated');
  if (options.directory === optionsConfig.directory.default) {
    options.directory = options.dir;
  } else if (options.dir !== options.directory) {
    console.error('Use one of option dir or directory, not both');
    process.exit(1);
  }
}

if (options.db) {
  console.warning('Option db is deprecated');
  if (options.database === optionsConfig.database.default) {
    options.database = options.db;
  } else if (options.db !== options.database) {
    console.error('Use one of option db or database, not both');
    process.exit(1);
  }
}

function usage (optionsConfig) {
  let name = path.basename(process.argv[1]);
  let usage = 'Usage: ' + name + ' [OPTIONS]\n';
  let maxOptionLength = 0;
  Object.keys(optionsConfig)
  .forEach(key => {
    if (key.length > maxOptionLength) maxOptionLength = key.length;
  });
  Object.keys(optionsConfig)
  .forEach(key => {
    const opt = optionsConfig[key];
    let option = '  --' + key + (opt.type === 'string' ? '=ARG' : '[=BOOL]') +
      (opt.multiple ? '*' : '');
    if (opt.shart) {
      option += ',';
      option = option.padEnd(maxOptionLength + 12, ' ');
      option += '-' + opt.short;
    }
    if (opt.default) {
      option = option.padEnd(maxOptionLength + 16, ' ');
      option += '(default: ' +
        (opt.multiple ? opt.default.join(',') : opt.default) + ')';
    }
    if (opt.description) {
      option += '\n      ' + opt.description;
    }
    usage += option + '\n\n';
  });
  return usage;
}

if (options.verbose) console.log('opts: ', options);

if (options.help) {
  showUsage();
} else {
  const [command, subargv] = positionals;

  // Make paths absolute
  const root = path.join(process.env.HOME, '.local', 'share', 'srf');
  options.directory = resolveFullPath(root, options.directory);
  options.config = resolveFullPath(options.directory, options.config);
  options.database = resolveFullPath(options.directory, options.database);
  options.media = resolveFullPath(options.directory, options.media);
  options.htdocs = resolveFullPath(options.directory, options.htdocs);
  options.views = resolveFullPath(options.directory, options.views);

  // Make sure directories for media and database exist
  const databaseDir = path.dirname(options.database);
  fs.mkdirSync(databaseDir, { recursive: true }, (err) => {
    if (err) throw err;
  });
  fs.mkdirSync(options.media, { recursive: true }, (err) => {
    if (err) throw err;
  });

  const srf = require('../lib/srf')({
    directory: options.directory,
    database: options.database,
    media: options.media,
    config: options.config
  });

  ['SIGTERM', 'SIGINT']
  .forEach(signal => {
    process.on(signal, () => {
      console.log('caught: ' + signal);
      Promise.resolve()
      .then(() => {
        srf.shutdown();
      })
      .then(() => {
        srf.close();
      })
      .then(() => {
        process.exit();
      });
    });
  });

  if (command === 'import') {
    srf.importFile(subargv);
  } else if (command === 'backup') {
    srf.backupDatabase();
  } else if (command === 'fix') {
    srf.backupDatabase();
    srf.fixDatabase();
  } else if (command === undefined || command === 'run') {
    srf.runServer(options, subargv);
  } else {
    console.error('Unsupported command: ' + command);
    showUsage();
    process.exit(1);
  }
}

function showUsage () {
  console.log('Usage:');
  console.log('  ' +
    path.basename(process.argv[1]) +
    ' --help');
  console.log('  ' +
    path.basename(process.argv[1]) +
    ' [--port <port>]' +
    ' [--directory <root-directory>]' +
    ' [--config <config-file>]' +
    ' [--htdocs <htdocs-directory>]' +
    ' [--views <views-directory>]' +
    ' [--media <media-directory>]' +
    ' [--database <database-name>]');
  console.log('  ' +
    path.basename(process.argv[1]) +
    ' [--directory <root-directory>]' +
    ' [--config <config-file>]' +
    ' [--media <media-directory>]' +
    ' [--database <database-name>]' +
    ' import <filename>');
}

function resolveFullPath (root, p) {
  if (p.substr(0, 1) === '/') {
    return p;
  }
  if (p === '~') {
    return process.env.HOME;
  }
  if (p.substr(0, 2) === '~/') {
    return path.join(process.env.HOME, p.substr(2));
  }
  return path.join(root, p);
}
