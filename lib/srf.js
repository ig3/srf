'use strict';

const opts = {};

const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');
Mustache.escape = function (text) {
  if (/\[sound:.*\]/.test(text)) {
    const src = [];
    for (const m of text.matchAll(/\[sound:(.*?)\]/g)) {
      src.push(m[1]);
    }
    let result = '<audio id="myaudio" autoplay controls></audio>';
    result += '<script>';
    result += 'var audioFiles = ["' + src.join('","') + '"];';
    result += '</script>';
    return result;
  } else {
    return text;
  }
};

let db; // better-sqlite3 database handle

let config;

// secPerDay is the number of seconds in a day
const secPerDay = 60 * 60 * 24;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = now();

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

function updateSeenCard (card, viewTime, studyTime, ease, interval) {
  const factor = newCardFactor(card, ease);
  const dispersion = config.dispersionFactor * (2 * Math.random() - 1);
  const due = Math.floor(now() + interval * (1 + dispersion / 100));
  const lapsed =
    interval < config.matureThreshold &&
    card.interval > config.matureThreshold;
  const lapses = lapsed ? card.lapses + 1 : card.lapses;
  db.prepare('update card set modified = ?, factor = ?, interval = ?, due = ?, views = ?, lapses = ? where id = ?')
  .run(now(), factor, interval, due, card.views + 1, lapses, card.id);
  logReview(card, viewTime, studyTime, ease, factor, interval, dispersion, due, lapses);
}

function logReview (card, viewTime, studyTime, ease, factor, interval, dispersion, due, lapses) {
  const info = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) values (?,?,?,?,?,?,?,?,?)')
  .run(
    Date.now(),
    card.id,
    ease,
    interval,
    card.interval,
    factor,
    viewTime,
    studyTime,
    lapses
  );
  if (info.changes !== 1) {
    console.log('revlog update failed ', info);
    process.exit(1);
  }
}

/**
 * formatSeconds returns a string representation of a number of seconds,
 * converted to minutes, hours or days, according to the number of seconds.
 */
function formatSeconds (n) {
  if (n < 60) {
    return n + 's';
  }
  n = n / 60;
  if (n < 10) {
    return n.toFixed(1) + 'm';
  }
  if (n < 60) {
    return n.toFixed(0) + 'm';
  }
  n = n / 60;
  if (n < 10) {
    return n.toFixed(1) + 'h';
  }
  if (n < 24) {
    return n.toFixed(0) + 'h';
  }
  n = n / 24;
  if (n < 10) {
    return n.toFixed(1) + 'd';
  }
  return n.toFixed(0) + 'd';
}

/**
 * getNextCard returns the next due card or a new card or undefined.
 *
 * A new card is returned if:
 *   - There were no overdue cards at start of day
 *   - Study time past 24 hours is less than studyTimeLimit
 *   - Average study time past 14 days is less than studyTimeLimit
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
    getAverageStudyTime(1) < config.studyTimeLimit &&
    getAverageStudyTime(14) < config.studyTimeLimit * 1.1 &&
    getCountNewCardsPast24Hours() < config.maxNewCards &&
    getEstimatedAverageStudyTime(1) < config.studyTimeLimit &&
    getEstimatedAverageStudyTime(5) < config.studyTimeLimit * 1.1 &&
    (lastNewCardTime < now() - 300 || !nextDueCard) &&
    nextNewCard
  ) {
    lastNewCardTime = now();
    return (nextNewCard);
  } else {
    return (nextDueCard);
  }
}

/**
 * getNextDue returns the due time of the next review card that is due.
 */
function getNextDue () {
  const nextDueCard =
    db.prepare('select min(due) from card where interval != 0')
    .get();
  return (nextDueCard ? nextDueCard['min(due)'] : 0);
}

function getCard (id) {
  const card = db.prepare('select * from card where id = ?').get(id);
  return (card);
}

/**
 * getNewCard returns the next new card or undefined.
 *
 * A new card is returned if there is one. Otherwise, if there are no more
 * new cards, then undefined is returned.
 */
function getNewCard () {
  const card = db.prepare('select * from card where due < ? and interval = 0 order by ord limit 1').get(now());
  return (card);
}

function getDueCard () {
  let card = db.prepare('select * from card where interval != 0 and due < ? order by interval, due, templateid limit 1').get(now());
  if (!card && config.previewWindow) {
    const lastReviewTime = getTimeLastReview();
    card = db.prepare('select * from card where interval != 0 and due < ? order by due, templateid limit 1')
    .get(lastReviewTime + config.previewWindow);
  }
  return (card);
}

function getEstimatedAverageStudyTime (days) {
  const cards =
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now() + days * secPerDay)['count()'];
  const averageStudyTimePerCard = getAverageStudyTimePerCard();
  const estimatedStudyTime = Math.floor(cards * averageStudyTimePerCard / days);
  return (estimatedStudyTime);
}

/**
 * Defer all other cards from the same fieldset so that none are due within
 * minTime seconds.
 */
function deferRelated (card, minTime) {
  const minDue = now() + minTime;
  db.prepare('update card set due = ? where fieldsetid = ? and id != ? and due < ?')
  .run(
    minDue,
    card.fieldsetid,
    card.id,
    minDue
  );
}

/**
 * getNewInterval gets the new interval for a card, given the card and the
 * ease of the last review (again, hard, good or easy). This is the
 * essential function of the spaced repetition algorithm which determines
 * when the card will be seen. To change the scheduler, change this
 * function.
 */
function getNewInterval (card, ease) {
  if (ease === 'again') return intervalAgain(card);
  else if (ease === 'hard') return intervalHard(card);
  else if (ease === 'good') return intervalGood(card);
  else if (ease === 'easy') return intervalEasy(card);
  else throw new Error('unsupported ease: ' + ease);
}

/**
 * Get all the intervals (Again, Hard, Good and Easy) for the given card.
 */
function getIntervals (card) {
  return {
    again: intervalAgain(card),
    hard: intervalHard(card),
    good: intervalGood(card),
    easy: intervalEasy(card)
  };
}

function getLastInterval (card) {
  const timeLastSeen = getTimeCardLastSeen(card.id);
  if (!timeLastSeen) return 0;
  const timeSinceLastSeen = now() - timeLastSeen;
  return Math.max(card.interval, timeSinceLastSeen);
}

function intervalAgain (card) {
  return (
    Math.floor(
      Math.max(
        config.againMinInterval,
        card.interval * config.againFactor
      )
    )
  );
}

function intervalHard (card) {
  return (
    Math.max(
      config.hardMinInterval,
      Math.floor(getLastInterval(card) * config.hardFactor)
    )
  );
}

function intervalGood (card) {
  return (
    Math.min(
      config.maxInterval,
      config.maxGoodInterval,
      Math.max(
        config.goodMinInterval,
        Math.floor(
          getLastInterval(card) *
          config.goodFactor *
          newCardFactor(card, 'good') *
          (getCorrectFactor() / 1000)
        )
      )
    )
  );
}

function intervalEasy (card) {
  return (
    Math.min(
      config.maxInterval,
      config.maxEasyInterval,
      Math.max(
        config.easyMinInterval,
        Math.floor(intervalGood(card) * config.easyFactor)
      )
    )
  );
}

/**
 * getTimeCardLastSeen returns the time the card was last seen, as seconds
 * since the epoch, or 0 if the card has not been seen.
 */
function getTimeCardLastSeen (cardid) {
  const result = db.prepare('select max(id) as id from revlog where cardid = ?')
  .get(cardid);
  if (result) {
    return (Math.floor(result.id / 1000));
  } else {
    return 0;
  }
}

/**
 * getTimeLastReview returns the time the card was last seen, as seconds
 * since the epoch, or 0 if the card has not been seen.
 */
function getTimeLastReview () {
  const result = db.prepare('select max(id) as id from revlog')
  .get();
  if (result) {
    return (Math.floor(result.id / 1000));
  } else {
    return 0;
  }
}

/**
 * getAverageStudyTimePerCard returns the average time spent per card over the
 * past 14 days. Note that this is not the average time per view, as some
 * cards are viewed more than once.
 */
function getAverageStudyTimePerCard () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  const result = db.prepare('select avg(t) from (select sum(studytime) as t, cast(id/1000/60/60/24 as integer) as d, cardid from revlog where id > ? group by d, cardid)')
  .get((startOfDay - 60 * 60 * 24 * 14) * 1000)['avg(t)'] || 30;
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
  return (
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now() - secPerDay)['count()'] || 0
  );
}

function getCountCardsDueNow () {
  return (
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now())['count()'] || 0
  );
}

function getCountCardsViewedToday () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  return (db.prepare('select count() from revlog where id >= ?').get(startOfDay * 1000)['count()']);
}

function getCountDaysStudied () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((now() - timezoneOffset) / 60 / 60 / 24);

  const firstRevlog = db.prepare('select min(id) from revlog').get();
  if (firstRevlog) {
    const first = firstRevlog['min(id)'];
    const firstDayNumber = Math.floor((first - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);
    return (dayNumber - firstDayNumber + 1);
  } else {
    return 0;
  }
}

function getCountNewCardsPast24Hours () {
  return (
    db.prepare(
      'select count() as count from revlog where lastinterval = 0 and id >= ?'
    )
    .get((now() - secPerDay) * 1000).count
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
  const stats = db.prepare(
    'select count() as count, sum(studytime) as time from revlog where id >= ?'
  )
  .get((now() - secPerDay) * 1000);
  return (stats || { count: 0, time: 0 });
}

function getStatsNext24Hours () {
  const count = db.prepare('select count() from card where interval != 0 and due < ?').get(now() + secPerDay)['count()'] || 0;
  return ({
    count: count,
    time: count * getAverageStudyTimePerCard()
  });
}

function getEstimatedStudyTime (count) {
  return Math.floor(count * getAverageStudyTimePerCard());
}

function getConfig (opts) {
  if (!config) {
    const defaults = {
      // Display theme
      theme: 'dark',

      // Minimum time between related cards (seconds)
      minTimeBetweenRelatedCards: '5days',

      // Window to look ahead for due cards
      previewWindow: 0,

      // Backup retention time (seconds)
      backupRetention: '30days',

      // Minimum number of backups to keep
      minBackups: 2,

      // Maximum number of backups to keep
      maxBackups: 10,

      // The maximum time for viewing a card (seconds).
      // Beyond this, any answer is converted to 'again'
      maxViewTime: '2 minutes',

      // The maximum interval to when a card is due.
      maxInterval: '1 year',
      maxGoodInterval: '1 year',
      maxEasyInterval: '1 year',

      // The interval (seconds) beyond which a card is considered 'mature'
      matureThreshold: '21 days',

      // The window (seconds) in which to average percent correct reviews
      percentCorrectWindow: '1 month',

      // The interval (seconds) between correct factor adjustments
      correctFactorAdjustmentInterval: '1 day',

      // The factor used to add dispersion to the due time.
      // As percentage of the total interval.
      dispersionFactor: 5,

      // The maximum number of new cards in 24 hours.
      maxNewCards: 20,

      // Study time (seconds) per day beyond which no new cards
      studyTimeLimit: '1 hour',

      // minimum intervals according to responses to reviews
      againMinInterval: '20 seconds',
      hardMinInterval: '30 seconds',
      goodMinInterval: '60 seconds',
      easyMinInterval: '1 days',

      againFactor: 0.1,
      hardFactor: 0.5,
      goodFactor: 1.0,
      easyFactor: 1.5,

      // Parameters for calculating exponentially weighted moving average
      // of review replies
      weightAgain: 0,
      weightHard: 1,
      weightGood: 2,
      weightEasy: 4,
      decayFactor: 0.95
    };
    config = require('@ig3/config')({
      defaults: defaults,
      config: opts.config,
      debug: true
    });
    Object.keys(config)
    .forEach(key => {
      config[key] = resolveUnits(config[key]);
    });
  }
  return config;
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

/**
 * TODO: if the front is blank, don't create the card and if it exists,
 * delete it.
 */
function createCard (fieldsetid, templateid) {
  const fields = getFields(fieldsetid);
  const template = getTemplate(templateid);
  const front = render(template.front, fields);
  console.log('front: ', front);
  if (front) {
    try {
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, due, factor, views, lapses, ord) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        fieldsetid,
        templateid,
        now(),
        0,
        0,
        0,
        0,
        0,
        0
      );
      console.log('insert info: ', info);
      return (info.lastInsertRowid);
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      }
    }
  } else {
    console.log('front is blank: delete card');
    db.prepare('delete from card where fieldsetid = ? and templateid = ?')
    .run(fieldsetid, templateid);
  }
}

/**
 * render returns the rendering of the given template in the given context.
 */
function render (template, context) {
  return (Mustache.render(template, context));
}

/**
 * newCardFactor returns a decaying average of the ease.
 */
function newCardFactor (card, ease) {
  const easeWeight = {
    again: config.weightAgain,
    hard: config.weightHard,
    good: config.weightGood,
    easy: config.weightEasy
  };
  return (
    config.decayFactor * (card.factor || 0) +
    (1.0 - config.decayFactor) * (easeWeight[ease])
  ).toFixed(2);
}

/**
 * getPercentCorrect returns the percentage of correct answers (Hard, Good
 * or Easy) to cards with lastinterval > minInterval during the past window
 * seconds.
 */
function getPercentCorrect (
  window = config.percentCorrectWindow,
  minInterval = config.matureThreshold
) {
  const result = db.prepare("select avg(case ease when 'again' then 0 else 1 end) as average from (select ease from revlog where lastinterval > ? and id > ?)")
  .get(minInterval, (now() - window) * 1000);
  return ((result && result.average) ? result.average * 100 : 100);
}

function getStudyTimeToday () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  return (
    db.prepare('select sum(studytime) from revlog where id >= ?')
    .get(startOfDay * 1000)['sum(studytime)'] || 0
  );
}

/**
 * getAverageStudyTime returns the average total study time per day
 * over the given number of days.
 */
function getAverageStudyTime (days) {
  const average =
    Math.floor(db.prepare('select sum(studytime) from revlog where id >= ?')
    .get((now() - days * secPerDay) * 1000)['sum(studytime)'] / days) || 0;
  return (average);
}

/**
 * getMaxStudyTime returns the maximum study time, in seconds, in a 24 hour
 * sliding window over the given number of days.
 */
// eslint-disable-next-line no-unused-vars
function getMaxStudyTime (days) {
  let maxStudyTime = 0;
  const times = db.prepare('select cast((id - @start)/(1000*60*60*24) as integer) as day,' +
    ' sum(studytime) as time ' +
    ' from revlog where id > @start group by day')
  .all({ start: 1 + (now() - secPerDay * days) * 1000 });
  times
  .forEach(el => {
    if (el.time > maxStudyTime) maxStudyTime = el.time;
  });
  return (maxStudyTime);
}

/**
 * prepareDatabase initializes or updates the database as required
 */
function prepareDatabase () {
  let schemaVersion;
  try {
    const result =
      db.prepare('select value from config where name = ?')
      .get('srf schema version');
    if (!result) {
      throw new Error('missing srf schema version');
    }
    schemaVersion = result.value;
  } catch (e) {
    if (e.message === 'no such table: config') {
      initializeDatabase();
      schemaVersion = '1';
    } else {
      throw e;
    }
  }
  if (schemaVersion === '1') {
    updateSchemaV2();
    schemaVersion = '2';
  }
  if (schemaVersion === '2') {
    updateSchemaV3();
    schemaVersion = '3';
  }
  if (schemaVersion === '3') {
    updateSchemaV4();
    schemaVersion = '4';
  }
  if (schemaVersion === '4') {
    updateSchemaV5();
    schemaVersion = '5';
  }
}

/**
 * Initialize database does initial setup of a new database.
 */
function initializeDatabase () {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v1.sql'),
    'utf8'
  );
  db.exec(batch);
}

function updateSchemaV2 () {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v2.sql'),
    'utf8'
  );
  db.exec(batch);
}

function updateSchemaV3 () {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v3.sql'),
    'utf8'
  );
  db.exec(batch);
}

function updateSchemaV4 () {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v4.sql'),
    'utf8'
  );
  db.exec(batch);
}

function updateSchemaV5 () {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v5.sql'),
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
      .run(
        fieldsetId,
        templateId,
        now(),
        interval,
        due,
        factor,
        views,
        lapses,
        ord
      );
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
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) values (?,?,?,?,?,?,?,?,?)');
  const easeMap = {
    1: 'again',
    2: 'hard',
    3: 'good',
    4: 'easy'
  };
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki21CardIdToSrfCardId[record.cid];
    if (cardId) {
      const ease = easeMap[record.ease];
      const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
      const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
      const factor = Math.log(1 + interval / 900) * 0.4;
      const time = Math.floor(record.time / 1000);
      try {
        insertRevlog
        .run(record.id, cardId, ease, interval, lastinterval, factor, time, time, 0);
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
      .run(
        fieldsetId,
        templateId,
        now(),
        interval,
        due,
        factor,
        views,
        lapses,
        ord
      );
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
  const insertRevlog = db.prepare('insert into revlog (id, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) values (?,?,?,?,?,?,?,?,?)');
  const easeMap = {
    1: 'again',
    2: 'hard',
    3: 'good',
    4: 'easy'
  };
  srcdb.prepare('select * from revlog').all()
  .forEach(record => {
    const cardId = anki2CardIdToSrfCardId[record.cid];
    if (cardId) {
      const ease = easeMap[record.ease];
      const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
      const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
      const factor = Math.log(1 + interval / 900) * 0.4;
      const time = Math.floor(record.time / 1000);
      insertRevlog
      .run(record.id, cardId, ease, interval, lastinterval, factor, time, time, 0);
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
  if (last === Math.floor(config.maxInterval / 60 / 60 / 24)) {
    last--;
  }
  const chart4Data = { x: [], y: [] };
  for (let i = 0; i <= last; i++) {
    chart4Data.x.push(i);
    chart4Data.y.push(points[i] || 0);
  }
  return (chart4Data);
}

function getChartDuePerHour () {
  const chart1Data = { x: [], y: [], type: 'bar' };
  db.prepare('select cast((due-@start)/(60*60) as integer) as hour, count() from card where due > @start and due < @end and interval != 0 group by hour')
  .all({ start: now(), end: now() + secPerDay })
  .forEach(el => {
    chart1Data.x.push(el.hour);
    chart1Data.y.push(el['count()']);
  });
  chart1Data.y[0] += getCountCardsDueNow();
  return chart1Data;
}

// The study time chart is presented on the home page
// It includes actual study time per hour for the past 24 hours
// and estimated study time per hour for the next 24 hours.
function getChartStudyTime () {
  let points = [];
  const timePerCard = getAverageStudyTimePerCard() / 60;
  const chart1Data = { x: [], y: [], type: 'bar' };
  db.prepare('select cast((id / 1000 - @start)/(60*60) as integer) as hour, sum(studytime) as time from revlog where id / 1000 > @start group by hour')
  .all({ start: now() - secPerDay })
  .forEach(el => {
    points[el.hour] = el.time / 60;
  });

  for (let i = 0; i < 24; i++) {
    chart1Data.x.push(i - 24);
    chart1Data.y.push(points[i] || 0);
  }

  points = [];
  db.prepare('select cast((due-@start)/(60*60) as integer) as hour, count() from card where due > @start and due < @end and interval != 0 group by hour')
  .all({ start: now(), end: now() + secPerDay })
  .forEach(el => {
    points[el.hour] = el['count()'] * timePerCard;
  });
  points[0] += getCountCardsDueNow() * timePerCard;

  for (let i = 0; i < 24; i++) {
    chart1Data.x.push(i);
    chart1Data.y.push(points[i] || 0);
  }
  return chart1Data;
}

function getChartStudyTimePerHour () {
  const points = [];
  db.prepare('select cast((id / 1000 - @start)/(60*60) as integer) as hour, sum(studytime) as time from revlog where id > @start group by hour')
  .all({ start: now() - secPerDay })
  .forEach(el => {
    points[el.hour] = el.time / 60;
  });
  const chart1Data = { x: [], y: [], type: 'bar' };
  for (let i = 0; i < 24; i++) {
    chart1Data.x.push(i - 24);
    chart1Data.y.push(points[i] || 0);
  }
  return chart1Data;
}

function getChartCardsStudiedPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((now() - timezoneOffset) / 60 / 60 / 24);
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
  const dayNumber = Math.floor((now() - timezoneOffset) / 60 / 60 / 24);
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
    name: 'Net'
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
    name: 'Matured'
  };
  const chart6Trace4 = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Cumulative',
    yaxis: 'y2',
    line: {
      color: 'rgb(0, 0, 0)'
    }
  };
  let total = 0;
  for (let i = 0; i <= dayNumber - first; i++) {
    chart6Trace1.x.push(i);
    chart6Trace1.y.push(points[i] ? points[i].matured - points[i].lapsed : 0);
    chart6Trace2.x.push(i);
    chart6Trace2.y.push(points[i] ? points[i].lapsed : 0);
    chart6Trace3.x.push(i);
    chart6Trace3.y.push(points[i] ? points[i].matured : 0);
    total += points[i] ? points[i].matured - points[i].lapsed : 0;
    chart6Trace4.x.push(i);
    chart6Trace4.y.push(total);
  }
  const chart6Data = [chart6Trace1, chart6Trace2, chart6Trace3, chart6Trace4];

  return (chart6Data);
}

function getChartMinutesStudiedPerDay () {
  const timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  const dayNumber = Math.floor((now() - timezoneOffset) / 60 / 60 / 24);
  // Minutes studied per day
  const points = [];
  let first = null;
  db.prepare('select cast((id - ?)/(1000*60*60*24) as integer) as day, sum(studytime) as time from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
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
  const dayNumber = Math.floor((now() - timezoneOffset) / 60 / 60 / 24);
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

function reviewCard (card, viewTime, studyTime, ease) {
  if (viewTime > config.maxViewTime) {
    studyTime = viewTime = 120;
    ease = 'again';
  }
  viewTime = Math.floor(viewTime);
  const newInterval = getNewInterval(card, ease);
  updateSeenCard(card, viewTime, studyTime, ease, newInterval);
  deferRelated(card, config.minTimeBetweenRelatedCards);
}

const getCorrectFactor = (function () {
  let correctFactor;
  let lastUpdated;
  function update () {
    if (!correctFactor) {
      try {
        const fields = db.prepare('select * from config where name = ?')
        .get('correct factor');
        correctFactor = parseInt(fields.value);
        lastUpdated = parseInt(fields.modified);
      } catch (e) {
        db.prepare('insert into config (value, name) values (?, ?)')
        .run(
          '1000',
          'correct factor'
        );
        correctFactor = 1000;
        lastUpdated = now();
      }
    }
    if (
      !lastUpdated ||
      (now() - lastUpdated) > config.correctFactorAdjustmentInterval
    ) {
      const percentCorrect = getPercentCorrect();
      const change = Math.trunc(percentCorrect - 90);
      if (change !== 0) {
        correctFactor += change;
        lastUpdated = now();
        const info = db.prepare(
          'update config set value = ? where name = ?'
        )
        .run(
          correctFactor.toString(),
          'correct factor'
        );
        if (info.changes !== 0) {
          console.log('update correct factor: ', correctFactor);
        }
      }
    }
    return correctFactor;
  }
  return update;
}());

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
  if (oldFieldset.templatesetid !== Number(templatesetid)) {
    deleteCardsForFieldset(fieldsetid);
  }
  db.prepare('update fieldset set templatesetid = ?, fields = ? where id = ?')
  .run(templatesetid, fields, fieldsetid);
  createCards(fieldsetid, templatesetid);
}

function deleteCardsForFieldset (fieldsetid) {
  db.prepare('delete from card where fieldsetid = ?').run(fieldsetid);
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
  if (oldTemplate.templatesetid !== Number(templatesetid)) {
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
  if (opts.verbose) console.debug('srf opts: ', opts);

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

  config = getConfig(opts);

  backupDatabase();

  db = getDatabaseHandle(opts);
  prepareDatabase();

  return instance;
};

function now () {
  return (Math.floor(Date.now() / 1000));
}

function fixDatabase () {
  db.prepare('begin transaction').run();
  fixRevlogID();
  fixRevlogLastinterval();
  fixRevlogInterval();
  db.prepare('commit').run();
}

function fixRevlogLastinterval () {
  console.log('fix lastinterval');
  let count = 0;
  const cards = {};
  db.prepare('select id, cardid, interval, lastinterval from revlog')
  .all()
  .forEach(row => {
    if (row.lastinterval !== (cards[row.cardid] || 0)) {
      count++;
      const info = db.prepare('update revlog set lastinterval = ? where id = ?')
      .run((cards[row.cardid] || 0), row.id);
      if (info.changes !== 1) {
        console.log('###### revlog not updated ', info);
      }
    }
    cards[row.cardid] = row.interval;
  });
  console.log('fixed lastinterval ' + count);
}

function fixRevlogInterval () {
  console.log('fix interval');
  let count = 0;
  db.prepare('select revlog.id, revlog.cardid, revlog.interval as revloginterval, card.interval as cardinterval from revlog join card on card.id = revlog.cardid where revlog.id in (select max(id) from revlog group by cardid) and revlog.interval <> card.interval order by revlog.id')
  .all()
  .forEach(row => {
    if (row.revloginterval !== row.cardinterval) {
      count++;
      const info = db.prepare('update revlog set interval = ? where id = ?')
      .run(row.cardinterval, row.id);
      if (info.changes !== 1) {
        console.log('##### revlog update error ', info);
      }
    }
  });
  console.log('fixed interval ' + count);
}

function fixRevlogID () {
  console.log('fix ID');
  let count = 0;
  let lastID = 0;
  db.prepare('select rowid, id from revlog')
  .all()
  .forEach(row => {
    if (row.id === lastID) {
      count++;
      const info = db.prepare('update revlog set id = ? where rowid = ?')
      .run(row.id + 1, row.rowid);
      if (info.changes !== 1) {
        console.log('##### revlog update error ', info);
      }
      lastID = row.id + 1;
    } else {
      lastID = row.id;
    }
  });
  console.log('fixed id ' + count);
}

function backupDatabase () {
  purgeOldDatabaseBackups();
  // Make a backup copy of the database
  if (fs.existsSync(opts.database)) {
    fs.copyFileSync(
      opts.database,
      opts.database + '.' + (new Date()).toISOString() + '.bak'
    );
  }
}

function purgeOldDatabaseBackups () {
  fs.readdirSync(opts.dir)
  .filter(name => name.endsWith('.bak'))
  .filter(name => name.startsWith(path.basename(opts.database)))
  .sort()
  .reverse()
  .map(name => path.join(opts.dir, name))
  .filter((path, i) =>
    fileOlderThanOneDay(path) &&
    (i >= config.minBackups) &&
    (i >= (config.maxBackups - 1) || fileOlderThanBackupRetention(path))
  )
  .forEach(path => {
    console.log('unlink: ', path);
    fs.unlinkSync(path);
  });
}

function fileOlderThanOneDay (path) {
  const limit = (Date.now() - 1000 * 60 * 60 * 24);
  return (fs.statSync(path).mtime < limit);
}

function fileOlderThanBackupRetention (path) {
  const limit = (Date.now() - config.backupRetention * 1000);
  return (fs.statSync(path).mtime < limit);
}

function resolveUnits (value) {
  if (typeof value === 'string') {
    const match = value.match(/^([0-9]+)\s*(.*)/);
    if (match) {
      const number = Number(match[1] || '0');
      const units = match[2].toLowerCase();
      if (units) {
        const multiplier = getMultiplier(units);
        if (!multiplier) throw new Error('Unsupported unit: ' + units);
        return number * multiplier;
      }
    }
  }
  return value;
}

function getMultiplier (unit) {
  const units = [
    ['seconds', 1],
    ['minutes', 60],
    ['hours', 3600],
    ['days', 3600 * 24],
    ['weeks', 3600 * 24 * 7],
    ['months', 3600 * 24 * 365 / 12],
    ['years', 3600 * 24 * 365]
  ];
  for (let i = 0; i < units.length; i++) {
    if (units[i][0].startsWith(unit)) return units[i][1];
  }
  throw new Error('Unsupported unit: ' + unit);
}

const api = {
  close,
  createFieldset,
  createTemplate,
  createTemplateset,
  deferRelated,
  fixDatabase,
  formatSeconds,
  getAverageStudyTime,
  getAverageStudyTimePerCard,
  getCard,
  getChartCardsStudiedPerDay,
  getChartCardsDuePerDay,
  getChartCardsPerInterval,
  getChartDuePerHour,
  getChartMaturedAndLapsedPerDay,
  getChartMinutesStudiedPerDay,
  getChartNewCardsPerDay,
  getChartStudyTime,
  getChartStudyTimePerHour,
  getConfig,
  getCorrectFactor,
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
  getIntervals,
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
  render,
  reviewCard,
  updateFieldset,
  updateTemplate,
  updateTemplateset
};
