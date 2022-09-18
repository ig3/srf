'use strict';

// The srf database schema version
const currentSchemaVersion = 8;

const opts = {};

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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

// let averageStudyTimePerCard = 0;

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
  fieldset.templates = getTemplates(fieldset.templateset);
  return (fieldset);
}

function getTemplateset (name) {
  const templateset = { name: name };
  templateset.templates = getTemplates(name);
  templateset.fields = getTemplatesetFields(templateset);
  templateset.fieldsJSON = JSON.stringify(templateset.fields);
  return (templateset);
}

/**
 * getTemplatesetFields returns an array of fields used in the templates of
 * the templateset.
 */
function getTemplatesetFields (templateset) {
  const fields = new Set();
  templateset.templates.forEach(template => {
    getMustacheTags(template.front).forEach(field => fields.add(field));
    getMustacheTags(template.back).forEach(field => fields.add(field));
  });
  return [...fields];
}

// getTemplatesets returns an object keyed by templateset names, with
// details of each templateset.
function getTemplatesets () {
  const templatesets = db.prepare('select distinct templateset as name from template').all();
  console.log('templatesets: ' + JSON.stringify(templatesets, null, 2));
  templatesets.forEach(templateset => {
    templateset.templates = getTemplates(templateset.name);
    templateset.fields = getTemplatesetFields(templateset);
    templateset.fieldsJSON = JSON.stringify(templateset.fields);
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

function getTemplates (templateset) {
  if (templateset) {
    return (db.prepare('select * from template where templateset = ?').all(templateset));
  } else {
    return (db.prepare('select * from template').all());
  }
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
  const card = db.prepare('select * from card where due < ? and interval = 0 order by ord, id limit 1').get(now());
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

/**
 * getEstimatedAverageStudyTime returns an estimate of average study time per,
 * considering cards due in the given window of days.
 *
 * Accurately modelling study time in a window is complicated. Here, a crude
 * estimate is used, based on actual historic study and the number of cards
 * coming due in the future window.
 */
function getEstimatedAverageStudyTime (days) {
  const cardsDue =
    db.prepare('select count() from card where interval != 0 and due < ?')
    .get(now() + days * secPerDay)['count()'];
  let revs =
    db.prepare('select count(distinct cardid) as cards, sum(studytime) as time from revlog where id > ?')
    .get((now() - days * secPerDay) * 1000);
  if (revs && revs.cards > 0) {
    return Math.floor(revs.time * cardsDue / revs.cards);
  }
  revs =
    db.prepare('select count(distinct cardid) as cards, sum(studytime) as time from revlog')
    .get();
  if (revs && revs.cards > 0) {
    return Math.floor(revs.time * cardsDue / revs.cards);
  }
  // If there is no history at all, assume 30 seconds per card.
  return Math.floor(cardsDue * 30);
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
  if (card.interval < 7 * secPerDay) return card.interval;
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
        getLastInterval(card) * config.againFactor
      )
    )
  );
}

function intervalHard (card) {
  return (
    Math.floor(
      Math.max(
        config.hardMinInterval,
        getLastInterval(card) * config.hardFactor
      )
    )
  );
}

function intervalGood (card) {
  const lastInterval = getLastInterval(card);
  return (
    Math.floor(
      Math.min(
        config.maxInterval,
        config.maxGoodInterval,
        Math.max(
          config.goodMinInterval,
          lastInterval * config.goodMinFactor,
          (
            lastInterval *
            config.goodFactor *
            newCardFactor(card, 'good') *
            getCorrectFactor()
          )
        )
      )
    )
  );
}

function intervalEasy (card) {
  return (
    Math.floor(
      Math.min(
        config.maxInterval,
        config.maxEasyInterval,
        Math.max(
          config.easyMinInterval,
          intervalGood(card) * config.easyFactor
        )
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

function getAverageStudyTimePerReview (days = 14) {
  let result = db.prepare('select avg(studytime) as t from revlog where id > ?')
  .get((now() - secPerDay * days) * 1000);

  if (!result.t) {
    result = db.prepare('select avg(studytime) as t from revlog')
    .get();
  }
  return result.t || 30;
}

/**
 * cacheAverageStudyTimePerCard averages study time per day per unique
 * card, averaged over a number of days.
 *
 * The average is reasonably accurate but calculating it is expensive
 * because it is necessary to consider each day separately. So the result
 * is cached and this function should only be called occasionally (e.g.
 * once per day.)
 */
/*
function cacheAverageStudyTimePerCard (days = 14) {
  const result = db.prepare('select avg(studytime) as s, avg(n) as n, avg(t) as t from (select id, cardid, studytime, (select count(*) from revlog where cardid = a.cardid and id >= a.id and id < (a.id + 1000 * 60 * 60 * 24)) as n, (select sum(studytime) from revlog where cardid = a.cardid and id >= a.id and id < (a.id + 1000 * 60 * 60 * 24)) as t from (select * from revlog where id > ?) as a)')
  .get((now() - secPerDay * days) * 1000);

  console.log('card stats: ', result.s, result.n, result.t);
  averageStudyTimePerCard = result.t;
}
*/

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

function getCountCardsStage1 () {
  return (
    db.prepare('select count() from card where interval > 0 and interval < ?')
    .get(config.learningThreshold)['count()'] || 0
  );
}

function getCountCardsStage2 () {
  return (
    db.prepare('select count() from card where interval >= ? and interval < ?')
    .get(config.learningThreshold, config.matureThreshold)['count()'] || 0
  );
}

function getCountCardsStage3 () {
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

/**
 * getCountCardsViewedToday returns the number of distinct cards seen since
 * the start of the day, local time.
 */
function getCountCardsViewedToday () {
  const startOfDay =
      Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  return (db.prepare('select count(distinct cardid) as n from revlog where id >= ?').get(startOfDay * 1000).n);
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
    'select count(distinct cardid) as count, sum(studytime) as time from revlog where id >= ?'
  )
  .get((now() - secPerDay) * 1000);
  return (stats || { count: 0, time: 0 });
}

function getStatsNext24Hours () {
  const count = db.prepare('select count() from card where interval != 0 and due < ?').get(now() + secPerDay)['count()'] || 0;
  return ({
    count: count,
    time: getEstimatedAverageStudyTime(1)
  });
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
      learningThreshold: '1 week',
      matureThreshold: '21 days',

      // The window (seconds) in which to average percent correct reviews
      percentCorrectWindow: '1 year',

      // The target for percent correct reviews
      percentCorrectTarget: 90,
      percentCorrectSensitivity: 0.001,

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
      goodMinFactor: 1.1,
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
      debug: opts.debug
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
function createCards (fieldsetid, templateset) {
  console.log('createCards ', fieldsetid, templateset);
  const templates = getTemplates(templateset);

  templates.forEach(template => {
    createCard(fieldsetid, template.id);
  });
}

/**
 * createCardsForTemplate creates all cards for the given template.
 */
function createCardsForTemplate (templateid) {
  console.log('createCardsForTemplate ', templateid);
  const template = getTemplate(templateid);
  const fieldsets = db.prepare('select id from fieldset where templateset = ?').all(template.templateset);
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
  const fieldset = getFieldset(fieldsetid);
  const template = getTemplate(templateid);
  const front = render(template.front, fieldset.fields);
  const back = render(template.back, fieldset.fields);
  if (front && back) {
    try {
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, due, factor, views, lapses, ord) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        fieldsetid,
        templateid,
        now(),
        0,
        0,
        2,
        0,
        0,
        fieldset.ord
      );
      console.log('insert info: ', info);
      return (info.lastInsertRowid);
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      }
    }
  } else {
    console.log('front or back is blank: delete card', fieldsetid, templateid);
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
 * or Easy) to cards with lastinterval between minInterval and maxInterval,
 * during the past window seconds. Short interval cards are ignored because
 * they are just being learned and are expected to have a high failure
 * rate. Long interval cards are ignored because they have been learned and
 * are expected to have a high success rate. It is those that are between
 * the extremes that are indicative of learning effectiveness.
 */
function getPercentCorrect (
  window = config.percentCorrectWindow,
  minInterval = config.matureThreshold,
  maxInterval = config.maxInterval * 0.9
) {
  const result = db.prepare("select avg(case ease when 'again' then 0 else 1 end) as average from (select ease from revlog where lastinterval > ? and lastinterval < ? and id > ?)")
  .get(minInterval, maxInterval, (now() - window) * 1000);
  return ((result && result.average) ? result.average * 100 : 0);
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
    schemaVersion = parseInt(result.value);
  } catch (e) {
    if (e.message === 'no such table: config') {
      initSchema(1);
      schemaVersion = 1;
    } else {
      throw e;
    }
  }
  for (let v = schemaVersion + 1; v <= currentSchemaVersion; v++) {
    initSchema(v);
  }
}

function initSchema (version) {
  const batch = fs.readFileSync(
    path.join(__dirname, '..', 'sql', 'init-schema-v' + version + '.sql'),
    'utf8'
  );
  db.exec(batch);
}

function getDatabaseHandle (opts) {
  return require('better-sqlite3')(opts.database);
}

/**
 * importAnki imports an Anki 2.0 or 2.1 deck package
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
function importAnki (opts, data) {
  const srcdb = require('better-sqlite3')(data['collection.anki21'] ? data['collection.anki21'] : data['collection.anki2']);
  const srccol = srcdb.prepare('select * from col').get();
  const models = JSON.parse(srccol.models);
  db.prepare('begin transaction').run();
  console.log('import models');
  Object.keys(models).forEach(modelId => {
    const model = models[modelId];
    let templateset = getMatchingTemplateset(model);
    if (!templateset) {
      templateset = model.name + ' ' + uuidv4();
      createTemplatesFromModel(templateset, model);
    }
    model.srfTemplateset = templateset;
  });
  const fieldsetGuidToId = {};
  db.prepare('select id, guid from fieldset').all()
  .forEach(record => {
    fieldsetGuidToId[record.guid] = record.id;
  });
  // Import anki21 notes
  console.log('import notes');
  const insertFieldset = db.prepare('insert into fieldset (guid, templateset, fields, ord) values (?,?,?,?)');
  const updateFieldset = db.prepare('update fieldset set templateset = ?, fields = ?, ord = ? where id = ?');
  const notes = {};
  srcdb.prepare('select * from notes').all()
  .forEach((record, index) => {
    notes[record.id] = record;
    const model = models[record.mid];
    const fieldLabels = model.flds.map(field => field.name);
    const fieldValues = record.flds.split(String.fromCharCode(0x1f));
    const fields = {};
    fieldLabels.forEach((label, i) => {
      fields[label] = fieldValues[i];
    });
    if (fieldsetGuidToId[record.guid]) {
      updateFieldset
      .run(model.srfTemplateset, JSON.stringify(fields), index * 10, fieldsetGuidToId[record.guid]);
      record.srfFieldsetid = fieldsetGuidToId[record.guid];
    } else {
      const info = insertFieldset
      .run(record.guid, model.srfTemplateset, JSON.stringify(fields), index * 10);
      record.srfFieldsetid = info.lastInsertRowid;
    }
  });
  // Import anki21 cards
  console.log('import cards');
  const cards = {};
  srcdb.prepare('select * from cards').all()
  .forEach(record => {
    cards[record.id] = record;
    // To make an srf card record we need fieldsetid and templateid
    const note = notes[record.nid];
    const model = models[note.mid];
    const fieldsetid = note.srfFieldsetid;
    const templateid = model.templateByOrd[record.ord].srfTemplateid;

    const fieldset = getFieldset(fieldsetid);
    if (!fieldset) {
      console.log('no fieldset for ', record, ', fieldsetid: ', fieldsetid);
      process.exit(0);
    }

    // Insert new record
    let interval = 0;
    let due = 0;
    let factor = 0;
    let views = record.reps;
    let lapses = record.lapses;
    let ord = fieldset.ord;
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
        fieldsetid,
        templateid,
        now(),
        interval,
        due,
        factor,
        views,
        lapses,
        ord
      );
      record.srfCardid = info.lastInsertRowid;
    } catch (e) {
      if (e.message !== 'UNIQUE constraint failed: card.fieldsetid, card.templateid') {
        throw e;
      } else {
        const cardId = db.prepare('select id from card where fieldsetid = ? and templateid = ?').get(fieldsetid, templateid).id;
        record.srfCardid = cardId;
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
    const card = cards[record.cid];
    const cardId = card.srfCardid;
    if (cardId) {
      const ease = easeMap[record.ease];
      const interval = record.ivl < 0 ? -record.ivl : record.ivl * 60 * 60 * 24;
      const lastinterval = record.lastIvl < 0 ? -record.lastIvl : record.lastIvl * 60 * 60 * 24;
      const factor = record.factor / 1000;
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
 * createTemplatesFromModel creates an srf template record for each
 * template in the model (model.tmpls) and records the srf teamplate ID
 * in the model for reference when importing cards.
 */
function createTemplatesFromModel (templateset, model) {
  model.templateByOrd = {};
  model.tmpls.forEach(ankiTemplate => {
    model.templateByOrd[ankiTemplate.ord] = ankiTemplate;
    const info = db.prepare('insert into template (templateset, name, front, back, css) values (?, ?, ?, ?, ?)')
    .run(
      templateset,
      ankiTemplate.name,
      ankiTemplate.qfmt,
      ankiTemplate.afmt,
      model.css
    );
    ankiTemplate.srfTemplateid = info.lastInsertRowid;
  });
}

/**
 * getMatchingTemplateset returns the templateset name of a matching
 * templateset if there is one. Otherwise, undefined.
 */
function getMatchingTemplateset (model) {
  const keys = {};
  db.prepare('select * from template order by templateset, name')
  .all()
  .forEach(record => {
    // console.log('  record: ' + JSON.stringify(record, null, 2));
    if (!keys[record.templateset]) keys[record.templateset] = '';
    keys[record.templateset] += record.name + record.front + record.back + record.css;
  });
  // console.log('getMatchingTemplateset keys: ', JSON.stringify(keys, null, 2));
  const templatesets = Object.entries(keys).map(([key, value]) => [value, key]);
  // console.log('getMatchingTemplateset templatesets: ', JSON.stringify(templatesets, null, 2));

  let modelKey = '';
  model.tmpls
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach(template => {
    modelKey += template.name + template.qfmt + template.afmt + model.css;
  });
  // console.log('getMatchingTemplateset modelKey: ', JSON.stringify(modelKey, null, 2));
  return templatesets[modelKey];
}

function getFields (fieldsetId) {
  return JSON.parse(db.prepare('select fields from fieldset where id = ?').get(fieldsetId).fields);
}

/**
 * getMustacheTags returns an array of all the tags in the given template.
 *
 */
function getMustacheTags (template) {
  function extractTags (parsed) {
    const tags = new Set();
    parsed.forEach(node => {
      if (node[0] !== 'text') {
        tags.add(node[1]);
        if (node[4]) {
          extractTags(node[4]).forEach(tag => tags.add(tag));
        }
      }
    });
    return [...tags];
  }
  return extractTags(require('mustache').parse(template));
}

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
  let revs =
    db.prepare('select count(distinct cardid) as cards, sum(studytime) as time from revlog where id > ?')
    .get((now() - secPerDay) * 1000);
  if (!revs || !revs.cards) {
    // No reviews in the past day - use the long term average
    revs =
      db.prepare('select count(distinct cardid) as cards, sum(studytime) as time from revlog')
      .get();
  }
  const timePerCard =
    (revs && revs.cards) ? revs.time / revs.cards / 60 : 0.5; // minutes
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

/**
 * getCorrectFactor returns a factor for calculating a new card review
 * interval based on the recent percentage of reviews with ease Hard, Good
 * or Easy.
 *
 * The factor is adjusted according to the deviation of recent percentage
 * of review with ease Hard, Good or Easy from config.percentCorrectTarget.
 *
 * To avoid oscillation, the factor is adjusted slowly. There is a long
 * delay between setting a new interval and reviewing the card. Too much
 * gain in the feedback (i.e. setting this factor) will result in
 * oscillation.
 *
 * config.percentCorrectAdjustmentInterval seconds is the minimum interval
 * between adjustments of the factor.
 */
/*
function getCorrectFactor () {
  return Math.min(
    2.0,
    Math.max(
      0.5,
      1.0 + (getPercentCorrect() - config.percentCorrectTarget) * config.percentCorrectSensitivity
    )
  );
}
*/

const getCorrectFactor = (function () {
  let correctFactor;
  let lastUpdated;
  function update () {
    if (!correctFactor) {
      try {
        const fields = db.prepare('select * from config where name = ?')
        .get('correct factor');
        correctFactor = Number(fields.value);
        lastUpdated = parseInt(fields.modified);
      } catch (e) {
        db.prepare('insert into config (value, name) values (?, ?)')
        .run(
          1.0,
          'correct factor'
        );
        correctFactor = 1.0;
        lastUpdated = now();
      }
    }
    if (
      !lastUpdated ||
      (now() - lastUpdated) > config.correctFactorAdjustmentInterval
    ) {
      const percentCorrect = getPercentCorrect();
      if (percentCorrect) {
        correctFactor +=
          (getPercentCorrect() - config.percentCorrectTarget) *
          config.percentCorrectSensitivity;
      } else {
        correctFactor = 1.0;
      }
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
 * @param {intiger} templateset - the name of the templateset to be used to
 * present this fieldset. This determines the set of cards to be produced.
 *
 * @param {string} fields - the set of field/value pairs, as JSON text.
 */
function createFieldset (guid, templateset, ord, fields) {
  const info = db.prepare('insert into fieldset (guid, templateset, ord, fields) values (?, ?, ?, ?)')
  .run(
    guid,
    templateset,
    ord,
    fields
  );
  const fieldsetid = info.lastInsertRowid;
  createCards(fieldsetid, templateset);
  return (fieldsetid);
}

function close () {
  if (db) {
    db.close();
  }
}

function updateFieldset (fieldsetid, templateset, ord, fields) {
  console.log(fieldsetid, templateset, ord, fields);
  // If the fieldset has changed the old cards are irrelevant - delete them
  const oldFieldset = getFieldset(fieldsetid);
  if (oldFieldset.templateset !== templateset) {
    deleteCardsForFieldset(fieldsetid);
  }
  db.prepare('update fieldset set templateset = ?, fields = ?, ord = ? where id = ?')
  .run(templateset, fields, ord, fieldsetid);
  createCards(fieldsetid, templateset);
}

function deleteCardsForFieldset (fieldsetid) {
  db.prepare('delete from card where fieldsetid = ?').run(fieldsetid);
}

/*
function createCardsForTemplateset (name) {
  db.prepare('begin transaction').run();
  const templates = getTemplates(name);
  const fieldsets = db.prepare('select id from fieldset where templateset = ?')
  .all(name);

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
  db.prepare('delete from card where fieldsetid in (select id from fieldset where templateset = @name) and templateid not in (select id from template where templateset = @name)').run({ name: name });
  db.prepare('commit').run();
}
*/

function createTemplate (templateset, name, front, back, css) {
  db.prepare('begin transaction').run();
  const info = db.prepare('insert into template (templateset, name, front, back, css) values (?, ?, ?, ?, ?)')
  .run(
    templateset,
    name,
    front,
    back,
    css
  );
  console.log('insert info: ', info);
  createCardsForTemplate(info.lastInsertRowid);
  db.prepare('commit').run();
}

function updateTemplate (templateset, name, front, back, css, id) {
  db.prepare('begin transaction').run();
  const oldTemplate = getTemplate(id);
  if (oldTemplate.templateset !== templateset) {
    deleteCardsForTemplate(id); // old fieldsets
  }
  db.prepare('update template set templateset = ?, name = ?, front = ?, back = ?, css = ? where id = ?')
  .run(
    templateset,
    name,
    front,
    back,
    css,
    id
  );
  createCardsForTemplate(id); // new fieldsets
  db.prepare('commit').run();
}

/**
 * Export a factory function that returns an instance of srf.
 *
 * The factory function takes a parameter object as argument.
 *
 * Options:
 *
 *   dir (~/.local/share/srf)
 *     The root directory in which files (database, media, configuration,
 *     etc.) will be found.
 *
 *   database (srf.db)
 *     The srf database file name. This is a sqlite3 database file. The
 *     value may be a full path or a relative path. If it is relative, it
 *     is relative to options.dir.
 *
 *   media (media)
 *     The name of the directory in which media files are stored. The value
 *     may be a full path or a relative path. If it is relative, it is
 *     relative to options.dir.
 *
 *   config (config.json)
 *     The name of the configuration file. The value may be a full path or
 *     a relative path. if it is relative, it is relative to options.dir.
 *
 *   debug (false)
 *     A boolean (true/false) that controls how verbose the library is.
 */
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

  if (opts.debug) {
    console.log('config: ', JSON.stringify(config, null, 2));
  }

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
  deferRelated,
  fixDatabase,
  formatSeconds,
  getAverageStudyTime,
  getAverageStudyTimePerReview,
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
  getCountCardsStage1,
  getCountCardsStage2,
  getCountCardsStage3,
  getCountCardsViewedToday,
  getCountDaysStudied,
  getCountNewCardsPast24Hours,
  getCountNewCardsRemaining,
  getDueCard,
  getEstimatedAverageStudyTime,
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
  getTemplateset,
  getTemplatesets,
  importAnki,
  render,
  reviewCard,
  updateFieldset,
  updateTemplate
};
