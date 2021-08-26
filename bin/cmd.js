#!/usr/local/bin/node
'use strict';

console.log('starting cmd.js');
const fs = require('fs');
const path = require('path');
const tc = require('timezonecomplete');
const { v4: uuidv4 } = require('uuid');

// let db; // better-sqlite3 database handle

// startTime is the time when this execution of the server started.
const startTime = Math.floor(Date.now() / 1000);

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay;

// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime;

// card is the current card. Updated when a new card is shown.
let card;

const getopts = require('getopts');
const opts = getopts(process.argv.slice(2), {
  string: ['directory', 'database', 'media', 'config'],
  alias: {
    help: ['h'],
    directory: ['dir'],
    database: ['db'],
    media: ['m'],
    config: ['c']
  },
  default: {
    directory: path.join(process.env.HOME, '.local', 'share', 'srf'),
    database: 'srf.db',
    media: 'media',
    config: 'config.json'
  },
  stopEarly: true
});

console.log('opts: ', opts);

if (opts.help) {
  console.log(process.argv);
  console.log(path.basename(process.argv[1]));
  showUsage();
} else {
  const [command, subargv] = opts._;

  // Clean up the opts object
  delete opts.directory;
  delete opts.db;
  delete opts.m;
  delete opts.c;

  // Make paths absolute
  if (opts.dir.substr(0, 1) !== '/') {
    opts.dir = path.join(process.env.HOME, '.local', 'share', opts.dir);
  }
  if (opts.config.substr(0, 1) !== '/') {
    opts.config = path.join(opts.dir, opts.config);
  }
  if (opts.database.substr(0, 1) !== '/') {
    opts.database = path.join(opts.dir, opts.database);
  }
  if (opts.media.substr(0, 1) !== '/') {
    opts.media = path.join(opts.dir, opts.media);
  }

  // Make sure directories for media and database exist
  const databaseDir = path.dirname(opts.database);
  fs.mkdirSync(databaseDir, { recursive: true }, (err) => {
    if (err) throw err;
  });
  fs.mkdirSync(opts.media, { recursive: true }, (err) => {
    if (err) throw err;
  });

  if (command === 'import') {
    importFile(opts, subargv);
  } else if (command === undefined || command === 'run') {
    runServer(opts, subargv);
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
    ' [--directory <root-directory>]' +
    ' [--config <config-file>]' +
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

/**
 * getTemplatesetFields returns an array of all fields for the template
 * set.
 *
 * Every field in every template in the set must be in the field set, but
 * the field set may contain fields that are not in any of the templates.
 *
 * New fields are appended to the end of the field array.
 */
// Not using this function but don't want to remove it
// eslint-disable-next-line
function getTemplatesetFields (templateset) {
  const fields = {};
  templateset.templates.forEach(template => {
    getMustacheTags(template.front).forEach(field => { fields[field] = 1; });
    getMustacheTags(template.back).forEach(field => { fields[field] = 1; });
  });
  const fieldsArray = [...templateset.fields];
  Object.keys(fields).forEach(field => {
    if (fieldsArray.indexOf(field) === -1) {
      fieldsArray.push(field);
    }
  });
  return fieldsArray;
}

function runServer (opts, args) {
  console.log('run server ', opts, args);

  const srf = require('../lib/srf')({
    dir: opts.dir,
    database: opts.database,
    media: opts.media,
    config: opts.config
  });

  process.on('SIGINT', () => {
    console.log('closing database connection');
    srf.close();
    process.exit();
  });

  const mediaDir = opts.media;

  const express = require('express');
  const app = express();
  const favicon = require('serve-favicon');
  app.use(favicon(path.join(__dirname, '..', 'public', 'favicon.ico')));
  const expressHandlebars = require('express-handlebars');
  const hbsFormHelper = require('handlebars-form-helper');
  const hbs = expressHandlebars.create({});
  hbsFormHelper.registerHelpers(hbs.handlebars, { namespace: 'form' });
  app.engine('handlebars', expressHandlebars());
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'handlebars');
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.static(mediaDir));
  app.use(express.json({ limit: '50MB' }));

  // Mustache works for the Anki templates - it allows spaces in the tag keys
  // I had first tried Handlebars but it doesn't allow spaces in the tag keys
  // Links to sound and images don't work - Anki uses a 'special' syntax
  // But, maybe I can write a 'helper'
  const Mustache = require('mustache');
  Mustache.escape = function (text) {
  //  console.log('text: ', text);
    if (/\[sound:.*\]/.test(text)) {
      const src = [];
      for (const m of text.matchAll(/\[sound:(.*?)\]/g)) {
        src.push(m[1]);
      }
      let result = '<audio id="myaudio" autoplay controls></audio></br>';
      result += '<script>';
      result += 'var audioFiles = ["' + src.join('","') + '"];';
      result += '</script>';
      //    console.log('result: ', result);
      return result;
    } else {
      return text;
    }
  };

  // Add middleware for common code to every request
  app.use((req, res, next) => {
    now = Math.floor(Date.now() / 1000);
    req.startTime = now;
    const newStartOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
    if (newStartOfDay !== startOfDay) {
      console.log(new Date().toString());
      startOfDay = newStartOfDay;
    }
    next();
  });

  app.get('/', (req, res) => {
    const studyTimeToday = srf.getStudyTimeToday();
    const viewedToday = srf.getCountCardsViewedToday();
    const dueToday = srf.getCountCardsDueToday();
    const dueStudyTime = srf.getEstimatedStudyTime(dueToday);
    const nextDue = srf.getNextDue();

    const dueNow = srf.getCountCardsDueNow();
    const nextCard = srf.getNextCard();
    const studyNow = !!nextCard;
    const statsPast24Hours = srf.getStatsPast24Hours();
    statsPast24Hours.time = Math.floor(statsPast24Hours.time / 60);
    const statsNext24Hours = srf.getStatsNext24Hours();
    statsNext24Hours.time = Math.floor(statsNext24Hours.time / 60);
    const timeToNextDue = tc.seconds((nextDue || now) - now);
    const percentCorrect = srf.getPercentCorrect();
    const overdue = srf.getCountCardsOverdue();
    const chart1Data = srf.getChartDuePerHour();
    const newCardsSeen = srf.getCountNewCardsPast24Hours();
    const newCardsRemaining = srf.getCountNewCardsRemaining();
    res.render('home', {
      viewedToday: viewedToday,
      studyTimeToday: Math.floor(studyTimeToday / 60),
      dueToday: dueToday,
      dueStudyTime: Math.floor(dueStudyTime / 60),
      totalToday: viewedToday + dueToday,
      totalStudyTime: Math.floor((studyTimeToday + dueStudyTime) / 60),
      dueNow: dueNow,
      timeToNextDue: timeToNextDue.toFullString().slice(0, -4),
      chart1Data: JSON.stringify(chart1Data),
      studyNow: studyNow,
      studyTimePast24Hours: Math.floor(statsPast24Hours.time / 60),
      viewedPast24Hours: statsPast24Hours.count,
      statsPast24Hours: statsPast24Hours,
      statsNext24Hours: statsNext24Hours,
      percentCorrect: percentCorrect.toFixed(2),
      overdue: overdue,
      newCardsSeen: newCardsSeen,
      newCardsRemaining: newCardsRemaining
    });
  });

  app.get('/help', (req, res) => {
    res.render('help');
  });

  app.get('/stats', (req, res) => {
    const studyTimeToday = srf.getStudyTimeToday();
    const cardsViewedToday = srf.getCountCardsViewedToday();
    const dueCount = srf.getCountCardsDueToday();
    const nextDue = srf.getNextDue() || now;

    const chart1Data = srf.getChartCardsStudiedPerDay();
    const chart2Data = srf.getChartMinutesStudiedPerDay();
    const chart3Data = srf.getChartCardsDuePerDay();
    const chart4Data = srf.getChartCardsPerInterval();
    const chart5Data = srf.getChartNewCardsPerDay();
    const chart6Data = srf.getChartMaturedAndLapsedPerDay();

    const cardsSeen = srf.getCountCardsSeen();
    const matureCards = srf.getCountMatureCards();
    const days = srf.getCountDaysStudied();
    const newCardsPerDay = (cardsSeen && days) ? cardsSeen / days : 0;

    res.render('stats', {
      dueCount: dueCount,
      timeToNextDue: tc.seconds(nextDue - now).toFullString(),
      cardsViewedToday: cardsViewedToday,
      studyTimeToday: tc.seconds(studyTimeToday).toFullString(),
      estimatedTotalStudyTime: tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
      averageTimePerCard: srf.getAverageTimePerCard(),
      newCardsPerDay: newCardsPerDay.toFixed(2),
      cardsSeen: cardsSeen,
      matureCards: matureCards,
      chart1Data: JSON.stringify(chart1Data),
      chart2Data: JSON.stringify(chart2Data),
      chart3Data: JSON.stringify(chart3Data),
      chart4Data: JSON.stringify(chart4Data),
      chart5Data: JSON.stringify(chart5Data),
      chart6Data: JSON.stringify(chart6Data)
    });
  });

  app.get('/study', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'study.html'));
  });

  app.get('/front', (req, res) => {
    card = srf.getNextCard();
    if (card) {
      if (card.interval === 0) console.log('new card');
      cardStartTime = now;
      const fields = srf.getFields(card.fieldsetid);
      const template = srf.getTemplate(card.templateid);
      card.template = template;
      // TODO: handle the special fields {{Tags}}, {{Type}}, {{Deck}},
      // {{Subdeck}}, {{Card}} and {{FrontSide}}
      card.front = Mustache.render(template.front, fields);
      fields.FrontSide = card.front;
      card.back = Mustache.render(template.back, fields);
      res.render('front', {
        front: card.front,
        template: template
      });
    } else {
      res.redirect('/');
    }
  });

  app.get('/back', (req, res) => {
    if (!card) {
      return res.redirect('/');
    }
    res.render('back', {
      back: card.back,
      template: card.template
    });
  });

  app.get('/again', (req, res) => {
    if (card) {
      srf.reviewCard(card, now - cardStartTime, 'again');
    }
    res.redirect('/front');
  });

  app.get('/hard', (req, res) => {
    if (card) {
      srf.reviewCard(card, now - cardStartTime, 'hard');
    }
    res.redirect('/front');
  });

  app.get('/good', (req, res) => {
    if (card) {
      srf.reviewCard(card, now - cardStartTime, 'good');
    }
    res.redirect('/front');
  });

  app.get('/easy', (req, res) => {
    if (card) {
      srf.reviewCard(card, now - cardStartTime, 'easy');
    }
    res.redirect('/front');
  });

  app.get('/fieldsets', (req, res) => {
    const fieldsets = srf.getFieldsets();
    res.render('fieldsets', {
      fieldsets: fieldsets
    });
  });

  app.get('/fieldset/:id', (req, res) => {
    const fieldset = srf.getFieldset(req.params.id);
    console.log('fieldset: ', fieldset);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    console.log('templatesets: ', templatesets);
    res.render('fieldset', {
      fieldset: fieldset,
      templatesets: templatesets
    });
  });

  app.get('/fieldset', (req, res) => {
    const fieldset = {
      id: 'new',
      guid: '',
      templatesetid: '',
      fields: {}
    };
    fieldset.templatesetid = srf.getTemplatesets()[0].id;
    fieldset.templateset = srf.getTemplateset(fieldset.templatesetid);
    fieldset.templateset.fields.forEach(field => {
      fieldset.fields[field] = '';
    });
    console.log('fieldset: ', fieldset);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    res.render('fieldset', {
      fieldset: fieldset,
      templatesets: templatesets
    });
  });

  app.post('/fieldset/:id', (req, res) => {
    console.log('save fieldset ' + req.params);
    if (req.params.id === 'new') {
      console.log('create a new fieldset');
      console.log('body ', req.body);
      const templatesetid = req.body.templatesetid;
      console.log('templatesetid: ', templatesetid);
      const fields = JSON.stringify(req.body.fields);
      console.log('fields: ', fields);
      srf.createFieldset(uuidv4(), templatesetid, fields);
    } else {
      console.log('update an existing fieldset');
      console.log('body ', req.body);
      const fieldsetid = req.params.id;
      const templatesetid = req.body.templatesetid;
      console.log('templatesetid: ', templatesetid);
      const fields = JSON.stringify(req.body.fields);
      console.log('fields: ', fields);
      srf.updateFieldset(templatesetid, fields, fieldsetid);
    }
    const files = req.body.files;
    if (files && files.length > 0) {
      files.forEach(file => {
        console.log('save file: ', file.meta.name);
        console.log('save file: ', file.meta.type);
        console.log('save file: ', file.meta);
        const filepath = path.join(mediaDir, file.meta.name);
        const buff = Buffer.from(file.data.substring(23), 'base64');
        fs.writeFileSync(filepath, buff);
      });
    }
    res.send('ok');
  });

  app.get('/templatesets', (req, res) => {
    const templatesets = srf.getTemplatesets();
    console.log('templatesets: ', templatesets);
    res.render('templatesets', {
      templatesets: templatesets
    });
  });

  app.get('/templateset/:id', (req, res) => {
    const templateset = srf.getTemplateset(req.params.id);
    res.render('templateset', templateset);
  });

  app.get('/templateset', (req, res) => {
    res.render('templateset', {
      id: 0,
      name: 'new',
      templatesJSON: '[]',
      fieldsJSON: '[]'
    });
  });

  app.post('/templateset/:id', (req, res) => {
    let id = req.params.id;
    const name = req.body.name;
    const fields = JSON.stringify(JSON.parse(req.body.fields));
    if (id === '0') {
      const info = srf.createTemplateset(name, fields);
      id = info.lastInsertRowid;
    } else {
      srf.updateTemplateset(name, fields, id);
    }
    res.send('ok');
  });

  app.get('/templates', (req, res) => {
    const templates = srf.getTemplates();
    res.render('templates', {
      templates: templates
    });
  });

  app.get('/template/:id', (req, res) => {
    const template = srf.getTemplate(req.params.id);
    console.log('template: ', template);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    console.log('templatesets: ', templatesets);
    res.render('template', {
      template: template,
      templatesets: templatesets
    });
  });

  app.get('/template', (req, res) => {
    const template = {
      id: 0,
      templatesetid: srf.getTemplatesets()[0].id,
      name: '',
      front: '',
      back: '',
      css: ''
    };
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    console.log('templatesets: ', templatesets);
    res.render('template', {
      template: template,
      templatesets: templatesets
    });
  });

  app.post('/template/:id', (req, res) => {
    console.log('save template ', req.params);
    console.log('id ' + typeof req.params.id);
    if (req.params.id === '0') {
      console.log('create a new template');
      console.log('body ', req.body);
      srf.createTemplate(
        req.body.templatesetid,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css
      );
      res.send('ok');
    } else {
      console.log('update an existing template');
      console.log('body ', req.body);
      srf.updateTemplate(
        req.body.templatesetid,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css,
        req.params.id
      );
      res.send('ok');
    }
  });

  app.get('/rest/templateset/:id', (req, res) => {
    const templateset = srf.getTemplateset(req.params.id);
    res.send(templateset);
  });

  app.use((req, res, next) => {
    console.log('404 ', req.path);
    res.status(404).send('Not found');
  });

  const server = app.listen(8000, () => {
    const host = server.address().address;
    const port = server.address().port;
    console.log('Listening on http://%s:%s', host, port);
  });

  function getEstimatedTotalStudyTime () {
    const studyTimeToday = srf.getStudyTimeToday();
    const dueTodayCount = srf.getCountCardsDueToday();
    const dueStudyTime = srf.getEstimatedStudyTime(dueTodayCount);
    const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
    return (estimatedTotalStudyTime);
  }
}

function importFile (opts) {
  console.log('import file ', opts);
  const file = opts._[1];
  console.log('file: ', file);
  const srf = require('../lib/srf')({
    dir: opts.dir,
    database: opts.database,
    media: opts.media,
    config: opts.config
  });
  process.on('SIGINT', () => {
    console.log('closing database connection');
    srf.close();
    process.exit();
  });

  if (!file) {
    console.error('Missing file to import');
    process.exit(1);
  }
  unzip(file)
  .then(data => {
    if (data['collection.anki21']) {
      srf.importAnki21(opts, data);
    } else if (data['collection.anki2']) {
      srf.importAnki2(data);
    } else {
      throw new Error(file + ' is not an Anki deck package');
    }
  })
  .catch(err => {
    console.log('failed with ', err);
  });
}

/**
 * unzip returns a promise that resolves to an object containing
 * the zip file contents, keyed by filename, with file data as buffers.
 */
function unzip (file) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl');
    yauzl.open(file, { lazyEntries: true }, (err, zipFile) => {
      if (err) throw err;

      const data = {};

      let handleCount = 0;
      function incrementHandleCount () {
        handleCount++;
      }
      function decrementHandleCount () {
        handleCount--;
        if (handleCount === 0) {
          console.log('all handles are closed');
          resolve(data);
        }
      }

      incrementHandleCount();
      zipFile.on('close', decrementHandleCount);

      zipFile.readEntry();

      zipFile.on('entry', entry => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
        } else {
          zipFile.openReadStream(entry, (err, readStream) => {
            if (err) throw err;
            const chunks = [];
            readStream.on('data', (chunk) => {
              chunks.push(Buffer.from(chunk));
            });
            readStream.on('error', err => {
              reject(err);
            });
            readStream.on('end', () => {
              data[entry.fileName] = Buffer.concat(chunks);
              zipFile.readEntry();
            });
          });
        }
      });
    });
  });
}

/**
 * getMustacheTags returns an array of all the tags in the given template.
 *
 */
/* c8 ignore start */
function getMustacheTags (template) {
  return [...new Set(
    require('mustache').parse(template)
    .filter(item => item[0] === 'name')
    .map(item => item[1])
  )];
}
/* c8 ignore stop */
