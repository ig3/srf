#!/usr/local/bin/node
'use strict';

const tc = require('timezonecomplete');

const express = require('express');
const favicon = require('serve-favicon');
const fs = require('fs');
const path = require('path');

const userDataDir = path.join(process.env.HOME, '.local', 'share');
const databasePath = path.join(userDataDir, 'srf', 'srf.db');
const mediaDir = path.join(userDataDir, 'srf', 'media');
const publicDir = path.join(__dirname, 'public');

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
const app = express();
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
const expressHandlebars = require('express-handlebars');
app.engine('handlebars', expressHandlebars());
app.set('views', __dirname + '/views');
app.set('view engine', 'handlebars');
app.use(express.static(publicDir));
app.use(express.static(mediaDir));
app.use(express.json());

process.on('SIGINT', onExit);
const db = require('better-sqlite3')(databasePath);
function onExit () {
  console.log('closing database connection');
  db.close();
  process.exit();
}

// studyTimeNewCardLimit is the limit on total study time today
// in seconds, after which no more new cards will be shown.
const studyTimeNewCardLimit = 60 * 60;

// secPerDay is the number of seconds in a day
const secPerDay = 60 * 60 * 24;

// secPerYear is the number of seconds in a year
const secPerYear = secPerDay * 365;

// startTime is the time when this execution of the server started.
const startTime = Math.floor(Date.now() / 1000);

// matureThreshold is the interval beyond which a card is considered mature
// Cards with interval less than this are being learned
const matureThreshold = 60 * 60 * 24 * 21;

let timezoneOffset = (new Date().getTimezoneOffset()) * 60;

// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime = now;

console.log(new Date().toString());

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);

// endOfDay is the epoch time of midnight at the end of the current day.
let endOfDay = startOfDay + secPerDay;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = now;

// averageTimePerCard is the average time viewing each card in ms.
// Averaged over all cards viewed in the past 10 days.
// Updated when the day rolls over.
let averageTimePerCard = getAverageTimePerCard();
console.log('averageTimePerCard ', averageTimePerCard);

// studyTimeToday is the total time studying cards since midnight.
// Reset when the day rolls over.
let studyTimeToday = db.prepare('select sum(time) from revlog where id >= ?').get(startOfDay * 1000)['sum(time)'] || 0;
console.log('studyTimeToday ', studyTimeToday);

// The number of cards buried
let buried = '';

// card is the current card. Updated when a new card is shown.
let card;

// Add middleware for common code to every request
function initRequest (req, res, next) {
  now = Math.floor(Date.now() / 1000);
  req.startTime = now;
  const newStartOfDay =
    Math.floor(new Date().setHours(0, 0, 0, 0).valueOf() / 1000);
  if (newStartOfDay !== startOfDay) {
    console.log(new Date().toString());
    startOfDay = newStartOfDay;
    endOfDay = startOfDay + secPerDay;
    averageTimePerCard = getAverageTimePerCard();
    studyTimeToday = 0;
    timezoneOffset = (new Date().getTimezoneOffset()) * 60;
  }
  next();
}

app.use(initRequest);

app.get('/', (req, res) => {
  const viewedToday = getCountCardsViewedToday();
  const dueToday = getCountCardsDueToday();
  const dueStudyTime = getEstimatedStudyTime(dueToday);
  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get().due;
  const dueNow = getCountCardsDueNow();
  const timeToNextDue = tc.seconds(nextDue - now);
  const chart1Data = { x: [], y: [], type: 'bar' };
  db.prepare('select cast((due+?)/(60*60)%24 as integer) as hour, count() from cards where interval != 0 and due > ? and due < ? group by hour').all(timezoneOffset, startOfDay, endOfDay)
  .forEach(el => {
    chart1Data.x.push(el.hour);
    chart1Data.y.push(el['count()']);
  });
  res.render('home', {
    viewedToday: viewedToday,
    studyTimeToday: Math.floor(studyTimeToday/60),
    dueToday: dueToday,
    dueStudyTime: Math.floor(dueStudyTime/60),
    totalToday: viewedToday + dueToday,
    totalStudyTime: Math.floor((studyTimeToday + dueStudyTime)/60),
    dueNow: dueNow,
    timeToNextDue: timeToNextDue.toFullString().substr(0, 9),
    chart1Data: JSON.stringify(chart1Data)
  });
});

app.get('/help', (req, res) => {
  res.render('help');
});

app.get('/stats', (req, res) => {
  // revlog.id is ms timestamp
  const cardsViewedToday = getCountCardsViewedToday();
  const dueCount = getCountCardsDueToday();

  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get().due;

  const timeToNextDue = tc.seconds(nextDue - now);

  const dayNumber = Math.floor((Date.now() - timezoneOffset * 1000) / 1000 / 60 / 60 / 24);

  // Cards studied per day
  let first;
  let points = [];
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
  db.prepare('select cast((due - ?)/(60*60*24) as integer) as day, count() from cards where interval != 0 group by day').all(timezoneOffset).forEach(el => {
    if (!first) first = el.day - 1;
    last = el.day - first;
    points[last] = el['count()'];
  });
  const chart3Data = { x: [], y: [] };
  for (let i = 1; i <= last; i++) {
    chart3Data.x.push(i);
    chart3Data.y.push(points[i] || 0);
  }

  // Cards per interval
  points = [];
  db.prepare('select interval/60/60/24 as days, count() from cards where interval != 0 group by days').all().forEach(el => {
    last = el.days;
    points[el.days] = el['count()'];
  });
  const chart4Data = { x: [], y: [] };
  for (let i = 0; i < last; i++) {
    chart4Data.x.push(i);
    chart4Data.y.push(points[i] || 0);
  }
  const cardsSeen = db.prepare('select count() from cards where interval != 0').get()['count()'] || 0;
  const matureCards = db.prepare('select count() from cards where interval > 364*24*60*60').get()['count()'] || 0;

  // New cards per day
  points = [];
  first = null;
  console.log('timezoneOffset: ', timezoneOffset);
  db.prepare('select cast(((id - ?)/1000/60/60/24) as int) as day, count() from (select * from revlog group by cid) group by day').all(timezoneOffset * 1000).forEach(el => {
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
  db.prepare('select cast((id - ?)/(24*60*60*1000) as int) as day, count(case when ivl >= 60*60*24*364 and lastivl < 60*60*24*364 then 1 else null end) as matured, count(case when ivl < 60*60*24*364 and lastivl > 60*60*24*364 then 1 else null end) as lapsed from revlog group by day').all(timezoneOffset * 1000).forEach(el => {
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
  const chart6Data = [ chart6Trace1, chart6Trace2, chart6Trace3, chart6Trace4 ];

  res.render('stats', {
    dueCount: dueCount,
    timeToNextDue: timeToNextDue.toFullString(),
    cardsViewedToday: cardsViewedToday,
    studyTimeToday: tc.seconds(studyTimeToday).toFullString(),
    estimatedTotalStudyTime: tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
    averageTimePerCard: averageTimePerCard,
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

app.get('/front', (req, res) => {
  card = getNextCard();
  if (card) {
    cardStartTime = now;
    const note = getNote(card.nid);
    note.template = getTemplate(note.mid, card.ord);
    note.front = Mustache.render(note.template.front, note.fieldData);
    note.fieldData.FrontSide = note.front;
    note.back = Mustache.render(note.template.back, note.fieldData);
    card.note = note;
    res.render('front', note);
  } else {
    res.redirect('/');
  }
});

app.get('/back', (req, res) => {
  if (!card) {
    return res.redirect('/');
  }
  res.render('back', card.note);
});

app.get('/again', (req, res) => {
  if (card) {
    const factor = Math.floor(2000 * (1 + 2 * card.interval / secPerYear));
    const due = dueAgain(card);
    updateSeenCard(card, 1, factor, due);
  }
  res.redirect('/front');
});

app.get('/hard', (req, res) => {
  if (card) {
    const factor = Math.max(1200, card.factor - 50);
    const due = dueHard(card);
    updateSeenCard(card, 2, factor, due);
  }
  res.redirect('/front');
});

app.get('/good', (req, res) => {
  if (card) {
    const factor = Math.max(1200, Math.min(10000, card.factor + 50));
    const due = dueGood(card);
    updateSeenCard(card, 3, factor, due);
  }
  res.redirect('/front');
});

app.get('/easy', (req, res) => {
  if (card) {
    const factor = Math.min(10000, card.factor + 200);
    const due = dueEasy(card);
    updateSeenCard(card, 4, factor, due);
  }
  res.redirect('/front');
});

app.get('/notes', (req, res) => {
  const notes = db.prepare('select * from notes').all();
  res.render('notes', {
    notes: notes
  });
});

app.get('/note/:id', (req, res) => {
  const note = getNote(req.params.id);
  res.render('note', {
    note: note
  });
});

app.get('/note', (req, res) => {
  res.render('note', {
    note: {}
  });
});

app.post('/note/:id', (req, res) => {
  console.log('save note ' + req.params.id);
  const note = getNote(req.params.id);
  console.log('note ', note);
  console.log('body ', req.body);
  const flds = note.fields.map(field => req.body[field])
  .join(String.fromCharCode(0x1f));
  console.log('flds ', flds);
  db.prepare('update notes set flds = ? where id = ?')
  .run(flds, req.params.id);
  res.send('ok');
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

/**
 * The card contains scheduling information for a combination of note, note
 * type and template. The data to be studied is in the note. The note type
 * is linked to a set of fields, which determine the data that can be
 * stored in the note, and a set of templates, which define how the note
 * should be presented to the user. For each template, one card is created
 * and independently scheduled.
 *
 * The card is linked to notes by cards.nid.
 *
 * The note is linked to notetypes by notes.mid.
 *
 * The fields are linked to notetypes by fields.ntid.
 *
 * The templates are linked to notetypes by templates.ntid.
 *
 * The primary key of templates is the tuple (ntid, ord). A card is linked
 * to a specific template only indirectly. The card has cards.ord,
 * corresponding to templates.ord, but the note type ID is only available
 * through lookup of the note: notes.mid.
 *
 * The note is linked to notetypes by fk mid
 * A set of fields are linked to notetype by fk ntid
 * A set of templates are linked to notetype by fk ntid
 * The card and template both have ord which determines the template that
 * matches the card.
 */
function getNote (nid) {
  const note = db.prepare('select * from notes where id = ?').get(nid);
  if (!note) {
    console.log('No note ID ', nid);
    return;
  }
  const noteTypeID = note.mid;
  const noteType = db.prepare('select * from notetypes where id = ?').get(noteTypeID);
  if (!noteType) {
    console.log('No notetypes for note ', note.id);
    return;
  }
  note.noteType = parseNoteTypeConfig(noteType.config.toString('binary'));
  note.noteType.id = noteType.id;
  note.noteType.name = noteType.name;
  const fields = db.prepare('select * from fields where ntid = ?').all(noteTypeID);
  if (!fields) {
    console.log('No fields for note ', note.id);
  }

  const tmpFieldValues = note.flds.split(String.fromCharCode(0x1f));

  note.fieldData = {};
  note.fields = [];
  fields
  .sort((a, b) => {
    return a.ord - b.ord;
  })
  .forEach(field => {
    note.fieldData[field.name] = tmpFieldValues[field.ord];
    note.fields.push(field.name);
  });

  return (note);
}

function getTemplate (ntid, ord) {
  // Primary key of templates is (ntid, ord)
  const template = db.prepare('select name, front, back, css from templates where ntid = ? and ord = ?').get(ntid, ord);
  if (!template) {
    console.log('No template for ntid ', ntid, ' ord ', ord);
    return;
  }
  return (template);
}

/**
 * parseNoteTypeConfig parses the config field on a notetypes record.
 *
 * In Anki, the config field is rust/serde serialized object.
 *
 * See importdb.js for more details and to maintain consistency of parsing.
 *
 *
 */
function parseNoteTypeConfig (str) {
  const config = {
    kind: 'Standard',
    sortFieldIndex: 0,
    css: ''
  };

  let pos = 0;
  while (true) {
    const fieldCode = str.charCodeAt(pos);
    if (fieldCode === 0x08) {
      // Scan type: 0 - Standard, 1 - Cloze
      // But, 0 will never be present
      if (str.charCodeAt(pos + 1) !== 0x01) {
        console.log('Unexpected value for Kind');
      } else {
        config.kind = 'Cloze';
      }
      pos += 2;
    } else if (fieldCode === 0x10) {
      // Assuming the index will not be more than 128
      config.sortFieldIndex = str.charCodeAt(pos + 1);
      pos += 2;
    } else if (fieldCode === 0x1a) {
      pos += 1;
      let len = 0;
      let n = 0;
      while (str.charCodeAt(pos) > 0x7f) {
        len = len | ((str.charCodeAt(pos) & 0x7f) << (n * 7));
        pos = pos + 1;
        n = n + 1;
      }
      len = len | ((str.charCodeAt(pos) & 0x7f) << (n * 7));
      pos = pos + 1;
      config.css = str.substr(pos, len);
      return (config);
    } else if (fieldCode === 0x20) {
      throw new Error('Passed css');
    } else {
      throw new Error('Something else');
    }
  }
}

function updateSeenCard (card, ease, factor, due) {
  const interval = due - now;
  const lapsed = interval < matureThreshold && card.interval > matureThreshold;
  const lapses = lapsed ? card.lapses + 1 : card.lapses;
  db.prepare('update cards set mod = ?, factor = ?, interval = ?, due = ?, reps = ?, lapses = ? where id = ?')
  .run(now, factor, interval, due, card.reps + 1, lapses, card.id);
  buryRelated(card);
  logReview(card, ease, factor, due, lapsed, lapses);
}

function logReview (card, ease, factor, due, lapsed, lapses) {
  const elapsed = Math.min(120, Math.floor(now - cardStartTime));
  studyTimeToday += elapsed;
  const cardsViewedToday = getCountCardsViewedToday();
  const dueTodayCount = getCountCardsDueToday();
  const time = new Date().toTimeString().substring(0,5);
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
    buried
  );
  const interval = due - now;
  const lastInterval = card.interval === 0 ? 0 : now - card.due + card.interval;
  // Distinguishing cases
  //  New new card: revlog.lastivl === 0
  //  New / Learning card: lapses === 0
  //  Newly lapsed card: revlog.lastivl > matureThreshold &&
  //    revlog.ivl < matureThreshold
  //  Lapsed / Relearning card: lapses > 0
  //  Mature card: revlog.ivl > matureThreshold
  //
  //  Type:
  //    0 - New / Learning card
  //    1 - Lapsed / Relearing card
  //    2 - Mature card
  //
  //  Note that the type can be derived from base data (ivl, lastivl and
  //  lapses), so it is redundant and perhaps should be eliminated.
  //
  const type = interval > 60 * 60 * 24 * 21 ? 2 : lapses === 0 ? 0 : 1;
  const info = db.prepare('insert into revlog (id, cid, usn, ease, ivl, lastivl, factor, time, type, lapses) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(
    now * 1000, // Time the card was seen
    card.id,
    -1,
    ease,
    interval, // Time until the card is due to be seen again
    lastInterval, // Time since card was last seen
    factor, // Factor for adjusting interval
    elapsed, // Time spent viewing card
    type, // 0 - New; 1 - Lapsed; 2 - Review
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

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    if (hours.lengh < 2) hours = '0' + hours;
    if (minutes.length < 2) minutes = '0' + minutes;
    // return([year, month, day].join('-'));
    return ([year, month, day].join('-') + 'T' + [hours, minutes].join(':'));
  }
}

function getNextCard () {
  const newCardsAllowed = getEstimatedTotalStudyTime() < studyTimeNewCardLimit;
  if (newCardsAllowed && lastNewCardTime < now - 300) {
    const card = getNewCard();
    if (card) {
      lastNewCardTime = now;
      console.log('new card');
      return (card);
    }
  } else {
    const card = getDueCard();
    if (card) {
      return (card);
    } else if (newCardsAllowed) {
      const card = getNewCard();
      console.log('new card');
      return (card);
    }
  }
}

function getNewCard () {
  const card = db.prepare('select * from cards where due < ? and interval = 0 order by new_order limit 1').get(now);
  return (card);
}

function getDueCard () {
  const card = db.prepare('select * from cards where interval != 0 and due < ? order by interval, due limit 1').get(now);
  return (card);
}

function getEstimatedTotalStudyTime () {
  const dueTodayCount = getCountCardsDueToday();
  const dueStudyTime = getEstimatedStudyTime(dueTodayCount);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  // console.log('Estimated total study time: ',
  //  tc.seconds(estimatedTotalStudyTime).toFullString());
  return (estimatedTotalStudyTime);
}

/**
 * For each note there may be several cards. To avoid seeing these related
 * cards too close to each other, if a card later in the order than the
 * current card is due in the next 5 days, push its due date out to 5 days
 * from now.
 */
function buryRelated (card) {
  const info = db.prepare('update cards set mod = ?, due = ? where nid = ? and ord > ? and due < ?')
  .run(
    now, // modification time
    now + secPerDay * 5, // new due
    card.nid, // note ID
    card.ord, // ord or current card
    now + secPerDay * 5 // old due
  );
  buried = info.changes > 0 ? '(' + info.changes + ')' : '';
}

function dueAgain (card) {
  return (now + 10);
}

function dueHard (card) {
  if (!card.interval || card.interval === 0) return (now + 30);
  const timeSinceLastSeen = now - card.due + card.interval;
  let due = now + Math.max(30, Math.floor(timeSinceLastSeen * 0.5));
  if ((due - now) > 60 * 60 * 24 * 5) {
    due = new Date(due * 1000).setHours(0, 0, 0, 0).valueOf() / 1000;
  }
  return (due);
}

function dueGood (card) {
  if (!card.interval || card.interval === 0) return (now + 300);
  const timeSinceLastSeen = now - card.due + card.interval;
  let due = now +
    Math.min(
      secPerYear,
      Math.max(
        60,
        Math.floor(
          timeSinceLastSeen * card.factor / 1000 *
            (5 - Math.random()) / 5
        )
      )
    );
  if ((due - now) > 60 * 60 * 24 * 5) {
    due = new Date(due * 1000).setHours(0, 0, 0, 0).valueOf() / 1000;
  }
  return (due);
}

function dueEasy (card) {
  if (!card.interval || card.interval === 0) return (now + secPerDay);
  const timeSinceLastSeen = now - card.due + card.interval;
  let due = now +
    Math.min(
      secPerYear,
      Math.max(
        secPerDay,
        Math.floor(timeSinceLastSeen * card.factor / 1000)
      )
    );
  if ((due - now) > 60 * 60 * 24 * 5) {
    due = new Date(due * 1000).setHours(0, 0, 0, 0).valueOf() / 1000;
  }
  return (due);
}

/**
 * getAverageTimePerCard returns the average time spent per card over the
 * past 10 days. Note that this is not the average time per view, as some
 * cards are viewed more than once.
 */
function getAverageTimePerCard () {
  const result = db.prepare('select avg(t) from (select sum(time) as t, cast(id/1000/60/60/24 as integer) as d, cid from revlog where id > ? group by d, cid)')
  .get((now - 60 * 60 * 24 * 10) * 1000)['avg(t)'] || 30;
  return (Math.round(result, 0));
}

function getCountCardsDueToday () {
  return (db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0);
}

function getCountCardsDueNow () {
  return (db.prepare('select count() from cards where interval != 0 and due < ?').get(now)['count()'] || 0);
}

function getCountCardsViewedToday () {
  return (db.prepare('select count() from revlog where id >= ?').get(startOfDay * 1000)['count()']);
}

function getEstimatedStudyTime (count) {
  return Math.floor(count * averageTimePerCard);
}
