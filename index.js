#!/usr/local/bin/node
'use strict';
console.log('TEST');

const fs = require('fs');
const path = require('path');
const tc = require('timezonecomplete');
const { v4: uuidv4 } = require('uuid');

let db; // better-sqlite3 database handle

process.on('SIGINT', () => {
  console.log('closing database connection');
  db.close();
  process.exit();
});

let config;

// startTime is the time when this execution of the server started.
const startTime = Math.floor(Date.now() / 1000);
console.log(new Date().toString());

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay;

// endOfDay is the epoch time of midnight at the end of the current day.
let endOfDay;

// secPerDay is the number of seconds in a day
const secPerDay = 60 * 60 * 24;

// secPerYear is the number of seconds in a year
const secPerYear = secPerDay * 365;

// matureThreshold is the interval beyond which a card is considered mature
// Cards with interval less than this are being learned
const matureThreshold = 60 * 60 * 24 * 21;

let timezoneOffset = (new Date().getTimezoneOffset()) * 60;

// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = startTime;

// studyTimeToday is the total time studying cards since midnight.
// Reset when the day rolls over.
let studyTimeToday;

// The number of cards buried
let buried = '';

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
} else {
  const [command, subargv] = opts._;

  // Clean up the opts object
  delete opts.directory;
  delete opts.db;
  delete opts.m;
  delete opts.c;

  // Make paths absolute
  if (opts.dir.substr(0,1) !== '/') {
    opts.dir = path.join(process.env.HOME, '.local', 'share', opts.dir);
  }
  if (opts.config.substr(0,1) !== '/') {
    opts.config = path.join(opts.dir, opts.config);
  }
  if (opts.database.substr(0,1) !== '/') {
    opts.database = path.join(opts.dir, opts.database);
  }
  if (opts.media.substr(0,1) !== '/') {
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
  } else {
    runServer(opts, subargv);
  }
}


/**
 * getFieldset returns the field set and ...
 */
function getFieldset (fieldsetid) {
  const fieldset = db.prepare('select * from fieldset where id = ?')
  .get(fieldsetid);
  if (!fieldset) {
    console.log('No fieldset ID ', fieldsetid);
    return;
  }
  fieldset.fields = JSON.parse(fieldset.fields);
  fieldset.templateset = getTemplateset(fieldset.templatesetid);
  return (fieldset);
}

function getTemplateset (id) {
  const templateset = db.prepare('select * from templateset where id = ?')
  .get(id);
  if (!templateset) {
    console.log('No templateset with ID', id);
    return;
  }
  templateset.templates = getTemplatesInTemplateset(id);
  templateset.fieldsJSON = templateset.fields;
  templateset.fields = JSON.parse(templateset.fields);
  return(templateset);
}

function updateTemplateset (templateset) {
  templateset.fields = getTemplatesetFields(templateset);
  db.prepare('update templateset set name = ?, fields = ?')
  .run(
    templateset.name,
    JSON.stringify(templateset.fields)
  );
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

function getTemplatesets () {
  const templatesets = db.prepare('select * from templateset').all();
  templatesets.forEach(templateset => {
    templateset.templates = getTemplatesInTemplateset(templateset.id);
    templateset.fieldsJSON = templateset.fields;
    templateset.fields = JSON.parse(templateset.fields);
  });
  return (templatesets);
}

/**
 * getTemplate gets a template record by id
 *
 * TODO: fix the template table to keep css, front and back in separate
 * fields. There is no value in the JSON here.
 */
function getTemplate (templateid) {
  const template = db.prepare('select * from template where id = ?')
  .get(templateid);
  if (!template) throw new Error('No template with ID ' + templateid);
  return (template);
}

function getTemplatesInTemplateset (templatesetid) {
  const templates = db.prepare('select * from template where templatesetid = ? order by id')
  .all(templatesetid);
  return (templates);
}

function updateSeenCard (card, ease, interval) {
  const factor = newFactor(card, interval);
  let due = now + interval;
  if ((due - now) > config.dueTimeRoundingThreshold) {
    due = new Date(due * 1000).setHours(0, 0, 0, 0).valueOf() / 1000;
  }
  const lapsed = interval < matureThreshold && card.interval > matureThreshold;
  const lapses = lapsed ? card.lapses + 1 : card.lapses;
  db.prepare('update card set modified = ?, factor = ?, interval = ?, due = ?, views = ?, lapses = ? where id = ?')
  .run(now, factor, interval, due, card.views + 1, lapses, card.id);
  buryRelated(card);
  logReview(card, ease, factor, due, lapsed, lapses);
}

function logReview (card, ease, factor, due, lapsed, lapses) {
  const elapsed = Math.min(120, Math.floor(now - cardStartTime));
  studyTimeToday += elapsed;
  const cardsViewedToday = getCountCardsViewedToday();
  const dueTodayCount = getCountCardsDueToday();
  const time = new Date().toTimeString().substring(0, 5);
  const percentCorrect = getPercentCorrect(10000);
  console.log(
    time,
    cardsViewedToday, // cards viewed today
    Math.floor(studyTimeToday / 60) + ' min', // study time today (min)
    dueTodayCount, // cards due today
    Math.floor(getEstimatedTotalStudyTime() / 60) + ' min',
    formatDue(card.due - card.interval), // when card was last seen
    formatDue(card.due), // when the card was due
    formatDue(due), // the new due date
    factor, // updated interval factor
    percentCorrect.toFixed(0) + '%',
    buried
  );
  const interval = due - now;
  const lastInterval = card.interval === 0 ? 0 : now - card.due + card.interval;
  const info = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)')
  .run(
    now * 1000,
    card.id,
    ease,
    interval,
    lastInterval,
    factor,
    elapsed,
    lapses
  );
  if (info.changes !== 1) {
    console.log('revlog update failed ', info);
    process.exit(1);
  }
}

function formatDue (due) {
  const interval = due - now;
  if (interval < -3600 * 24) {
    const d = new Date(due * 1000);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return ([year, month, day].join('-'));
  } else if (interval < -3600) {
    return ('-' + (-interval / 3600).toFixed(2) + ' hr');
  } else if (interval < -60) {
    return ('-' + Math.floor(-interval / 60) + ' min');
  } else if (interval < 0) {
    return ('-' + Math.floor(-interval) + ' sec');
  } else if (interval < 60) {
    return (Math.floor(interval) + ' sec');
  } else if (interval < 3600) {
    return (Math.floor(interval / 60) + ' min');
  } else if (interval < 3600 * 24) {
    return ((interval / 3600).toFixed(2) + ' hr');
  } else {
    const d = new Date(due * 1000);
    const year = d.getFullYear();
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let hours = d.getHours();
    let minutes = d.getMinutes();

    month = ('0' + month).slice(-2);
    day = ('0' + day).slice(-2);
    hours = ('0' + hours).slice(-2);
    minutes = ('0' + minutes).slice(-2);
    // return([year, month, day].join('-'));
    return ([year, month, day].join('-') + 'T' + [hours, minutes].join(':'));
  }
}

/**
 * getNextCard returns the next due card or a new card or undefined.
 *
 * A new card is returned if:
 *   - There were no overdue cards at start of day
 *   - Study time past 24 hours is less than studyTimeLimit
 *   - Estimated study time next 24 hours is less than studyTimeLimit
 *   - Estimated 5 day average study time is less than studyTimeLimit
 *   - Either no card is due or it has been 5 minutes since the last new card
 *   - There is a new card available
 *
 * Otherwise a due card is returned, or undefined if there is no due card.
 */
function getNextCard () {
  const nextDueCard = getDueCard();
  const nextNewCard = getNewCard();
  if (
    getCountCardsOverdue() === 0 &&
    // getAverageStudyTime(config.studyTimeWindowDays) <
    //   config.studyTimeAverageLimit &&
    // getMaxStudyTime(config.studyTimeWindowDays) <
    //   config.studyTimeWindowDaysLimit &&
    // getEstimatedTotalStudyTime() < config.studyTimeLimit &&
    getAverageStudyTime(1) < config.studyTimeLimit &&
    getEstimatedAverageStudyTime(1) < config.studyTimeLimit &&
    getEstimatedAverageStudyTime(5) < config.studyTimeLimit &&
    (lastNewCardTime < now - 300 || !nextDueCard) &&
    nextNewCard
  ) {
    lastNewCardTime = now;
    return (nextNewCard);
  } else {
    return (nextDueCard);
  };
}

function getNewCard () {
  const card = db.prepare('select * from card where due < ? and interval = 0 order by ord limit 1').get(now);
  return (card);
}

function getDueCard () {
  const card = db.prepare('select * from card where interval != 0 and due < ? order by interval, due, templateid limit 1').get(now);
  return (card);
}

function getEstimatedTotalStudyTime () {
  const dueTodayCount = getCountCardsDueToday();
  const dueStudyTime = getEstimatedStudyTime(dueTodayCount);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  return (estimatedTotalStudyTime);
}

function getEstimatedStudyTimeNext24Hours () {
  const cards =
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now + secPerDay)['count()'];
  const estimatedStudyTime = cards * getAverageTimePerCard();
  console.log('estimatedStudyTimeNext24Hours: ', estimatedStudyTime);
  return (estimatedStudyTime);
}

function getEstimatedAverageStudyTime (days) {
  const cards =
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now + days * secPerDay)['count()'];
  const averageTimePerCard = getAverageTimePerCard();
  const estimatedStudyTime = Math.floor(cards * averageTimePerCard / days);
  console.log('estimatedAverageStudyTime: ',
    days,
    Math.floor(cards/days),
    averageTimePerCard,
    estimatedStudyTime
  );
  return (estimatedStudyTime);
}

/**
 * For each fieldset there may be several cards. To avoid seeing these related
 * cards too close to each other, when a card is seen, defer the due date
 * of any other card in the set that is due in the next 5 days to 5 days
 * from now.
 */
function buryRelated (card) {
  const info = db.prepare('update card set modified = ?, due = ? where fieldsetid = ? and id != ? and due < ?')
  .run(
    now, // modification time
    now + secPerDay * 5, // new due
    card.fieldsetid,
    card.id,
    now + secPerDay * 5 // old due
  );
  buried = info.changes > 0 ? '(' + info.changes + ')' : '';
}

function intervalAgain (card) {
  return (Math.floor(Math.max(config.againInterval, card.interval * 0.02)));
}

function intervalHard (card) {
  if (!card.interval || card.interval === 0) { return (config.hardMinInterval); }
  const timeSinceLastSeen = now - card.due + card.interval;
  return (
    Math.max(
      config.hardMinInterval,
      Math.floor(timeSinceLastSeen * config.hardIntervalFactor)
    )
  );
}

function intervalGood (card) {
  if (!card.interval || card.interval === 0) { return (config.goodMinInterval); }
  const timeSinceLastSeen = now - card.due + card.interval;
  const percentCorrect = getPercentCorrect(10000);
  const correctFactor = Math.max(0, percentCorrect - 80) / 10;
  const factor = 1.5 +
    card.factor * correctFactor * Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7);
  console.log('factor: ', factor.toFixed(2), card.factor.toFixed(2), correctFactor.toFixed(2), Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7).toFixed(2));
  return (
    Math.min(
      secPerYear,
      Math.max(
        config.goodMinInterval,
        Math.floor(timeSinceLastSeen * factor)
      )
    )
  );
}

function intervalEasy (card) {
  if (!card.interval || card.interval === 0) { return (config.easyMinInterval); }
  const timeSinceLastSeen = now - card.due + card.interval;
  const factor = 3.0 + card.factor * Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7);
  return (
    Math.min(
      secPerYear,
      Math.max(
        config.easyMinInterval,
        Math.floor(timeSinceLastSeen * factor)
      )
    )
  );
}

/**
 * getAverageTimePerCard returns the average time spent per card over the
 * past 10 days. Note that this is not the average time per view, as some
 * cards are viewed more than once.
 */
function getAverageTimePerCard () {
  const result = db.prepare('select avg(t) from (select sum(time) as t, cast(id/1000/60/60/24 as integer) as d, cardid from revlog where id > ? and id < ? group by d, cardid)')
  .get((startOfDay - 60 * 60 * 24 * 10) * 1000, startOfDay * 1000)['avg(t)'] || 30;
  // const average = Math.round(result, 2);
  const average = result.toFixed(2);
  return (average);
}

function getCountCardsDueToday () {
  return (db.prepare('select count() from card where interval != 0 and due < ?').get(endOfDay)['count()'] || 0);
}

/**
 * getCountCardsOverdue returns the number of cards that were due more than
 * one day ago.
 */
function getCountCardsOverdue () {
  return (
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now - secPerDay)['count()'] || 0
  );
}

function getCountCardsDueNow () {
  return (db.prepare('select count() from card where interval != 0 and due < ?').get(now)['count()'] || 0);
}

function getCountCardsViewedToday () {
  return (db.prepare('select count() from revlog where id >= ?').get(startOfDay * 1000)['count()']);
}

function getCountCardsViewedPast24Hours () {
  return (db.prepare('select count() from revlog where id >= ?').get((now - secPerDay) * 1000)['count()']);
}

function getStatsPast24Hours () {
  const stats = db.prepare(
    'select count() as count, sum(time) as time from revlog where id >= ?'
  )
  .get((now - secPerDay) * 1000);
  return (stats || {count: 0, time: 0});
}

function getStatsNext24Hours () {
  const count = db.prepare('select count() from card where interval != 0 and due < ?').get(now + secPerDay)['count()'] || 0;
  return ({
    count: count,
    time: count * getAverageTimePerCard()
  });
}

function getEstimatedStudyTime (count) {
  return Math.floor(count * getAverageTimePerCard());
}

function getConfig (opts) {
  const defaults = {
    // The maximum value factor may take.
    maxFactor: 10000,
    // The interval beyond which due times are rounded to the start of the
    // day, in seconds.
    dueTimeRoundingThreshold: 60 * 60 * 24 * 5,
    // The factor for randomizing intervals when good or easy are selected.
    intervalRandomFactor: 5,

    // again
    // The interval when again is selected, in seconds.
    againInterval: 10,
    // The minimum factor when again is selected.
    againMinFactor: 1500,
    // The sensitivity of factor to previous interval when again is selected.
    // The time constant of exponential decay towards maxFactor, in seconds.
    againIntervalSensitivity: 60 * 60 * 24 * 21,

    // hard
    // The minimum interval when hard is selected, in seconds.
    hardMinInterval: 30,
    // The factor for adjusting interval when hard is selected.
    hardIntervalFactor: 0.5,
    // The minimum factor when hard is selected.
    hardMinFactor: 1500,
    // The change of factor when hard is selected.
    hardFactorAdjust: -50,

    // good
    // The minimum interval when good is selected, in seconds.
    goodMinInterval: 60,
    // The minimum factor when good is selected.
    goodMinFactor: 1100,
    // The change of factor when good is selected.
    goodFactorAdjust: 50,

    // easy
    // The minimum interval when easy is selected, in seconds.
    easyMinInterval: 60 * 60 * 24 * 7,
    // The minimum factor when easy is selected.
    easyMinFactor: 4000,
    // The change of factor when easy is selected.
    easyFactorAdjust: 200,

    // Study time (seconds) per day beyond which no new cards
    studyTimeLimit:  60 * 60,

    // Study time (seconds) beyond which new cards will not be shown
    studyTimeAverageLimit: 60 * 60,

    // Study time (seconds) beyond which new cards will not be shown
    studyTimeWindowDaysLimit: 90 * 60,

    // The window (days) over which daily study time must be below
    // studyTimeWindowDaysLimit for new cards to be shown.
    studyTimeWindowDays: 5
  };
  try {
    const data = fs.readFileSync(opts.config, 'utf8');
    console.log('load config: ', data);
    const JSON5 = require('json5');
    const config = JSON5.parse(data);
    return ({
      ...defaults,
      ...config
    });
  } catch (e) {
    return (defaults);
  }
}

/**
 * createCards creates a set of cards for the fieldset with the given id
 * and templateset.
 */
function createCards (fieldsetid, templatesetid) {
  console.log('createCards ', fieldsetid, templatesetid);
  const templates = getTemplatesInTemplateset(templatesetid);

  templates.forEach(template => {
    console.log('create card for template: ', template);
    createCard(fieldsetid, template.id);
  });
}

/**
 * createCardsForTemplate creates all cards for the given template.
 */
function createCardsForTemplate (templateid) {
  console.log('createCardsForTemplate ', templateid);
  const template = getTemplate(templateid);
  const fieldsets = db.prepare('select id from fieldset where templatesetid = ?').all(template.templatesetid);
  fieldsets.forEach(fieldset => {
    try {
      const id = createCard(fieldset.id, template.id);
      console.log('created card id ', id);
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      }
    }
  });
}

/**
 * deleteCardsForTemplate deletes all card records linked to the given
 * templateid. This will be required if the template is deleted or if its
 * templateset is changed.
 */
function deleteCardsForTemplate (templateid) {
  console.log('deleteCardsForTemplate ', templateid);
  db.prepare('delete from card where templateid = ?').run(templateid);
}

function createCard (fieldsetid, templateid) {
  const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, due, factor, views, lapses, ord) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(
    fieldsetid,
    templateid,
    Math.floor(Date.now() / 1000),
    0,
    0,
    0,
    0,
    0,
    0
  );
  console.log('insert info: ', info);
  return(info.lastInsertRowid);
}

function newFactor (card, interval) {
  return (
    (card.factor || 0) * 0.6 +
      Math.log(1 + interval / 900) * 0.4
  ).toFixed(2);
}

function getPercentCorrect (n) {
  let result;
  if (n) {
    result = db.prepare('select avg(case ease when 1 then 0 else 1 end) as average from (select ease from revlog order by id desc limit ?)').get(n);
  } else {
    result = db.prepare('select avg(case ease when 1 then 0 else 1 end) as average from revlog').get();
  }
  return (result ? result.average * 100 : 0);
}

function runServer (opts, args) {
  console.log('run server ', opts, args);

  const mediaDir = opts.media;
  db = getDatabaseHandle(opts);
  prepareDatabase();

  const express = require('express');
  const app = express();
  const favicon = require('serve-favicon');
  app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
  const expressHandlebars = require('express-handlebars');
  const hbsFormHelper = require('handlebars-form-helper');
  const hbs = expressHandlebars.create({});
  hbsFormHelper.registerHelpers(hbs.handlebars, { namespace: 'form' });
  app.engine('handlebars', expressHandlebars());
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'handlebars');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.static(mediaDir));
  app.use(express.json({ limit: '50MB' }));
  config = getConfig(opts);

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
      endOfDay = startOfDay + secPerDay;
      studyTimeToday = getStudyTimeToday();
      timezoneOffset = (new Date().getTimezoneOffset()) * 60;
    }
    next();
  });

  app.get('/', (req, res) => {
    const viewedToday = getCountCardsViewedToday();
    const dueToday = getCountCardsDueToday();
    const dueStudyTime = getEstimatedStudyTime(dueToday);
    const nextDue = db.prepare('select due from card where interval != 0 order by due limit 1').get();

    const dueNow = getCountCardsDueNow();
    const nextCard = getNextCard();
    const studyNow = !!nextCard;
    const statsPast24Hours = getStatsPast24Hours();
    statsPast24Hours.time = Math.floor(statsPast24Hours.time/60);
    const statsNext24Hours = getStatsNext24Hours();
    statsNext24Hours.time = Math.floor(statsNext24Hours.time/60);
    const timeToNextDue = tc.seconds((nextDue ? nextDue.due : now) - now);
    const percentCorrect = getPercentCorrect(10000);
    const overdue = getCountCardsOverdue();
    const chart1Data = { x: [], y: [], type: 'bar' };
    db.prepare('select cast((due-@start)/(60*60) as integer) as hour, count() from card where due > @start and due < @end and interval != 0 group by hour')
    .all({start: now, end: now + secPerDay})
    .forEach(el => {
      chart1Data.x.push(el.hour);
      chart1Data.y.push(el['count()']);
    });
    chart1Data.y[0] += dueNow;
    res.render('home', {
      viewedToday: viewedToday,
      studyTimeToday: Math.floor(studyTimeToday / 60),
      dueToday: dueToday,
      dueStudyTime: Math.floor(dueStudyTime / 60),
      totalToday: viewedToday + dueToday,
      totalStudyTime: Math.floor((studyTimeToday + dueStudyTime) / 60),
      dueNow: dueNow,
      timeToNextDue: timeToNextDue.toFullString().slice(0,-4),
      chart1Data: JSON.stringify(chart1Data),
      studyNow: studyNow,
      studyTimePast24Hours: Math.floor(statsPast24Hours.time / 60),
      viewedPast24Hours: statsPast24Hours.count,
      statsPast24Hours: statsPast24Hours,
      statsNext24Hours: statsNext24Hours,
      percentCorrect: percentCorrect.toFixed(0),
      overdue: overdue
    });
  });

  app.get('/help', (req, res) => {
    res.render('help');
  });

  app.get('/stats', (req, res) => {
    // revlog.id is ms timestamp
    const cardsViewedToday = getCountCardsViewedToday();
    const dueCount = getCountCardsDueToday();

    const nextDue = db.prepare('select due from card where interval != 0 order by due limit 1').get().due;

    const timeToNextDue = tc.seconds(nextDue - now);

    const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);

    // Cards studied per day
    let first;
    let points = [];
    console.log('timezoneOffset: ', timezoneOffset);
    db.prepare('select cast((id - ?)/(1000*60*60*24) as integer) as day, count() from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
      if (!first) first = el.day;
      points[el.day - first] = el['count()'];
    });
    const chart1Data = { x: [], y: [] };
    for (let i = 0; i <= dayNumber - first; i++) {
      chart1Data.x.push(i);
      chart1Data.y.push(points[i] || 0);
    }

    // Minutes studied per day
    points = [];
    first = null;
    db.prepare('select cast((id - ?)/(1000*60*60*24) as integer) as day, sum(time) as time from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
      if (!first) first = el.day;
      points[el.day - first] = el.time / 60;
    });
    const chart2Data = { x: [], y: [] };
    for (let i = 0; i <= dayNumber - first; i++) {
      chart2Data.x.push(i);
      chart2Data.y.push(points[i] || 0);
    }

    // Cards due per day
    points = [];
    let last;
    first = null;
    db.prepare('select cast((due - ?)/(60*60*24) as integer) as day, count() from card where interval != 0 and due >= ? group by day')
    .all(timezoneOffset, startOfDay).forEach(el => {
      if (!first) first = el.day;
      last = el.day - first;
      points[last] = el['count()'];
    });
    const chart3Data = { x: [], y: [] };
    for (let i = 0; i <= last; i++) {
      chart3Data.x.push(i);
      chart3Data.y.push(points[i] || 0);
    }
    chart3Data.y[0] += db.prepare('select count() from card where interval != 0 and due < ?').get(startOfDay)['count()'] || 0;

    // Cards per interval
    points = [];
    db.prepare('select interval/60/60/24 as days, count() from card where interval != 0 group by days').all().forEach(el => {
      last = el.days;
      points[el.days] = el['count()'];
    });
    const chart4Data = { x: [], y: [] };
    for (let i = 0; i < last; i++) {
      chart4Data.x.push(i);
      chart4Data.y.push(points[i] || 0);
    }
    const cardsSeen = db.prepare('select count() from card where interval != 0').get()['count()'] || 0;
    const matureCards = db.prepare('select count() from card where interval > 364*24*60*60').get()['count()'] || 0;

    // New cards per day
    points = [];
    first = null;
    console.log('timezoneOffset: ', timezoneOffset);
    db.prepare('select cast(((id - ?)/1000/60/60/24) as int) as day, count() from (select * from revlog group by cardid) group by day').all(timezoneOffset * 1000).forEach(el => {
      if (!first) first = el.day;
      points[el.day - first] = el['count()'];
    });
    const chart5Data = { x: [], y: [] };
    for (let i = 0; i <= dayNumber - first; i++) {
      chart5Data.x.push(i);
      chart5Data.y.push(points[i] || 0);
    }
    const newCardsPerDay = dayNumber >= first ? cardsSeen / (dayNumber - first + 1) : 0;

    // Matured & Lapsed per day
    points = [];
    first = null;
    db.prepare('select cast((id - ?)/(24*60*60*1000) as int) as day, count(case when interval >= 60*60*24*364 and lastinterval < 60*60*24*364 then 1 else null end) as matured, count(case when interval < 60*60*24*364 and lastinterval > 60*60*24*364 then 1 else null end) as lapsed from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
      if (!first) first = el.day;
      points[el.day - first] = {
        matured: el.matured,
        lapsed: el.lapsed
      };
    });
    const chart6Trace1 = {
      x: [],
      y: [],
      mode: 'lines',
      name: 'Matured'
    };
    const chart6Trace2 = {
      x: [],
      y: [],
      mode: 'lines',
      name: 'Lapsed'
    };
    const chart6Trace3 = {
      x: [],
      y: [],
      mode: 'lines',
      name: 'Net'
    };
    const chart6Trace4 = {
      x: [],
      y: [],
      mode: 'lines',
      name: 'Cumulative',
      yaxis: 'y2'
    };
    let total = 0;
    for (let i = 0; i <= dayNumber - first; i++) {
      chart6Trace1.x.push(i);
      chart6Trace1.y.push(points[i] ? points[i].matured : 0);
      chart6Trace2.x.push(i);
      chart6Trace2.y.push(points[i] ? points[i].lapsed : 0);
      chart6Trace3.x.push(i);
      chart6Trace3.y.push(points[i] ? points[i].matured - points[i].lapsed : 0);
      total += points[i] ? points[i].matured - points[i].lapsed : 0;
      chart6Trace4.x.push(i);
      chart6Trace4.y.push(total);
    }
    const chart6Data = [chart6Trace1, chart6Trace2, chart6Trace3, chart6Trace4];

    res.render('stats', {
      dueCount: dueCount,
      timeToNextDue: timeToNextDue.toFullString(),
      cardsViewedToday: cardsViewedToday,
      studyTimeToday: tc.seconds(studyTimeToday).toFullString(),
      estimatedTotalStudyTime: tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
      averageTimePerCard: getAverageTimePerCard(),
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
    card = getNextCard();
    if (card) {
      if (card.interval === 0) console.log('new card');
      cardStartTime = now;
      const fields = getFields(card.fieldsetid);
      const template = getTemplate(card.templateid);
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
      const interval = intervalAgain(card);
      updateSeenCard(card, 1, interval);
    }
    res.redirect('/front');
  });

  app.get('/hard', (req, res) => {
    if (card) {
      const interval = intervalHard(card);
      updateSeenCard(card, 2, interval);
    }
    res.redirect('/front');
  });

  app.get('/good', (req, res) => {
    if (card) {
      const interval = intervalGood(card);
      updateSeenCard(card, 3, interval);
    }
    res.redirect('/front');
  });

  app.get('/easy', (req, res) => {
    if (card) {
      const interval = intervalEasy(card);
      updateSeenCard(card, 4, interval);
    }
    res.redirect('/front');
  });

  app.get('/fieldsets', (req, res) => {
    const fieldsets = db.prepare('select * from fieldset').all();
    res.render('fieldsets', {
      fieldsets: fieldsets
    });
  });

  app.get('/fieldset/:id', (req, res) => {
    const fieldset = getFieldset(req.params.id);
    console.log('fieldset: ', fieldset);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    getTemplatesets().forEach(set => {
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
    fieldset.templatesetid = getTemplatesets()[0].id;
    fieldset.templateset = getTemplateset(fieldset.templatesetid);
    fieldset.templateset.fields.forEach(field => {
      fieldset.fields[field] = '';
    });
    console.log('fieldset: ', fieldset);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    getTemplatesets().forEach(set => {
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
      const info = db.prepare('insert into fieldset (guid, templatesetid, fields) values (?, ?, ?)')
      .run(
        uuidv4(),
        templatesetid,
        fields
      );
      console.log('insert info: ', info);
      const fieldsetid = info.lastInsertRowid;
      createCards(fieldsetid, templatesetid);
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
    } else {
      console.log('update an existing fieldset');
      console.log('body ', req.body);
      const fieldsetid = req.params.id;
      const templatesetid = req.body.templatesetid;
      console.log('templatesetid: ', templatesetid);
      const fields = JSON.stringify(req.body.fields);
      console.log('fields: ', fields);
      const oldFieldset = getFieldset(fieldsetid);
      db.prepare('update fieldset set templatesetid = ?, fields = ? where id = ?')
      .run(templatesetid, fields, fieldsetid);
      // If the templateset has changed, we need a new set of cards
      if (oldFieldset.templatesetid !== templatesetid) {
        db.prepare('delete card where fieldsetid = ?').run(fieldsetid);
        // TODO: what about revlog? Should the old entries be deleted?
        // The cards they link to will no longer exists.
        // On the other hand, the reviews they record did happen.
        createCards(fieldsetid, templatesetid);
      }
      res.send('ok');
    }
  });

  app.get('/templatesets', (req, res) => {
    const templatesets = db.prepare('select * from templateset').all();
    res.render('templatesets', {
      templatesets: templatesets
    });
  });

  app.get('/templateset/:id', (req, res) => {
    const templateset = getTemplateset(req.params.id);
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
      const info = db.prepare('insert into templateset (name, fields) values (?, ?)')
      .run(
        name,
        fields
      );
      id = info.lastInsertRowid;
    } else {
      db.prepare('update templateset set name = ?, fields = ? where id = ?')
      .run(
        name,
        fields,
        id
      );
    }
    db.prepare('begin transaction').run();
    const templates = getTemplatesInTemplateset(id);
    const fieldsets = db.prepare('select id from fieldset where templatesetid = ?')
    .all(id);

    fieldsets.forEach(fieldset => {
      templates.forEach(template => {
        try {
          const id = createCard(fieldset.id, template.id);
          console.log('created card id ', id);
        } catch (e) {
          if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
            throw e;
          }
        }
      });
    });
    db.prepare('delete from card where fieldsetid in (select id from fieldset where templatesetid = @id) and templateid not in (select id from template where templatesetid = @id)').run({id:  id});
    db.prepare('commit').run();
    res.send('ok');
  });

  app.get('/templates', (req, res) => {
    const templates = db.prepare('select * from template').all();
    res.render('templates', {
      templates: templates
    });
  });

  app.get('/template/:id', (req, res) => {
    const template = getTemplate(req.params.id);
    console.log('template: ', template);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    getTemplatesets().forEach(set => {
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
      templatesetid: getTemplatesets()[0].id,
      name: '',
      front: '',
      back: '',
      css: ''
    };
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    getTemplatesets().forEach(set => {
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
      db.prepare('begin transaction').run();
      const info = db.prepare('insert into template (templatesetid, name, front, back, css) values (?, ?, ?, ?, ?)')
      .run(
        req.body.templatesetid,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css
      );
      console.log('insert info: ', info);
      createCardsForTemplate(info.lastInsertRowid);
      db.prepare('commit').run();
      res.send('ok');
    } else {
      console.log('update an existing template');
      console.log('body ', req.body);
      const oldTemplate = getTemplate(req.params.id);
      db.prepare('begin transaction').run();
      db.prepare('update template set templatesetid = ?, name = ?, front = ?, back = ?, css = ? where id = ?')
      .run(
        req.body.templatesetid,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css,
        req.params.id
      );
      if (oldTemplate.templatesetid !== req.body.templatesetid) {
        deleteCardsForTemplate(req.params.id); // old fieldsets
        createCardsForTemplate(req.params.id); // new fieldsets
      }
      db.prepare('commit').run();
      res.send('ok');
    }
  });

  app.get('/rest/templateset/:id', (req, res) => {
    const templateset = getTemplateset(req.params.id);
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
}

function importFile (opts) {
  console.log('import file ', opts);
  const file = opts._[1];
  console.log('file: ', file);
  unzip(file)
  .then(data => {
    db = getDatabaseHandle(opts);
    prepareDatabase();
    if (data['collection.anki21']) {
      importAnki21(opts, data);
    } else if (data['collection.anki2']) {
      importAnki2(data);
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

function getStudyTimeToday () {
  return (
    db.prepare('select sum(time) from revlog where id >= ?')
    .get(startOfDay * 1000)['sum(time)'] || 0
  );
}

/**
 * getAverageStudyTime returns the average total study time per day
 * over the given number of days.
 */
function getAverageStudyTime (days) {
  const average = 
    Math.floor(db.prepare('select sum(time) from revlog where id >= ?')
    .get((now - days * secPerDay) * 1000)['sum(time)'] / days) || 0;
  console.log('average study time: ', days, average);
  return (average);
}

/**
 * getMaxStudyTime returns the maximum study time, in seconds, in a 24 hour
 * sliding window over the given number of days.
 */
function getMaxStudyTime (days) {
  let maxStudyTime = 0;
  const times = db.prepare('select cast((id - @start)/(1000*60*60*24) as integer) as day,' +
    ' sum(time) as time ' +
    ' from revlog where id > @start group by day')
  .all({start: 1 + (now - secPerDay * days) * 1000});
  console.log('times: ', times);
  times
  .forEach(el => {
    if (el.time > maxStudyTime) maxStudyTime = el.time;
  });
  console.log('maxStudyTime: ', maxStudyTime);
  return (maxStudyTime);
}

/**
 * prepareDatabase initializes or updates the database as required
 */
function prepareDatabase () {
  try {
    const result = db.prepare('select value from config where name = ?').get('srf schema version');
    if (result) {
      console.log('version: ', result.version);
    } else {
      throw new Error('missing srf schema version');
    }
  } catch (e) {
    if (e.message === 'no such table: config') {
      console.log('OK - setup database');
      initializeDatabase();
    } else {
      throw e;
    }
  }
}

/**
 * Initialize database does initial setup of a new database.
 */
function initializeDatabase () {
  const batch = fs.readFileSync('init-schema-v1.sql', 'utf8');
  db.exec(batch);
}

function getDatabaseHandle (opts) {
  return require('better-sqlite3')(opts.database);
}

/**
 * importAnki21 imports an Anki 2.1 deck package
 *
 * A deck package contains one or more decks. Each deck contains a set of
 * notes and a set of cards. Each note has a note type, with a related set
 * of templates. The cards are produced from the notes according to the
 * templates.
 *
 * In the anki21 database, the configuration of notetypes, templates and
 * fields is stored as a JSON encoded set of 'models' in field models.
 *
 * Each model must be mapped to a template set in srf. There are no guids
 * for the models and each Anki database may use different ID for the same
 * model, so mapping on repeat import is challenging. But the essential
 * details are the templates themselves and, in particular, the fronts and
 * backs. If the set of fronts and backs are the same, the set of templates
 * will be considered to be the same.
 */
function importAnki21 (opts, data) {
  const srcdb = require('better-sqlite3')(data['collection.anki21']);
  const srccol = srcdb.prepare('select * from col').get();
  const models = JSON.parse(srccol.models);
  const srfTemplateSetKeys = getTemplatesetKeys();
  db.prepare('begin transaction').run();
  console.log('import models');
  const anki21ModelIdToSrfTemplateSetId = {};
  Object.keys(models).forEach(modelId => {
    const model = models[modelId];
    const templateSetId = getTemplateSetIdFromAnkiModel(srfTemplateSetKeys, model);
    anki21ModelIdToSrfTemplateSetId[modelId] = templateSetId;
  });
  const fieldsetGuidToId = {};
  db.prepare('select id, guid from fieldset').all()
  .forEach(record => {
    fieldsetGuidToId[record.guid] = record.id;
  });
  // Import anki21 notes
  console.log('import notes');
  const anki21NoteIdToSrfFieldsetId = {};
  const insertFieldset = db.prepare('insert into fieldset (guid, templatesetid, fields) values (?,?,?)');
  srcdb.prepare('select * from notes').all()
  .forEach(record => {
    const model = models[record.mid];
    const fieldLabels = model.flds.map(field => field.name);
    const fieldValues = record.flds.split(String.fromCharCode(0x1f));
    const fields = {};
    fieldLabels.forEach((label, i) => {
      fields[label] = fieldValues[i];
    });
    if (fieldsetGuidToId[record.guid]) {
      db.prepare('update fieldset set templatesetid = ?, fields = ? where id = ?')
      .run(anki21ModelIdToSrfTemplateSetId[record.mid], JSON.stringify(fields), fieldsetGuidToId[record.guid]);
      anki21NoteIdToSrfFieldsetId[record.id] = fieldsetGuidToId[record.guid];
    } else {
      const info = insertFieldset
      .run(record.guid, anki21ModelIdToSrfTemplateSetId[record.mid], JSON.stringify(fields));
      anki21NoteIdToSrfFieldsetId[record.id] = info.lastInsertRowid;
    }
  });
  // Import anki21 cards
  console.log('import cards');
  const anki21CardIdToSrfCardId = {};
  srcdb.prepare('select * from cards').all()
  .forEach(record => {
    const fieldsetId = anki21NoteIdToSrfFieldsetId[record.nid];
    const fieldset = getFieldset(fieldsetId);
    if (!fieldset) {
      console.log('no fieldset for ', record, ', fieldsetId: ', fieldsetId);
      process.exit(0);
    }
    const templatesetId = fieldset.templatesetid;
    const templates = getTemplatesInTemplateset(templatesetId);
    const templateId = templates[record.ord].id;
    // Insert new record
    let interval = 0;
    let due = 0;
    let factor = 0;
    let views = record.reps;
    let lapses = record.lapses;
    let ord = 0;
    if (record.type === 0) {
      // New card
      ord = record.due;
      views = 0;
      lapses = 0;
    } else if (record.type === 1) {
      // Learn card
      due = record.due;
      interval = 60;
    } else if (record.type === 2) {
      // review card
      due = srccol.crt + record.due * 60 * 60 * 24;
      interval = record.ivl * 60 * 60 * 24;
      factor = Math.log(1 + interval / 900) * 0.4;
    } else if (record.type === 3) {
      // relearn card
      due = record.due;
      interval = 60;
    } else {
      console.log('unknown card type for ', record);
      throw new Error('unknown card type ' + record.type);
    }
    try {
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, due, factor, views, lapses, ord) values (?,?,?,?,?,?,?,?,?)')
      .run(fieldsetId, templateId, Math.floor(Date.now() / 1000), interval, due, factor, views, lapses, ord);
      anki21CardIdToSrfCardId[record.id] = info.lastInsertRowid;
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      }
    }
  });
  // Import anki21 revlog
  console.log('import revlog');
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)');
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki21CardIdToSrfCardId[record.cid];
    const ease = record.ease;
    const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
    const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
    const factor = Math.log(1 + interval / 900) * 0.4;
    const time = Math.floor(record.time / 1000);
    insertRevlog
    .run(record.id, cardId, ease, interval, lastinterval, factor, time, 0);
  });
  db.prepare('commit').run();
  // save media
  console.log('save media');
  const media = JSON.parse(data.media);
  Object.keys(media).forEach(key => {
    fs.writeFileSync(path.join(opts.media, media[key]), data[key]);
  });
}

/**
 * getTemplatesetKeys returns an object that maps template set keys to srf
 * template set IDs, for each template set in srf. The key is the
 * concatenation of the name, front and back of each template in the set,
 * sorted in ascending order by ord.
 */
function getTemplatesetKeys () {
  const result = {};
  const templatesets = getTemplatesets();
  templatesets.forEach(templateset => {
    let key = '';
    templateset.templates
    .forEach(template => {
      key += template.name + template.front + template.back;
    });
    result[key] = record.id;
  });
  return (result);
}

function getTemplateSetIdFromAnkiModel (keyMap, model) {
  let key = '';
  model.tmpls.forEach(template => {
    key += template.name + template.qfmt + template.afmt;
  });
  if (keyMap[key]) return (keyMap[key]);
  // Create the templateset
  const fields = model.flds.map(field => field.name);
  const info = db.prepare('insert into templateset (name, fields) values (?,?)')
  .run(model.name, JSON.stringify(fields));
  const srfTemplateSetId = info.lastInsertRowid;
  // create each template
  model.tmpls.forEach(ankiTemplate => {
    const info = db.prepare('insert into template (templatesetid, name, front, back, css) values (?, ?, ?, ?, ?)')
    .run(
      srfTemplateSetId,
      ankiTemplate.name,
      ankiTemplate.qfmt,
      ankiTemplate.afmt,
      model.css
    );
  });
  keyMap[key] = srfTemplateSetId;
  return (srfTemplateSetId);
}

/**
 * importAnki2 imports an Anki 2.0 deck package
 */
function importAnki2 (data) {
  const srcdb = require('better-sqlite3')(data['collection.anki2']);
  const srccol = srcdb.prepare('select * from col').get();
  const models = JSON.parse(srccol.models);
  const srfTemplateSetKeys = getTemplatesetKeys();
  db.prepare('begin transaction').run();
  console.log('import models');
  const anki2ModelIdToSrfTemplateSetId = {};
  Object.keys(models).forEach(modelId => {
    const model = models[modelId];
    const templateSetId = getTemplateSetIdFromAnkiModel(srfTemplateSetKeys, model);
    anki2ModelIdToSrfTemplateSetId[modelId] = templateSetId;
  });
  const fieldsetGuidToId = {};
  db.prepare('select id, guid from fieldset').all()
  .forEach(record => {
    fieldsetGuidToId[record.guid] = record.id;
  });
  // Import anki2 notes
  console.log('import notes');
  const anki2NoteIdToSrfFieldsetId = {};
  const insertFieldset = db.prepare('insert into fieldset (guid, templatesetid, fields) values (?,?,?)');
  srcdb.prepare('select * from notes').all()
  .forEach(record => {
    const model = models[record.mid];
    const fieldLabels = model.flds.map(field => field.name);
    const fieldValues = record.flds.split(String.fromCharCode(0x1f));
    const fields = {};
    fieldLabels.forEach((label, i) => {
      fields[label] = fieldValues[i];
    });
    if (fieldsetGuidToId[record.guid]) {
      db.prepare('update fieldset set templatesetid = ?, fields = ? where id = ?')
      .run(anki2ModelIdToSrfTemplateSetId[record.mid], JSON.stringify(fields), fieldsetGuidToId[record.guid]);
      anki2NoteIdToSrfFieldsetId[record.id] = fieldsetGuidToId[record.guid];
    } else {
      const info = insertFieldset
      .run(record.guid, anki2ModelIdToSrfTemplateSetId[record.mid], JSON.stringify(fields));
      anki2NoteIdToSrfFieldsetId[record.id] = info.lastInsertRowid;
    }
  });
  // Import anki2 cards
  console.log('import cards');
  const anki2CardIdToSrfCardId = {};
  srcdb.prepare('select * from cards').all()
  .forEach(record => {
    const fieldsetId = anki2NoteIdToSrfFieldsetId[record.nid];
    const fieldset = getFieldset(fieldsetId);
    if (!fieldset) {
      console.log('no fieldset for ', record, ', fieldsetId: ', fieldsetId);
      process.exit(0);
    }
    const templatesetId = fieldset.templatesetid;
    const templates = getTemplatesInTemplateset(templatesetId);
    const templateId = templates[record.ord].id;
    // Insert new record
    let interval = 0;
    let due = 0;
    let factor = 0;
    let views = record.reps;
    let lapses = record.lapses;
    let ord = 0;
    if (record.type === 0) {
      // New card
      ord = record.due;
      views = 0;
      lapses = 0;
    } else if (record.type === 1) {
      // Learn card
      due = record.due;
      interval = 60;
    } else if (record.type === 2) {
      // review card
      due = srccol.crt + record.due * 60 * 60 * 24;
      interval = record.ivl * 60 * 60 * 24;
      factor = Math.log(1 + interval / 900) * 0.4;
    } else if (record.type === 3) {
      // relearn card
      due = record.due;
      interval = 60;
    } else {
      console.log('unknown card type for ', record);
      throw new Error('unknown card type ' + record.type);
    }
    try {
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, due, factor, views, lapses, ord) values (?,?,?,?,?,?,?,?,?)')
      .run(fieldsetId, templateId, Math.floor(Date.now() / 1000), interval, due, factor, views, lapses, ord);
      anki2CardIdToSrfCardId[record.id] = info.lastInsertRowid;
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      }
    }
  });
  // Import anki21 revlog
  console.log('import revlog');
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)');
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki2CardIdToSrfCardId[record.cid];
    const ease = record.ease;
    const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
    const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
    const factor = Math.log(1 + interval / 900) * 0.4;
    const time = Math.floor(record.time / 1000);
    insertRevlog
    .run(record.id, cardId, ease, interval, lastinterval, factor, time, 0);
  });
  db.prepare('commit').run();
  // save media
  console.log('save media');
  const media = JSON.parse(data.media);
  Object.keys(media).forEach(key => {
    fs.writeFileSync(path.join(opts.media, media[key]), data[key]);
  });
}

function getFields (fieldsetId) {
  return JSON.parse(db.prepare('select fields from fieldset where id = ?').get(fieldsetId).fields);
}

/**
 * getMustacheTags returns an array of all the tags in the given template.
 *
 */
function getMustacheTags (template) {
  return [...new Set(
    require('mustache').parse(template)
    .filter(item => item[0] === 'name')
    .map(item => item[1])
  )];
}
