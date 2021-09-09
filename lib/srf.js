'use strict';

const opts = {};

const api = {
  close,
  createFieldset,
  createTemplate,
  createTemplateset,
  getAverageStudyTime,
  getAverageTimePerCard,
  getChartCardsStudiedPerDay,
  getChartCardsDuePerDay,
  getChartCardsPerInterval,
  getChartDuePerHour,
  getChartMaturedAndLapsedPerDay,
  getChartMinutesStudiedPerDay,
  getChartNewCardsPerDay,
  getCountCardsDueNow,
  getCountCardsDueToday,
  getCountCardsOverdue,
  getCountCardsSeen,
  getCountCardsViewedToday,
  getCountDaysStudied,
  getCountMatureCards,
  getCountNewCardsPast24Hours,
  getCountNewCardsRemaining,
  getDueCard,
  getEstimatedStudyTime,
  getFields,
  getFieldset,
  getFieldsets,
  getNewCard,
  getNextCard,
  getNextDue,
  getPercentCorrect,
  getStatsNext24Hours,
  getStatsPast24Hours,
  getStudyTimeToday,
  getTemplate,
  getTemplates,
  getTemplatesInTemplateset,
  getTemplateset,
  getTemplatesets,
  importAnki2,
  importAnki21,
  reviewCard,
  updateFieldset,
  updateTemplate,
  updateTemplateset
};

const fs = require('fs');
const path = require('path');

let db; // better-sqlite3 database handle

let config;

// startTime is the time when this execution of the server started.
const startTime = Math.floor(Date.now() / 1000);

// secPerDay is the number of seconds in a day
const secPerDay = 60 * 60 * 24;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = startTime;

// The number of cards buried
let buried = '';

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
  return (templateset);
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

function getTemplates () {
  return (db.prepare('select * from template').all());
}

function getTemplatesInTemplateset (templatesetid) {
  const templates = db.prepare('select * from template where templatesetid = ? order by id')
  .all(templatesetid);
  return (templates);
}

function updateSeenCard (card, elapsed, ease, interval) {
  const factor = newFactor(card, interval);
  const now = Math.floor(Date.now() / 1000);
  const due = Math.floor(
    now + interval * (1 - Math.random() / config.dispersionFactor)
  );
  const lapsed =
    interval < config.matureThreshold &&
    card.interval > config.matureThreshold;
  const lapses = lapsed ? card.lapses + 1 : card.lapses;
  db.prepare('update card set modified = ?, factor = ?, interval = ?, due = ?, views = ?, lapses = ? where id = ?')
  .run(now, factor, interval, due, card.views + 1, lapses, card.id);
  buryRelated(card);
  logReview(card, elapsed, ease, factor, interval, due, lapses);
}

function logReview (card, elapsed, ease, factor, interval, due, lapses) {
  const studyTimeToday = getStudyTimeToday() + elapsed;
  const now = Math.floor(Date.now() / 1000);
  const cardsViewedToday = getCountCardsViewedToday();
  const dueTodayCount = getCountCardsDueToday();
  const time = new Date().toTimeString().substring(0, 5);
  const percentCorrect = getPercentCorrect();
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
  const info = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)')
  .run(
    now * 1000,
    card.id,
    ease,
    interval,
    card.interval,
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
  const now = Math.floor(Date.now() / 1000);
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
  const now = Math.floor(Date.now() / 1000);
  const nextDueCard = getDueCard();
  const nextNewCard = getNewCard();
  if (
    getCountCardsOverdue() === 0 &&
    getAverageStudyTime(1) < config.studyTimeLimit &&
    getCountNewCardsPast24Hours() < config.maxNewCards &&
    getEstimatedAverageStudyTime(1) < config.studyTimeLimit &&
    getEstimatedAverageStudyTime(5) < config.studyTimeLimit &&
    (lastNewCardTime < now - 300 || !nextDueCard) &&
    nextNewCard
  ) {
    lastNewCardTime = now;
    return (nextNewCard);
  } else {
    return (nextDueCard);
  }
}

/**
 * getNextDue returns the due time of the next review card that is due.
 */
function getNextDue () {
  const nextDueCard = db.prepare('select due from card where interval != 0 order by due limit 1').get();
  return (nextDueCard ? nextDueCard.due : 0);
}

function getNewCard () {
  const now = Math.floor(Date.now() / 1000);
  const card = db.prepare('select * from card where due < ? and interval = 0 order by ord limit 1').get(now);
  return (card);
}

function getDueCard () {
  const now = Math.floor(Date.now() / 1000);
  const card = db.prepare('select * from card where interval != 0 and due < ? order by interval, due, templateid limit 1').get(now);
  return (card);
}

function getEstimatedTotalStudyTime () {
  const dueTodayCount = getCountCardsDueToday();
  const dueStudyTime = getEstimatedStudyTime(dueTodayCount);
  const studyTimeToday = getStudyTimeToday();
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  return (estimatedTotalStudyTime);
}

function getEstimatedAverageStudyTime (days) {
  const now = Math.floor(Date.now() / 1000);
  const cards =
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now + days * secPerDay)['count()'];
  const averageTimePerCard = getAverageTimePerCard();
  const estimatedStudyTime = Math.floor(cards * averageTimePerCard / days);
  return (estimatedStudyTime);
}

/**
 * For each fieldset there may be several cards. To avoid seeing these related
 * cards too close to each other, when a card is seen, defer the due date
 * of any other card in the set that is due in the next 5 days to 5 days
 * from now.
 */
function buryRelated (card) {
  const now = Math.floor(Date.now() / 1000);
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
  const now = Math.floor(Date.now() / 1000);
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
  if (!card.interval || card.interval === 0) return (config.goodMinInterval);
  const timeSinceLastSeen =
    Math.floor(Date.now() / 1000) - card.due + card.interval;
  const correctFactor = getCorrectFactor();
  if (getPercentCorrect() > 90) {
    setCorrectFactor(correctFactor + 1);
  } else {
    setCorrectFactor(correctFactor - 1);
  }
  const factor = 1.5 +
    card.factor *
    (correctFactor / 1000) *
    Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7);
  console.log('factor: ', factor.toFixed(2), card.factor.toFixed(2), correctFactor, Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7).toFixed(2));
  return (
    Math.min(
      config.maxInterval,
      Math.max(
        config.goodMinInterval,
        Math.floor(timeSinceLastSeen * factor)
      )
    )
  );
}

function getCorrectFactor () {
  try {
    return (
      parseInt(
        db.prepare('select value from config where name = ?')
        .get('correct factor').value
      )
    );
  } catch (e) {
    return (1000);
  }
}

function setCorrectFactor (factor) {
  const info = db.prepare('update config set value = ? where name = ?')
  .run(factor, 'correct factor');
  if (info.changes === 0) {
    db.prepare('insert into config (value, name) values (?, ?)')
    .run(factor, 'correct factor');
  }
}

function intervalEasy (card) {
  if (!card.interval || card.interval === 0) { return (config.easyMinInterval); }
  const now = Math.floor(Date.now() / 1000);
  const timeSinceLastSeen = now - card.due + card.interval;
  const factor = 3.0 + card.factor * Math.exp(-timeSinceLastSeen / 60 / 60 / 24 / 7);
  return (
    Math.min(
      config.maxInterval,
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
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  const result = db.prepare('select avg(t) from (select sum(time) as t, cast(id/1000/60/60/24 as integer) as d, cardid from revlog where id > ? group by d, cardid)')
  .get((startOfDay - 60 * 60 * 24 * 10) * 1000)['avg(t)'] || 30;
  // const average = Math.round(result, 2);
  const average = result.toFixed(2);
  return (average);
}

function getCountCardsDueToday () {
  const endOfDay =
      Math.floor(new Date().setHours(23, 59, 59, 999).valueOf() / 1000);
  return (
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(endOfDay)['count()'] || 0
  );
}

function getCountCardsSeen () {
  return (db.prepare('select count() from card where interval != 0').get()['count()'] || 0);
}

function getCountMatureCards () {
  return (
    db.prepare('select count() from card where interval >= ?')
    .get(config.matureThreshold)['count()'] || 0
  );
}

/**
 * getCountCardsOverdue returns the number of cards that were due more than
 * one day ago.
 */
function getCountCardsOverdue () {
  const now = Math.floor(Date.now() / 1000);
  return (
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now - secPerDay)['count()'] || 0
  );
}

function getCountCardsDueNow () {
  const now = Math.floor(Date.now() / 1000);
  return (db.prepare('select count() from card where interval != 0 and due < ?').get(now)['count()'] || 0);
}

function getCountCardsViewedToday () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  return (db.prepare('select count() from revlog where id >= ?').get(startOfDay * 1000)['count()']);
}

function getCountDaysStudied () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
  const firstRevlog = db.prepare('select id from revlog limit 1').get();
  if (firstRevlog) {
    const first = firstRevlog.id;
    const firstDayNumber = Math.floor((first - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
    return (dayNumber - firstDayNumber + 1);
  } else {
    return 0;
  }
}

function getCountNewCardsPast24Hours () {
  const now = Math.floor(Date.now() / 1000);
  return (
    db.prepare(
      'select count() as count from revlog where lastinterval = 0 and id >= ?'
    )
    .get((now - secPerDay) * 1000).count
  );
}

/**
 * getCountNewCardsRemaining returns the difference between
 * conf.maxNewCards and the number of new cards seen in the past 24 hours.
 */
function getCountNewCardsRemaining () {
  return config.maxNewCards - getCountNewCardsPast24Hours();
}

function getStatsPast24Hours () {
  const now = Math.floor(Date.now() / 1000);
  const stats = db.prepare(
    'select count() as count, sum(time) as time from revlog where id >= ?'
  )
  .get((now - secPerDay) * 1000);
  return (stats || { count: 0, time: 0 });
}

function getStatsNext24Hours () {
  const now = Math.floor(Date.now() / 1000);
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
    // The maximum time for viewing a card (seconds).
    // Beyond this, any answer is converted to 'again'
    maxViewTime: 120,

    // The maximum interval to when a card is due.
    maxInterval: secPerDay * 365,

    // The interval (seconds) beyond which a card is considered 'mature'
    matureThreshold: 60 * 60 * 24 * 21,

    // The window (seconds) in which to average percent correct reviews
    percentCorrectWindow: 60 * 60 * 24 * 7,

    // The factor used to add dispersion to the due time.
    // Maximum dispersion is -1 / dispersionFactor.
    dispersionFactor: 50,

    // The maximum number of new cards in 24 hours.
    maxNewCards: 20,

    // Study time (seconds) per day beyond which no new cards
    studyTimeLimit: 60 * 60,

    // The maximum value factor may take.
    maxFactor: 10000,

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
    easyFactorAdjust: 200
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
  return (info.lastInsertRowid);
}

/**
 * newFactor returns a decaying average of the log of the interval, scaled
 * to 15 minutes (900 seconds) and with a small offset so it is always >= 0.
 */
function newFactor (card, interval) {
  return (
    (card.factor || 0) * 0.6 +
      Math.log(1 + interval / 900) * 0.4
  ).toFixed(2);
}

/**
 * getPercentCorrect returns the percentage of correct answers (Hard, Good
 * or Easy) to cards with lastinterval > minInterval during the past window
 * seconds.
 */
function getPercentCorrect (window = config.percentCorrectWindow, minInterval = config.matureThreshold) {
  const now = Date.now();
  const result = db.prepare('select avg(case ease when 1 then 0 else 1 end) as average from (select ease from revlog where lastinterval > ? and id > ?)')
  .get(minInterval, now - window * 1000);
  return ((result && result.average) ? result.average * 100 : 100);
}

function getStudyTimeToday () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
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
  const now = Math.floor(Date.now() / 1000);
  const average =
    Math.floor(db.prepare('select sum(time) from revlog where id >= ?')
    .get((now - days * secPerDay) * 1000)['sum(time)'] / days) || 0;
  return (average);
}

/**
 * getMaxStudyTime returns the maximum study time, in seconds, in a 24 hour
 * sliding window over the given number of days.
 */
// eslint-disable-next-line no-unused-vars
function getMaxStudyTime (days) {
  const now = Math.floor(Date.now() / 1000);
  let maxStudyTime = 0;
  const times = db.prepare('select cast((id - @start)/(1000*60*60*24) as integer) as day,' +
    ' sum(time) as time ' +
    ' from revlog where id > @start group by day')
  .all({ start: 1 + (now - secPerDay * days) * 1000 });
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
      console.log('version: ', result.value);
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
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'init-schema-v1.sql'),
    'utf8'
  );
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
      } else {
        const cardId = db.prepare('select id from card where fieldsetid = ? and templateid = ?').get(fieldsetId, templateId).id;
        anki21CardIdToSrfCardId[record.id] = cardId;
      }
    }
  });
  // Import anki21 revlog
  console.log('import revlog');
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)');
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki21CardIdToSrfCardId[record.cid];
    if (cardId) {
      const ease = record.ease;
      const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
      const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
      const factor = Math.log(1 + interval / 900) * 0.4;
      const time = Math.floor(record.time / 1000);
      try {
        insertRevlog
        .run(record.id, cardId, ease, interval, lastinterval, factor, time, 0);
      } catch (err) {
        console.log('Failed to create revlog for record: ', record);
        db.prepare('commit').run();
        throw err;
      }
    } else {
      console.warn('Revlog ignored - no card found for card ID: ', record.cid);
    }
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
    result[key] = templateset.id;
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
    db.prepare('insert into template (templatesetid, name, front, back, css) values (?, ?, ?, ?, ?)')
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
      } else {
        const cardId = db.prepare('select id from card where fieldsetid = ? and templateid = ?').get(fieldsetId, templateId).id;
        anki2CardIdToSrfCardId[record.id] = cardId;
      }
    }
  });
  // Import anki2 revlog
  console.log('import revlog');
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, time, lapses) values (?,?,?,?,?,?,?,?)');
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki2CardIdToSrfCardId[record.cid];
    if (cardId) {
      const ease = record.ease;
      const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
      const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
      const factor = Math.log(1 + interval / 900) * 0.4;
      const time = Math.floor(record.time / 1000);
      insertRevlog
      .run(record.id, cardId, ease, interval, lastinterval, factor, time, 0);
    } else {
      console.warn('Revlog ignored - no card found: ', record);
    }
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
/* c8 ignore start */
function getMustacheTags (template) {
  return [...new Set(
    require('mustache').parse(template)
    .filter(item => item[0] === 'name')
    .map(item => item[1])
  )];
}
/* c8 ignore stop */

function getChartCardsDuePerDay () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  // Cards due per day
  const points = [];
  let last;
  let first = null;
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
  return (chart3Data);
}

function getChartCardsPerInterval () {
  // Cards per interval
  const points = [];
  let last;
  db.prepare('select interval/60/60/24 as days, count() from card where interval != 0 group by days').all().forEach(el => {
    last = el.days;
    points[el.days] = el['count()'];
  });
  // Eventually, most cards will have maximum interval. This isn't
  // interesting for the chart and will swamp the cards in progress,
  // so remove the last element if it is at max interval.
  if (last === Math.floor(config.maxInterval / 60 / 60 / 24)) last--;
  const chart4Data = { x: [], y: [] };
  for (let i = 0; i <= last; i++) {
    chart4Data.x.push(i);
    chart4Data.y.push(points[i] || 0);
  }
  return (chart4Data);
}

function getChartDuePerHour () {
  const now = Math.floor(Date.now() / 1000);
  const chart1Data = { x: [], y: [], type: 'bar' };
  db.prepare('select cast((due-@start)/(60*60) as integer) as hour, count() from card where due > @start and due < @end and interval != 0 group by hour')
  .all({ start: now, end: now + secPerDay })
  .forEach(el => {
    chart1Data.x.push(el.hour);
    chart1Data.y.push(el['count()']);
  });
  chart1Data.y[0] += getCountCardsDueNow();
  return chart1Data;
}

function getChartCardsStudiedPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
  // Cards studied per day
  let first;
  const points = [];
  db.prepare('select cast((id - ?)/(1000*60*60*24) as integer) as day, count() from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
    if (!first) first = el.day;
    points[el.day - first] = el['count()'];
  });
  const chart1Data = { x: [], y: [] };
  for (let i = 0; i <= dayNumber - first; i++) {
    chart1Data.x.push(i);
    chart1Data.y.push(points[i] || 0);
  }
  return (chart1Data);
}

function getChartMaturedAndLapsedPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
  // Matured & Lapsed per day
  const points = [];
  let first = null;
  db.prepare('select cast((id - @tzOffset)/1000/@secPerDay as int) as day, count(case when interval >= @threshold and lastinterval < @threshold then 1 else null end) as matured, count(case when interval < @threshold and lastinterval >= @threshold then 1 else null end) as lapsed from revlog group by day')
  .all({
    tzOffset: timezoneOffset * 1000,
    secPerDay: secPerDay,
    threshold: config.matureThreshold
  })
  .forEach(el => {
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

  return (chart6Data);
}

function getChartMinutesStudiedPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
  // Minutes studied per day
  const points = [];
  let first = null;
  db.prepare('select cast((id - ?)/(1000*60*60*24) as integer) as day, sum(time) as time from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
    if (!first) first = el.day;
    points[el.day - first] = el.time / 60;
  });
  const chart2Data = { x: [], y: [] };
  for (let i = 0; i <= dayNumber - first; i++) {
    chart2Data.x.push(i);
    chart2Data.y.push(points[i] || 0);
  }
  return (chart2Data);
}

function getChartNewCardsPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
  // New cards per day
  const points = [];
  let first = null;
  db.prepare('select cast(((id - ?)/1000/60/60/24) as int) as day, count() from (select * from revlog group by cardid) group by day').all(timezoneOffset * 1000).forEach(el => {
    if (!first) first = el.day;
    points[el.day - first] = el['count()'];
  });
  const chart5Data = { x: [], y: [] };
  for (let i = 0; i <= dayNumber - first; i++) {
    chart5Data.x.push(i);
    chart5Data.y.push(points[i] || 0);
  }
  return (chart5Data);
}

function reviewCard (card, elapsed, ease) {
  if (elapsed > config.maxViewTime) {
    elapsed = 120;
    ease = 'again';
  }
  if (ease === 'again') {
    const interval = intervalAgain(card);
    updateSeenCard(card, elapsed, 1, interval);
  } else if (ease === 'hard') {
    const interval = intervalHard(card);
    updateSeenCard(card, elapsed, 2, interval);
  } else if (ease === 'good') {
    const interval = intervalGood(card);
    updateSeenCard(card, elapsed, 3, interval);
  } else if (ease === 'easy') {
    const interval = intervalEasy(card);
    updateSeenCard(card, elapsed, 4, interval);
  } else {
    throw new Error('Unsupported ease: ' + ease);
  }
}

function getFieldsets () {
  return (db.prepare('select * from fieldset').all());
}

/**
 * createFieldset stores a new fieldset and returns its ID.
 *
 * A card is created for each template in the templateset.
 *
 * @param {intiger} templatesetid - the ID of the templateset to be used to
 * present this fieldset. This determines the set of relevant fields and
 * the number of cards to be produced.
 *
 * @param {string} fields - the set of field/value pairs, as JSON text.
 */
function createFieldset (guid, templatesetid, fields) {
  const info = db.prepare('insert into fieldset (guid, templatesetid, fields) values (?, ?, ?)')
  .run(
    guid,
    templatesetid,
    fields
  );
  const fieldsetid = info.lastInsertRowid;
  createCards(fieldsetid, templatesetid);
  return (fieldsetid);
}

function close () {
  if (db) {
    db.close();
  }
}

function updateFieldset (templatesetid, fields, fieldsetid) {
  // If the fieldset has changed the old cards are irrelevant - delete them
  const oldFieldset = getFieldset(fieldsetid);
  if (oldFieldset.templatesetid !== templatesetid) {
    deleteCardsForFieldset(fieldsetid);
  }
  db.prepare('update fieldset set templatesetid = ?, fields = ? where id = ?')
  .run(templatesetid, fields, fieldsetid);
  createCards(fieldsetid, templatesetid);
}

function deleteCardsForFieldset (fieldsetid) {
  db.prepare('delete card where fieldsetid = ?').run(fieldsetid);
}

function createTemplateset (name, fields) {
  const info = db.prepare('insert into templateset (name, fields) values (?, ?)')
  .run(
    name,
    fields
  );
  return (info);
}

function updateTemplateset (name, fields, id) {
  db.prepare('update templateset set name = ?, fields = ? where id = ?')
  .run(
    name,
    fields,
    id
  );
  createCardsForTemplateset(id);
}

function createCardsForTemplateset (id) {
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
  db.prepare('delete from card where fieldsetid in (select id from fieldset where templatesetid = @id) and templateid not in (select id from template where templatesetid = @id)').run({ id: id });
  db.prepare('commit').run();
}

function createTemplate (templatesetid, name, front, back, css) {
  db.prepare('begin transaction').run();
  const info = db.prepare('insert into template (templatesetid, name, front, back, css) values (?, ?, ?, ?, ?)')
  .run(
    templatesetid,
    name,
    front,
    back,
    css
  );
  console.log('insert info: ', info);
  createCardsForTemplate(info.lastInsertRowid);
  db.prepare('commit').run();
}

function updateTemplate (templatesetid, name, front, back, css, id) {
  db.prepare('begin transaction').run();
  const oldTemplate = getTemplate(id);
  if (oldTemplate.templatesetid !== templatesetid) {
    deleteCardsForTemplate(id); // old fieldsets
  }
  db.prepare('update template set templatesetid = ?, name = ?, front = ?, back = ?, css = ? where id = ?')
  .run(
    templatesetid,
    name,
    front,
    back,
    css,
    id
  );
  createCardsForTemplate(id); // new fieldsets
  db.prepare('commit').run();
}

module.exports = (options = {}) => {
  Object.assign(opts, {
    dir: path.join(process.env.HOME, '.local', 'share', 'srf'),
    database: 'srf.db',
    media: 'media',
    config: 'config.json'
  }, options);
  console.log('srf opts: ', opts);

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

  const instance = Object.create(api);

  db = getDatabaseHandle(opts);
  console.log('srf db: ', db);
  prepareDatabase();
  config = getConfig(opts);

  return instance;
};
