'use strict';

// The srf database schema version
const currentSchemaVersion = 12;

const opts = {};

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const md5 = require('md5');
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
  const lastInterval = getLastInterval(card.id);
  const lapsed =
    interval < config.matureThreshold &&
    lastInterval > config.matureThreshold;
  const lapses = card.lapses + (lapsed ? 1 : 0);
  db.prepare(
    `update card set
      modified = ?,
      factor = ?,
      interval = ?,
      lastinterval = ?,
      due = ?,
      views = ?,
      lapses = ?
     where id = ?`
  )
  .run(
    now(),
    factor,
    interval,
    interval,
    due,
    card.views + 1,
    lapses,
    card.id
  );
  logReview(
    card,
    viewTime,
    studyTime,
    ease,
    factor,
    interval,
    lastInterval,
    lapses
  );
}

function getLastInterval (cardID) {
  const result = db.prepare(
    `select interval
     from revlog
     where cardid = ?
     order by id desc
     limit 1`
  )
  .get(cardID);
  return result ? result.interval : 0;
}

function logReview (
  card,
  viewTime,
  studyTime,
  ease,
  factor,
  interval,
  lastInterval,
  lapses
) {
  const info = db.prepare(
    `insert into revlog (
      id,
      revdate,
      cardid,
      ease,
      interval,
      lastinterval,
      factor,
      viewtime,
      studytime,
      lapses
    ) values (?,?,?,?,?,?,?,?,?,?)`
  )
  .run(
    Date.now(),
    formatLocalDate(new Date()),
    card.id,
    ease,
    interval,
    lastInterval,
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
 *   - Either there is no data for percentCorrect or it is over 70%
 *   - There is a new card available
 *
 * Otherwise a due card is returned, or undefined if there is no due card.
 */
function getNextCard () {
  const nextDueCard = getDueCard();
  const nextNewCard = getNewCard();
  const percentCorrect = getPercentCorrect() || 100;
  if (
    getCountCardsOverdue() === 0 &&
    getAverageStudyTime(1) < config.studyTimeLimit &&
    getAverageStudyTime(14) < config.studyTimeLimit * 1.1 &&
    getCountNewCardsPast24Hours() < config.newCardLimit &&
    getEstimatedAverageStudyTime(1) < config.studyTimeLimit &&
    getEstimatedAverageStudyTime(5) < config.studyTimeLimit * 1.1 &&
    percentCorrect > config.newCardMinPercentCorrect &&
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
  const card = db.prepare(
    `select *
     from card
     where
       interval != 0
     order by due
     limit 1`
  ).get();
  if (card) {
    return (card.due);
  } else {
    return (0);
  }
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

function getTimeSinceLastReview (card) {
  const timeLastSeen = getTimeCardLastSeen(card.id);
  return timeLastSeen ? now() - timeLastSeen : 0;
}

function intervalAgain (card) {
  return (
    Math.max(
      1,
      Math.floor(
        Math.min(
          config.againMaxInterval,
          card.interval * config.againFactor
        )
      )
    )
  );
}

function intervalHard (card) {
  return (
    Math.max(
      1,
      Math.floor(
        Math.min(
          config.hardMaxInterval,
          card.interval * config.hardFactor
        )
      )
    )
  );
}

function intervalGood (card) {
  const interval = card.interval < config.learningThreshold
    ? card.interval
    : (card.interval + getTimeSinceLastReview(card)) / 2;
  return (
    Math.floor(
      Math.min(
        config.maxInterval,
        config.maxGoodInterval,
        Math.max(
          config.goodMinInterval,
          interval * config.goodMinFactor,
          (
            interval *
            config.goodFactor *
            newCardFactor(card, 'good')
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

function getCountCardsStage0 () {
  return (
    db.prepare('select count() from card where interval = 0')
    .get()['count()'] || 0
  );
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
    db.prepare('select count() from card where interval >= ? and interval < ?')
    .get(config.matureThreshold, config.maxInterval)['count()'] || 0
  );
}

function getCountCardsStage4 () {
  return (
    db.prepare('select count() from card where interval = ?')
    .get(config.maxInterval)['count()'] || 0
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
 * conf.newCardLimit and the number of new cards seen in the past 24 hours.
 */
function getCountNewCardsRemaining () {
  return config.newCardLimit - getCountNewCardsPast24Hours();
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
      percentCorrectWindow: '1 month',

      // The minimum number of mature cards in the percent correct window
      // at which percent correct is calculated.
      minPercentCorrectCount: 10,

      // The target for percent correct reviews
      percentCorrectTarget: 90,
      percentCorrectSensitivity: 0.0001,

      // The interval (seconds) between correct factor adjustments
      correctFactorAdjustmentInterval: '1 day',

      // The factor used to add dispersion to the due time.
      // As percentage of the total interval.
      dispersionFactor: 5,

      // The maximum number of new cards in 24 hours.
      newCardLimit: 20,

      // The minimum percentCorrect for viewing new cards
      newCardMinPercentCorrect: 75,

      // Study time (seconds) per day beyond which no new cards
      studyTimeLimit: '1 hour',

      // minimum intervals according to responses to reviews
      againMaxInterval: '1 day',
      hardMaxInterval: '1 week',
      goodMinInterval: '60 seconds',
      goodMinFactor: 1.1,
      easyMinInterval: '1 days',

      againFactor: 0.5,
      hardFactor: 0.8,
      goodFactor: 1.0,
      easyFactor: 1.5,

      // Parameters for calculating exponentially weighted moving average
      // of review replies
      weightAgain: 0,
      weightHard: 1,
      weightGood: 1.5,
      weightEasy: 2,
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
  const templates = getTemplates(templateset);

  templates.forEach(template => {
    createCard(fieldsetid, template.id);
  });
}

/**
 * createCardsForTemplate creates all cards for the given template.
 */
function createCardsForTemplate (templateid) {
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
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, lastinterval, due, factor, views, lapses, ord) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        fieldsetid,
        templateid,
        now(),
        0,
        0,
        0,
        2,
        0,
        0,
        fieldset.ord
      );
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
  on = now(),
  window = config.percentCorrectWindow,
  minInterval = config.matureThreshold,
  maxInterval = config.maxInterval
) {
  const result = db.prepare(
    `select
      count() as count,
      avg(
        case ease
        when 'again' then 0
        else 1
        end
      ) as average
     from revlog
     where
      lastinterval > @minInterval and
      lastinterval < @maxInterval and
       id > @from and
       id < @to
    `
  )
  .get({
    minInterval: minInterval,
    maxInterval: maxInterval,
    from: (on - window) * 1000,
    to: on * 1000
  });
  return (
    (result && result.count > config.minPercentCorrectCount)
      ? result.average * 100
      : 0
  );
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
  const p = path.join(__dirname, '..', 'sql', 'init-schema-v' + version + '.sql');
  const batch = fs.readFileSync(p, 'utf8');
  try {
    db.exec(batch);
  } catch (err) {
    console.log('init ' + p + ' failed with: ', err);
    console.log('batch: ' + batch);
    throw err;
  }
}

function getDatabaseHandle (opts) {
  return require('better-sqlite3')(opts.database);
}

/**
 * importFile returns a promise that resolves after the given file has been
 * imported.
 *
 * Several file types are supported.
 *  - Anki .apkg files from Anki 2.0 or 2.1
 *  - Anki .colpkg files from Anki 2.0 or 2.1
 */
function importFile (opts, file) {
  console.log('import: ' + file);
  if (
    file.toLowerCase().endsWith('.apkg') ||
    file.toLowerCase().endsWith('.colpkg')
  ) {
    return importAnki(opts, file);
  } else if (
    file.toLowerCase().endsWith('.csv')
  ) {
    return importCSV(opts, file);
  } else {
    return Promise.reject(new Error('Unsupported file type: ' + file));
  }
}

/**
 * importCSV returns a promise that resolves after importing a CSV file
 *
 * Supported content are:
 *  - templates
 *  - fieldsets
 */
function importCSV (opts, file) {
  const { parse } = require('csv-parse/sync');
  return Promise.resolve()
  .then(() => {
    const csvData = fs.readFileSync(file);
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });
    if (records.length < 1) {
      throw new Error(file + ': no data');
    }
    if (
      records[0].templateset !== undefined &&
      records[0].name !== undefined &&
      records[0].front !== undefined &&
      records[0].back !== undefined &&
      records[0].css !== undefined
    ) {
      importCSVTemplates(opts, records);
    } else if (
      records[0].templateset !== undefined &&
      records[0].fields !== undefined
    ) {
      importCSVFieldsets(opts, records);
    } else {
      throw new Error(file + ': unsupported content');
    }
  });
}

/**
 * importCSVFieldsets returns a promise that resolves after importing
 * fieldsets from the given CSV records.
 *
 * records is an array of records from the CSV file. Each record is one
 * fieldset.
 *
 * Fields are:
 *  - guid - optional - guid uniquely identifying the fieldset
 *  - templateset - the name of the templateset for rendering the fieldset
 *  - fields - the field values as JSON serialization
 *  - ord - optional - ordinal for sorting fieldsets
 */
function importCSVFieldsets (opts, records) {
  db.prepare('begin transaction').run();
  records.forEach((record, index) => {
    const info = db.prepare('insert into fieldset (guid, templateset, fields, ord) values (?,?,?,?)')
    .run(
      record.guid || md5(record.templateset + record.fields),
      record.templateset,
      record.fields,
      record.ord || index * 10
    );
    createCards(info.lastInsertRowid, record.templateset);
  });
  db.prepare('commit').run();
}

/**
 * importCSVTemplates returns a promise that resolves after importing
 * templates from the given CSV records.
 *
 * records is an array of records from the CSV file. Each record is one
 * template.
 *
 * Fields are:
 *  - templateset - the name of the templateset the template belongs to
 *  - name - the name of the template itself
 *  - front - the template for the front of the card
 *  - back - the template for the back of the card
 *  - css - the css for the card (front and back)
 */
function importCSVTemplates (opts, records) {
  db.prepare('begin transaction').run();
  records.forEach((record, index) => {
    ['templateset', 'name', 'front', 'back', 'css']
    .forEach(field => {
      if (!record[field]) {
        throw new Error('record ' + index + ': missing ' + field);
      }
    });
    const info = db.prepare('insert into template (templateset, name, front, back, css) values (?, ?, ?, ?, ?)')
    .run(
      record.templateset,
      record.name,
      record.front,
      record.back,
      record.css
    );
    createCardsForTemplate(info.lastInsertRowid);
  });
  db.prepare('commit').run();
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
function importAnki (opts, file) {
  // Anki .apkg files are zip files. Unzip and check the contents.
  return unzip(file)
  .then(data => {
    if (
      data['collection.anki2'] ||
      data['collection.anki21']
    ) {
      importApkg(opts, data);
    } else {
      throw new Error(file + ': not a support Anki .apkg file - it contains neither collection.anki2 nor collection.anki21');
    }
  });
}

function importApkg (opts, data) {
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
    const factor = 2; // Factor can't be mapped and processing revlog is too expensive
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
    } else if (record.type === 3) {
      // relearn card
      due = record.due;
      interval = 60;
    } else {
      console.log('unknown card type for ', record);
      throw new Error('unknown card type ' + record.type);
    }
    try {
      const info = db.prepare('insert into card (fieldsetid, templateid, modified, interval, lastinterval, due, factor, views, lapses, ord) values (?, ?,?,?,?,?,?,?,?,?)')
      .run(
        fieldsetid,
        templateid,
        now(),
        interval,
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
  const insertRevlog = db.prepare(
    `insert into revlog (
      id,
      revdate,
      cardid,
      ease,
      interval,
      lastinterval,
      factor,
      viewtime,
      studytime,
      lapses
    ) values (?,?,?,?,?,?,?,?,?,?)`
  );
  const easeMap = {
    1: 'again',
    2: 'hard',
    3: 'good',
    4: 'easy'
  };
  let addedRevlogRecords = false;
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
        .run(
          record.id,
          formatLocalDate(new Date(record.id)),
          cardId,
          ease,
          interval,
          lastinterval,
          factor,
          time,
          time,
          0
        );
        addedRevlogRecords = true;
      } catch (err) {
        console.log('Failed to create revlog for record: ', record);
        db.prepare('commit').run();
        throw err;
      }
    } else {
      console.warn('Revlog ignored - no card found for card ID: ', record.cid);
    }
  });
  if (addedRevlogRecords) {
    // Delete all records from dailystats, forcing the stats to be
    // recalculated, including any new revlog records.
    db.prepare('delete from dailystats').run();
    updateDailyStats();
  }
  db.prepare('commit').run();
  // save media
  console.log('save media');
  const media = JSON.parse(data.media);
  Object.keys(media).forEach(key => {
    fs.writeFileSync(path.join(opts.media, media[key]), data[key]);
  });
}

/**
 * unzip returns a promise that resolves to an object containing the
 * contents of the zip file. This will only work for files small enough to
 * fit in memory. But most Anki apkg files are not very large.
 */
function unzip (file) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl');
    yauzl.open(file, { lazyEntries: true }, (err, zipFile) => {
      if (err) return reject(err);

      const data = {};

      zipFile.on('close', () => {
        resolve(data);
      });

      zipFile.readEntry();
      zipFile.on('entry', entry => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
        } else {
          zipFile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            const chunks = [];
            readStream.on('data', chunk => {
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
  const chart = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Adjusted Interval'
  };
  for (let i = 0; i <= last; i++) {
    chart.x.push(i);
    chart.y.push(points[i] || 0);
  }
  return (chart);
}

function getChartCardsPerLastInterval () {
  // Cards per interval
  const points = [];
  let last;
  db.prepare('select lastinterval/60/60/24 as days, count() from card where interval != 0 group by days').all().forEach(el => {
    last = el.days;
    points[el.days] = el['count()'];
  });
  // Eventually, most cards will have maximum interval. This isn't
  // interesting for the chart and will swamp the cards in progress,
  // so remove the last element if it is at max interval.
  if (last === Math.floor(config.maxInterval / 60 / 60 / 24)) {
    last--;
  }
  const chart = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Unadjusted Interval'
  };
  for (let i = 0; i <= last; i++) {
    chart.x.push(i);
    chart.y.push(points[i] || 0);
  }
  return (chart);
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

/**
 * getChartsDailyStats returns a set of chart data from the dailystats table
 */
function getChartsDailyStats () {
  updateDailyStats();
  const chartCardViewsPerDay = { x: [], y: [] };
  const chartMinutesStudiedPerDay = { x: [], y: [] };
  const chartNewCardsPerDay = { x: [], y: [] };
  const chartPercentCorrect = { x: [], y: [] };
  const chartMatureTrace1 = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Net'
  };
  const chartMatureTrace2 = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Lapsed'
  };
  const chartMatureTrace3 = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Matured'
  };
  const chartMatureTrace4 = {
    x: [],
    y: [],
    mode: 'lines',
    name: 'Cumulative',
    yaxis: 'y2',
    line: {
      color: 'rgb(0, 0, 0)'
    }
  };
  db.prepare(
    `select
      date,
      cardviews,
      studyminutes,
      newcards,
      matured,
      lapsed,
      mature,
      percentcorrect
     from dailystats`
  )
  .all()
  .forEach(row => {
    chartCardViewsPerDay.x.push(row.date);
    chartCardViewsPerDay.y.push(row.cardviews || 0);
    chartMinutesStudiedPerDay.x.push(row.date);
    chartMinutesStudiedPerDay.y.push(row.studyminutes || 0);
    chartNewCardsPerDay.x.push(row.date);
    chartNewCardsPerDay.y.push(row.newcards || 0);
    chartPercentCorrect.x.push(row.date);
    chartPercentCorrect.y.push(row.percentcorrect || 0);
    chartMatureTrace1.x.push(row.date);
    chartMatureTrace1.y.push(row.matured - row.lapsed);
    chartMatureTrace2.x.push(row.date);
    chartMatureTrace2.y.push(row.lapsed);
    chartMatureTrace3.x.push(row.date);
    chartMatureTrace3.y.push(row.matured);
    chartMatureTrace4.x.push(row.date);
    chartMatureTrace4.y.push(row.mature);
  });

  return ({
    chartCardViewsPerDay: chartCardViewsPerDay,
    chartMinutesStudiedPerDay: chartMinutesStudiedPerDay,
    chartNewCardsPerDay: chartNewCardsPerDay,
    chartPercentCorrect: chartPercentCorrect,
    chartMatureTrace1: chartMatureTrace1,
    chartMatureTrace2: chartMatureTrace2,
    chartMatureTrace3: chartMatureTrace3,
    chartMatureTrace4: chartMatureTrace4
  });
}

function updateDailyStats () {
  const dateLastUpdate = (() => {
    return (
      db.prepare('select max(date) as date from dailystats')
      .get().date ||
      db.prepare('select min(revdate) as date from revlog')
      .get().date
    );
  })();
  if (!dateLastUpdate) return;

  let matureCount = (() => {
    const dateBeforeLastUpdate = (() => {
      return (
        db.prepare('select max(date) as date from dailystats where date < ?')
        .get(dateLastUpdate).date
      );
    })();
    return (
      dateBeforeLastUpdate
        ? db.prepare('select mature from dailystats where date = ?')
        .get(dateBeforeLastUpdate).mature || 0
        : 0
    );
  })();

  const data = {};

  db.prepare(
    `select
      revdate,
      count() as cardviews,
      sum(studytime)/60 as studyminutes,
      count(
        case when interval >= @threshold and lastinterval < @threshold then 1
        else null
        end
      ) as matured,
      count(
        case when interval < @threshold and lastinterval >= @threshold then 1
        else null
        end
      ) as lapsed,
     count(
       case when lastinterval = 0 then 1
       else null
       end
     ) as newcards
     from revlog
     where revdate >= @limit
     group by revdate`
  )
  .all({
    limit: dateLastUpdate,
    threshold: config.matureThreshold
  })
  .forEach(row => {
    if (!data[row.revdate]) data[row.revdate] = {};
    data[row.revdate].cardviews = row.cardviews;
    data[row.revdate].studyminutes = row.studyminutes;
    data[row.revdate].matured = row.matured;
    data[row.revdate].lapsed = row.lapsed;
    data[row.revdate].newcards = row.newcards;
  });

  const dateToday = formatLocalDate(new Date());
  const d = new Date(dateLastUpdate);
  while (1) {
    const date = formatLocalDate(d);
    if (!data[date]) data[date] = {};
    matureCount += (data[date].matured || 0) - (data[date].lapsed || 0);
    const percentCorrect = getPercentCorrect(
      Math.floor(new Date(date).getTime() / 1000)
    ).toFixed(2);
    db.prepare(
      `insert into dailystats (
        date,
        cardviews,
        studyminutes,
        newcards,
        matured,
        lapsed,
        mature,
        percentcorrect
      ) values (
        @date,
        @cardviews,
        @studyminutes,
        @newcards,
        @matured,
        @lapsed,
        @mature,
        @percentCorrect
      )
      on conflict(date) do
        update set
          cardviews = @cardviews,
          studyminutes = @studyminutes,
          newcards = @newcards,
          matured = @matured,
          lapsed = @lapsed,
          mature = @mature,
          percentcorrect = @percentCorrect
        where
          date = @date`
    )
    .run({
      date: date,
      cardviews: data[date].cardviews || 0,
      studyminutes: data[date].studyminutes || 0,
      newcards: data[date].newcards || 0,
      matured: data[date].matured || 0,
      lapsed: data[date].lapsed || 0,
      mature: matureCount,
      percentCorrect: percentCorrect
    });
    if (date >= dateToday) break;
    d.setDate(d.getDate() + 1);
  }
}

/**
 * formatLocalDate returns a string of the form YYYY-MM-DD for the given date
 * in local timezone.
 */
function formatLocalDate (date) {
  const format = (n) => (n < 10 ? '0' : '') + n;
  return date.getFullYear() +
    '-' + format(date.getMonth() + 1) +
    '-' + format(date.getDate());
}

function reviewCard (card, viewTime, studyTime, ease) {
  if (viewTime > config.maxViewTime) {
    studyTime = viewTime = 120;
    ease = 'again';
  }
  viewTime = Math.floor(viewTime);
  const newInterval = Math.max(1, getNewInterval(card, ease));
  updateSeenCard(card, viewTime, studyTime, ease, newInterval);
  deferRelated(card, config.minTimeBetweenRelatedCards);
  if (card.interval > config.learningThreshold) {
    adjustCards();
  }
}

/**
 * adjustCards adjusts interval and due of cards according to
 * the difference between percent correct and percent correct target.
 *
 * Only adjust the cards if we have a percent correct measure, which we
 * only get if there are at least 10 cards at interval greater than
 * config.matureThreshold.
 */
function adjustCards () {
  const percentCorrect = getPercentCorrect();
  if (percentCorrect) {
    const error = getPercentCorrect() - config.percentCorrectTarget;
    if (Math.abs(error) > 1) {
      const adjustment = Math.max(
        -0.5,
        error * config.percentCorrectSensitivity
      );
      db.prepare('update card set interval = floor(interval + interval * @adjustment), due = floor(due + interval * @adjustment) where due > @now and interval > @minInterval and interval < @maxInterval')
      .run({
        adjustment: adjustment,
        minInterval: config.learningThreshold,
        maxInterval: config.maxInterval,
        now: now()
      });
    }
  }
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

/*
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
        correctFactor = Math.max(
          1 / config.weightEasy,
          correctFactor + config.percentCorrectSensitivity *
            (percentCorrect - config.percentCorrectTarget)
        );
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
*/

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

/**
 * fixCards adds missing cards and deletes cards for which there is not
 * both a fieldset and a template.
 */
function fixCards () {
  // Create missing cards
  console.log('Create missing cards');
  const fieldsets = db.prepare('select id, templateset from fieldset').all();
  fieldsets.forEach(fieldset => {
    createCards(fieldset.id, fieldset.templateset);
  });

  // Delete orphaned cards
  console.log('Delete orphaned cards');
  db.prepare('delete from card where fieldsetid not in (select id from fieldset) or templateid not in (select id from template)').run();
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

  db = getDatabaseHandle(opts);
  prepareDatabase();

  return instance;
};

function now () {
  return (Math.floor(Date.now() / 1000));
}

function fixDatabase () {
  db.prepare('begin transaction').run();
  fixCards();
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
  db.prepare('select revlog.id, revlog.cardid, revlog.interval as revloginterval, card.lastinterval as cardinterval from revlog join card on card.id = revlog.cardid where revlog.id in (select max(id) from revlog group by cardid) and revlog.interval <> card.lastinterval order by revlog.id')
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
  backupDatabase,
  close,
  createFieldset,
  createTemplate,
  deferRelated,
  fixDatabase,
  formatSeconds,
  getAverageStudyTime,
  getAverageStudyTimePerReview,
  getCard,
  getChartCardsDuePerDay,
  getChartCardsPerInterval,
  getChartCardsPerLastInterval,
  getChartDuePerHour,
  getChartsDailyStats,
  getChartStudyTime,
  getChartStudyTimePerHour,
  getConfig,
  getCountCardsDueNow,
  getCountCardsDueToday,
  getCountCardsOverdue,
  getCountCardsSeen,
  getCountCardsStage0,
  getCountCardsStage1,
  getCountCardsStage2,
  getCountCardsStage3,
  getCountCardsStage4,
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
  importFile,
  importAnki,
  render,
  reviewCard,
  updateFieldset,
  updateTemplate
};
