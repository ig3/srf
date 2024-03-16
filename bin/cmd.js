#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const getopts = require('getopts');

const options = getopts(process.argv.slice(2), {
  string: ['port', 'directory', 'database', 'htdocs', 'views', 'media', 'config'],
  alias: {
    help: ['h'],
    port: ['p'],
    directory: ['dir'],
    database: ['db'],
    config: ['c'],
    verbose: ['v']
  },
  default: {
    directory: path.join(process.env.HOME, '.local', 'share', 'srf'),
    port: '8000',
    database: 'srf.db',
    media: 'media',
    htdocs: 'htdocs',
    views: 'views',
    config: 'config.json'
  },
  stopEarly: true
});

if (options.verbose) console.log('opts: ', options);

if (options.help) {
  showUsage();
} else {
  const [command, subargv] = options._;

  // Clean up the opts object
  delete options.directory;
  delete options.db;
  delete options.m;
  delete options.c;

  // Make paths absolute
  const root = path.join(process.env.HOME, '.local', 'share', 'srf');
  options.dir = resolveFullPath(root, options.dir);
  options.config = resolveFullPath(options.dir, options.config);
  options.database = resolveFullPath(options.dir, options.database);
  options.media = resolveFullPath(options.dir, options.media);
  options.htdocs = resolveFullPath(options.dir, options.htdocs);
  options.views = resolveFullPath(options.dir, options.views);

  // Make sure directories for media and database exist
  const databaseDir = path.dirname(options.database);
  fs.mkdirSync(databaseDir, { recursive: true }, (err) => {
    if (err) throw err;
  });
  fs.mkdirSync(options.media, { recursive: true }, (err) => {
    if (err) throw err;
  });

  const srf = require('../lib/srf')({
    dir: options.dir,
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
  console.log('usage:');
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
