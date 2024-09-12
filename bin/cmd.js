#!/usr/bin/env node
'use strict';

const parseArgs = require('node:util').parseArgs;
const path = require('path');

const optionsConfig = {
  help: {
    type: 'boolean',
    short: 'h',
    description: 'print usage',
  },
  port: {
    type: 'string',
    short: 'p',
    default: '8000',
    description: 'The port the server will listen on',
  },
  directory: {
    type: 'string',
    short: 'd',
    default: path.join(process.env.HOME, '.local', 'share', 'srf'),
    description: 'The directory containing the srf data',
  },
  db: {
    type: 'string',
    description: 'The name of the srf database file',
  },
  database: {
    type: 'string',
    short: 'D',
    default: 'srf.db',
    description: 'The name of the srf database file',
  },
  config: {
    type: 'string',
    short: 'c',
    default: 'config.json',
    description: 'The name of the configuraiton file',
  },
  scheduler: {
    type: 'string',
    short: 's',
    default: '@ig3/srf-scheduler',
    description: 'The scheduler plugin to load',
  },
  verbose: {
    type: 'boolean',
    short: 'v',
    description: 'Produce verbose output',
  },
  media: {
    type: 'string',
    default: 'media',
    description: 'The name of the sub-directory containing media files',
  },
  htdocs: {
    type: 'string',
    default: 'htdocs',
    description: 'The name of the sub-directory containing static content overrides',
  },
  views: {
    type: 'string',
    default: 'views',
    description: 'The name of the sub-directory containing view overrides',
  },
};

function usage (options = optionsConfig) {
  const name = path.basename(process.argv[1]);
  let usage = 'Usage: ' + name + ' [OPTIONS]\n';
  let maxOptionLength = 0;
  Object.keys(options)
  .forEach(key => {
    if (key.length > maxOptionLength) maxOptionLength = key.length;
  });
  Object.keys(options)
  .forEach(key => {
    const opt = options[key];
    let option = '  --' + key + (opt.type === 'string' ? '=ARG' : '[=BOOL]') +
      (opt.multiple ? '*' : '');
    if (opt.short) {
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

function main () {
  const { values: options, positionals } =
    parseArgs({
      options: optionsConfig,
      allowPositionals: true,
    });

  if (options.verbose) console.log('opts: ', options);

  if (options.help) {
    return console.log(usage());
  }

  const [command, subargv] = positionals;

  // Make paths absolute
  const root = path.join(process.env.HOME, '.local', 'share', 'srf');
  options.directory = resolveFullPath(root, options.directory);
  ['config', 'database', 'media', 'htdocs', 'views']
  .forEach(dir => {
    options[dir] = resolveFullPath(options.directory, options[dir]);
  });

  const srf = require('../lib/srf')({
    directory: options.directory,
    database: options.database,
    media: options.media,
    config: options.config,
    scheduler: options.scheduler,
  });

  ['SIGTERM', 'SIGINT']
  .forEach(signal => {
    process.on(signal, () => {
      srf.shutdown();
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
    throw new Error('Unsupported command: ' + command);
  }
}

try {
  main();
} catch (err) {
  console.error('failed with error:');
  console.error('    ' + err.message);
  console.error('    ' + err.stack);
  console.error(usage());
  process.exitCode = 1;
}
