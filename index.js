'use strict';

const tc = require('timezonecomplete');

const express = require('express');
// Mustache works for the Anki templates - it allows spaces in the tag keys
// I had first tried Handlebars but it doesn't allow spaces in the tag keys
// Links to sound and images don't work - Anki uses a 'special' syntax
// But, maybe I can write a 'helper'
const Mustache = require('mustache');
Mustache.escape = function (text) {
  let x;
  if (x = text.match(/\[sound:(.*)\]/)) {
    return(
      '<audio id="myaudio" autoplay controls src="' + x[1] + '"></audio></br>'
    );
  }
  return(text);
};
const app = express();
const expressHandlebars = require('express-handlebars');
app.engine('handlebars', expressHandlebars());
app.set('view engine', 'handlebars');
app.use(express.static('media'));

process.on('SIGINT', onExit);
const db = require('better-sqlite3')('srf.db');
function onExit() {
  console.log('closing database connection');
  db.close();
  process.exit();
}

// studyTimeNewCardLimit is the limit on total study time today
// in milliseconds, after which no more new cards will be shown.
const studyTimeNewCardLimit = 1000 * 60 * 60;

// msecPerDay is the number of milliseconds in a day
const msecPerDay = 1000 * 60 * 60 * 24;

// msecPerYear is the number of milliseconds in a year
const msecPerYear = msecPerDay * 365;

// startTime is the time when this execution of the server started.
const startTime = Date.now();


// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime = now;

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay = new Date().setHours(0,0,0,0).valueOf();

// endOfDay is the epoch time of midnight at the end of the current day.
let endOfDay = startOfDay + msecPerDay;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = 0;

// averageTimePerCard is the average time viewing each card in ms.
// Averaged over all cards viewed in the past 10 days.
// Updated when the day rolls over.
let averageTimePerCard = db.prepare('select avg(time) from revlog where id > ?').get(now - 1000 * 60 * 60 * 24 * 10)['avg(time)'] || 30000;
console.log('averageTimePerCard ', averageTimePerCard);

// studyTimeToday is the total time studying cards since midnight.
// Reset when the day rolls over.
let studyTimeToday = db.prepare('select sum(time) from revlog where id >= ?').get(startOfDay)['sum(time)'] || 0;
console.log('studyTimeToday ', studyTimeToday);

// dueCards and newCards are queues of cards to be viewed.
// They are updated when they're empty.
let dueCards = [];
let newCards = [];

// card is the current card. Updated when a new card is shown.
let card;

// Add middleware for common code to every request
function initRequest (req, res, next) {
  req.startTime = new Date();
  now = Date.now();
  const newStartOfDay = new Date().setHours(0,0,0,0).valueOf();
  if (newStartOfDay !== startOfDay) {
    startOfDay = newStartOfDay;
    endOfDay = startOfDay + msecPerDay;
    averageTimePerCard = db.prepare('select avg(time) from revlog where id > ?').get(now - 1000 * 60 * 60 * 24 * 10)['avg(time)'] || 30000;
    studyTimeToday = 0;
  }
  next();
}

app.use(initRequest);

app.get('/', (req, res) => {
  if (!dueCards || !dueCards.length) {
    dueCards = getDueCards();
  }
  card = getNextCard();
  if (card) {
    cardStartTime = now;
    card.note = getNote(card);
    res.render('home', card.note);
  } else {
    const startOfDay = new Date(req.startTime).setHours(0,0,0,0).valueOf();
    const cardsViewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay)['count()'];
    const dueCount = db.prepare('select count() from cards where seen != 0 and due < ?').get(endOfDay)['count()'] || 0;
    const nextDue = db.prepare('select due from cards where seen != 0 order by due limit 1').get()['due'];
    const timeToNextDue = tc.milliseconds(nextDue - now);
    const dueStudyTime = Math.floor(dueCount * averageTimePerCard);
    const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
    const data = {};
    let first;
    let last;
    // The database timestamps are UTC but we want local days so must
    // add the local offset to determine which day a card was reviewed.
    const offset = (new Date().getTimezoneOffset()) * 60 * 1000;
    const viewsPerDay = db.prepare('select cast((id + ?)/(1000*60*60*24) as integer) as day, count() from revlog group by day').all(offset).forEach(el => {
      if (!first) first = el.day-1;
      last = el.day-first;
      data[el.day-first] = el['count()'];
    });
    console.log('viewsPerDay', viewsPerDay);
    console.log('data ', data);
    res.render('done', {
      dueCount: dueCount,
      timeToNextDue: timeToNextDue.toFullString(),
      cardsViewedToday: cardsViewedToday,
      studyTimeToday: tc.milliseconds(studyTimeToday).toFullString(),
      estimatedTotalStudyTime: tc.milliseconds(estimatedTotalStudyTime).toFullString(),
      averageTimePerCard: Math.floor(averageTimePerCard/1000),
      chart1data: JSON.stringify(data)
    });
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
    console.log('again');
    const factor = 2000;
    const now = Date.now();
    const due = now + 60000;
    db.prepare('update cards set factor = ?, seen = ?, due = ? where id = ?')
    .run(factor, now, due, card.id);
    logReview(card, 1, now, factor, due);
  }
  res.redirect('/');
});

app.get('/hard', (req, res) => {
  if (card) {
    console.log('hard');
    const factor = Math.max(1200, card.factor - 50);
    const now = Date.now();
    const seen = card.seen || now;
    const due = now + Math.max(60000, Math.floor((now - seen) * 0.9));
    db.prepare('update cards set factor = ?, seen = ?, due = ? where id = ?')
    .run(factor, now, due, card.id);
    logReview(card, 2, now, factor, due);
  }
  res.redirect('/');
});

app.get('/good', (req, res) => {
  if (card) {
    const factor = Math.min(10000, card.factor + 50);
    const seen = card.seen || now;
    const due = now +
      Math.min(
        msecPerYear,
        Math.max(
          60000,
          Math.floor((now - seen) * factor / 1000)
        )
      );
    db.prepare('update cards set factor = ?, seen = ?, due = ? where id = ?')
    .run(factor, now, due, card.id);
    logReview(card, 3, now, factor, due);
  }
  res.redirect('/');
});

app.get('/easy', (req, res) => {
  if (card) {
    console.log('easy');
    const factor = Math.min(10000, card.factor + 200);
    const now = Date.now();
    const seen = card.seen || now;
    const due = now +
      Math.min(
        msecPerYear,
        Math.max(
          msecPerDay,
          Math.floor((now - seen) * factor / 1000)
        )
      );
    db.prepare('update cards set factor = ?, seen = ?, due = ? where id = ?')
    .run(factor, now, due, card.id);
    logReview(card, 4, now, factor, due);
  }
  res.redirect('/');
});

const server = app.listen(8000, () => {
  let host = server.address().address;
  let port = server.address().port;
  console.log('Listening on http://%s:%s', host, port);
});

function getCreationTime () {
  const row = db.prepare('select * from col limit 1').get();
  console.log('col ', row);
  return (row.crt);
}

function getDueCards () {
  const cards = db.prepare('select * from cards where seen != 0 and due < ? order by due limit 10').all(now);
  return(cards);
}

function getNewCards () {
  const cards = db.prepare('select * from cards where seen = 0 order by due, ord, mod limit 10').all();
  return(cards);
}

function getNote (card) {
  const nid = card.nid;
  const note = db.prepare('select * from notes where id = ?').get(nid);
  const noteTypeID = note.mid;
  const noteType = db.prepare('select * from notetypes where id = ?').get(noteTypeID);
  note.noteType = parseNoteTypeConfig(noteType.config.toString('binary'));
  const fields = db.prepare('select * from fields where ntid = ?').all(noteTypeID);
  const template = db.prepare('select * from templates where ntid = ? and ord = ?').get(noteTypeID, card.ord);
  const str = template.config.toString('binary');
  note.template = parseTemplateConfig(str);

  const tmpFieldValues = note.flds.split(String.fromCharCode(0x1f));

  const fieldData = {};
  fields
  .sort((a, b) => {
    return b.ord - a.ord;
  })
  .forEach(field => {
    fieldData[field.name] = tmpFieldValues[field.ord];
  });

  note.fieldData = fieldData;

  const front = Mustache.render(note.template.front, fieldData);
  fieldData.FrontSide = front;
  const back = Mustache.render(note.template.back, fieldData);
  
  note.front = front;
  note.back = back;

  // res.send(template({who: 'World'}));

  return(note);
}

function parseTemplateConfig (str) {
  let pos = 0;
  if (str.charCodeAt(pos) !== 0x0a) {
    throw new Error('Bad first byte in template config');
  }
  pos = pos + 1;
  let len = 0;
  while (str.charCodeAt(pos) > 0x7f) {
    len = len | ((str.charCodeAt(pos) & 0x7f) << ((pos - 1) * 7));
    pos = pos + 1;
  }
  len = len | ((str.charCodeAt(pos) & 0x7f) << ((pos - 1) * 7));
  pos = pos + 1;
  const front = str.substr(pos, len);

  pos = pos + len;
  if (str.charCodeAt(pos) !== 0x12) {
    throw new Error('Bad start of second field in template config');
  }
  pos = pos + 1;
  len = 0;
  let n = 0;
  while (str.charCodeAt(pos) > 0x7f) {
    len = len | ((str.charCodeAt(pos) & 0x7f) << (n * 7));
    pos = pos + 1;
    n = n + 1;
  }
  len = len | ((str.charCodeAt(pos) & 0x7f) << (n * 7));
  pos = pos + 1;
  const back = str.substr(pos, len);
  return ({
    front: front,
    back: back
  });
}

function getFront (note) {
  return(note.front);
}

function parseNoteTypeConfig (str) {

  const config = {
    kind: 'Standard',
    sortFieldIndex: 0,
    css: ''
  };

  let pos = 0;
  while (true) {
    let fieldCode = str.charCodeAt(pos);
    if (fieldCode === 0x08) {
      // Scan type: 0 - Standard, 1 - Cloze
      // But, 0 will never be present
      if (str.charCodeAt(pos+1) !== 0x01) {
        console.log('Unexpected value for Kind');
      } else {
        config.kind = 'Cloze';
      }
      pos += 2;
    } else if (fieldCode === 0x10) {
      // Assuming the index will not be more than 128
      config.sortFieldIndex = str.charCodeAt(pos+1);
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
      return(config);
    } else if (fieldCode === 0x20) {
      throw new Error('Passed css');
    } else {
      throw new Error('Something else');
    }
  }
}

function logReview (card, ease, now, newFactor, newDue) {
  let elapsed = Math.min(120000, Math.floor(now - cardStartTime));
  studyTimeToday += elapsed;
  const cardsViewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay)['count()'];
  console.log(
    Math.floor(studyTimeToday/1000/60), // study time today (min)
    cardsViewedToday, // cards viewed today
    formatDue(card.due),  // when the card was due
    formatDue(newDue), // the new due date
    Math.floor((now - card.due)/1000/60), // how overdue the card is (min)
    newFactor, // updated interval factor
    elapsed // elapsed time studying this card
  );
  db.prepare('insert into revlog (id, cid, usn, ease, ivl, lastivl, factor, time, type) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(now, card.id, -1, ease, newDue - now, now - card.due,
    newFactor, elapsed, 2);
}

function formatDue (due) {
  const now = Date.now();
  const interval = due - now + 10;
  if (interval < -3600000 * 24) {
    const d = new Date(due);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return([year, month, day].join('-'));
  } else if (interval < -3600000) {
    return('-' + Math.floor(-interval/3600000) + ':' + Math.floor((-interval % 3600000) / 60000));
  } else if (interval < -60000) {
    return('-' + Math.floor(-interval/60000) + ' min');
  } else if (interval < 0) {
    return('-' + Math.floor(-interval/1000) + ' sec');
  } else if (interval < 60000) {
    return(Math.floor(interval/1000) + ' sec');
  } else if (interval < 3600000) {
    return(Math.floor(interval/60000) + ' min');
  } else if (interval < 3600000 * 24) {
    return(Math.floor(interval/3600000) + ':' + Math.floor((interval % 3600000) / 60000));
  } else {
    const d = new Date(due);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return([year, month, day].join('-'));
  }
}

function getNextCard () {
  if (!dueCards || dueCards.length === 0) {
    dueCards = getDueCards();
  }
  const dueTodayCount = db.prepare('select count() from cards where seen != 0 and due < ?').get(endOfDay)['count()'] || 0;
  console.log('dueTodayCount ', dueTodayCount);
  const dueStudyTime = Math.floor(dueTodayCount * averageTimePerCard);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  console.log('Estimated total study time: ',
    tc.milliseconds(estimatedTotalStudyTime).toFullString());
  if (
    estimatedTotalStudyTime < studyTimeNewCardLimit &&
    (lastNewCardTime < now - 60000 || dueCards.length === 0)
  ) {
    if (!newCards || newCards.length === 0) {
      newCards = getNewCards();
    }
    if (newCards && newCards.length > 0) {
      lastNewCardTime = now;
      console.log('new card');
      return(newCards.shift());
    }
  }
  if (dueCards && dueCards.length > 0) {
    return(dueCards.shift());
  }
  return;
}
