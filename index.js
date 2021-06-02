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
app.use(express.static('public'));
app.use(express.static('media'));
app.use(express.json());

process.on('SIGINT', onExit);
const db = require('better-sqlite3')('srf.db');
function onExit() {
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

// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime = now;

console.log(new Date().toString());

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay = Math.floor(new Date().setHours(0,0,0,0).valueOf() / 1000);

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
let studyTimeToday = db.prepare('select sum(time) from revlog where id >= ?').get(startOfDay*1000)['sum(time)'] || 0;
console.log('studyTimeToday ', studyTimeToday);

// card is the current card. Updated when a new card is shown.
let card;

// Add middleware for common code to every request
function initRequest (req, res, next) {
  now = Math.floor(Date.now() / 1000);
  req.startTime = now;
  const newStartOfDay =
    Math.floor(new Date().setHours(0,0,0,0).valueOf() / 1000);
  if (newStartOfDay !== startOfDay) {
    console.log(new Date().toString());
    startOfDay = newStartOfDay;
    endOfDay = startOfDay + secPerDay;
    averageTimePerCard = getAverageTimePerCard();
    studyTimeToday = 0;
  }
  next();
}

app.use(initRequest);

app.get('/', (req, res) => {
  const dueNow = getCountCardsDueNow();
  const dueToday = getCountCardsDueToday();
  const viewedToday = getCountCardsViewedToday();
  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get()['due'];
  const timeToNextDue = tc.seconds(nextDue - now);
  const chart1Data = { x: [], y: [], type: 'bar' };
  const offset = (new Date().getTimezoneOffset()) * 60;
  const duePerHour = db.prepare('select cast((due+?)/(60*60)%24 as integer) as hour, count() from cards where interval != 0 and due > ? and due < ? group by hour').all(offset,startOfDay, endOfDay)
  .forEach(el => {
    chart1Data.x.push(el.hour);
    chart1Data.y.push(el['count()']);
  });
  res.render('home', {
    dueNow: dueNow,
    dueToday: dueToday,
    viewedToday: viewedToday,
    timeToNextDue: timeToNextDue.toFullString().substr(0,9),
    estimatedTotalStudyTime: tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
    chart1Data: JSON.stringify(chart1Data),
  });
});

app.get('/help', (req, res) => {
  res.render('help');
});

app.get('/stats', (req, res) => {
  // revlog.id is ms timestamp
  const cardsViewedToday = getCountCardsViewedToday();
  const dueCount = getCountCardsDueToday();

  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get()['due'];

  const timeToNextDue = tc.seconds(nextDue - now);

  // Cards studied per day
  let first;
  let last;
  let points = [];
  // The database timestamps are UTC but we want local days so must
  // add the local offset to determine which day a card was reviewed.
  const offset = (new Date().getTimezoneOffset()) * 60 * 1000;
  db.prepare('select cast((id + ?)/(1000*60*60*24) as integer) as day, count() from revlog group by day').all(offset).forEach(el => {
    if (!first) first = el.day-1;
    points[el.day-first] = el['count()'];
  });
  const chart1Data = { x: [], y: [] };
  last = Math.floor(Date.now()/1000/60/60/24) - first;
  for (let i = 0; i <= last; i++) {
    chart1Data.x.push(i);
    chart1Data.y.push(points[i] || 0);
  }

  // Minutes studied per day
  points = [];
  first = null;
  db.prepare('select cast((id + ?)/(1000*60*60*24) as integer) as day, sum(time) as time from revlog group by day').all(offset).forEach(el => {
    if (!first) first = el.day-1;
    points[el.day-first] = el.time/60;
  });
  const chart2Data = { x: [], y: [] };
  last = Math.floor(Date.now()/1000/60/60/24) - first;
  for (let i = 0; i <= last; i++) {
    chart2Data.x.push(i);
    chart2Data.y.push(points[i] || 0);
  }

  // Cards due per day
  points = [];
  first = null;
  last = null;
  db.prepare('select cast((due + ?)/(60*60*24) as integer) as day, count() from cards where interval != 0 group by day').all(offset/1000).forEach(el => {
    if (!first) first = el.day-1;
    last = el.day-1 - first;
    points[el.day-first] = el['count()'];
  });
  const chart3Data = { x: [], y: [] };
  for (let i = 0; i <= last; i++) {
    chart3Data.x.push(i);
    chart3Data.y.push(points[i] || 0);
  }

  // New cards per day
  points = [];
  first = null;
  db.prepare('select id/1000/60/60/24 as day, count() from (select * from revlog group by cid) group by day').all().forEach(el => {
    if (!first) first = el.day-1;
    points[el.day-first] = el['count()'];
  });
  last = Math.floor(Date.now()/1000/60/60/24) - first;
  const chart4Data = { x: [], y: [] };
  for (let i = 0; i <= last; i++) {
    chart4Data.x.push(i);
    chart4Data.y.push(points[i] || 0);
  }

  res.render('stats', {
    dueCount: dueCount,
    timeToNextDue: timeToNextDue.toFullString(),
    cardsViewedToday: cardsViewedToday,
    studyTimeToday: tc.seconds(studyTimeToday).toFullString(),
    estimatedTotalStudyTime: tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
    averageTimePerCard: averageTimePerCard,
    chart1Data: JSON.stringify(chart1Data),
    chart2Data: JSON.stringify(chart2Data),
    chart3Data: JSON.stringify(chart3Data),
    chart4Data: JSON.stringify(chart4Data)
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

    // logCard(card);
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
    const factor = 2000;
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
  const tmpFieldValues = note.flds.split(String.fromCharCode(0x1f));
  res.render('note', {
    note: note
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

  return(note);
}

function getTemplate (ntid, ord) {
  // Primary key of templates is (ntid, ord)
  const template = db.prepare('select name, front, back, css from templates where ntid = ? and ord = ?').get(ntid, ord);
  if (!template) {
    console.log('No template for ntid ', ntid, ' ord ', ord);
    return;
  }
  return(template);
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

/**
 * Fields:
 * 08: sticky: int: Remember last input when adding flag
 * ??: int: Reverse text direction flag
 * 1a: font_name: string: len text
 * 20: font_size: int: font size
 * fa 0f: other:  string: len text - e.g. {"media":[]}
 *
 * Anki UI has nothing corresponding to 'other'. From
 * rslib/src/notetype/schema11.rs, function other_to_bytes, it appers that
 * the values is JSON text, which is consistent with what I have seen in a
 * few examples.
 *
 * NoteFieldConfig {
 *  sticky
 *  rtl
 *  font_name
 *  font_size
 *  other: vec![]
 * }
 *
 * From rslib/backend.proto:
 *
 * message NoteFieldConfig {
 *  bool sticky = 1;
 *  bool rtl = 2;
 *  string font_name = 3;
 *  uint32 font_size = 4;
 *  bytes other = 255;
 * }
 *
 * I had noticed before that the 'id' byte that starts a field appears to
 * be the field index << 3. 08 >> 3 = 1; 10 >> 3 = 2, 18 >> 3 = 3, etc.
 *
 * fa 0f, interpreted as an integer is 0000 1111 111 1100. Shift this right
 * by 3 and one gets 1111 1111 = 0xff = 255, which is the value for other
 * in the message. This is unlikely to be a coincidence.
 *
 * So, maybe the field marker, generally, is an integer, which can occupy
 * more than one byte.
 *
 * These config parameters all seem to relate to the Anki UI: The font and
 * size for displaying the field value, whether the value should be
 * displayed right to left and whether the editor should clear the field
 * before next input. The only one that's not certain is 'other', which is
 * serialized crap nested within serialized crap. 
 *
 * The elements of config other than 'other' could/should all be plain
 * database fields.
 *
 * But, it seems there is little or no need for them in srf.
 *
 */
function parseFieldsConfig (str) {
  throw new Error('not implemented');
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
  let elapsed = Math.min(120, Math.floor(now - cardStartTime));
  studyTimeToday += elapsed;
  const cardsViewedToday = getCountCardsViewedToday();
  const dueTodayCount = getCountCardsDueToday();
  console.log(
    card.id,
    Math.floor(studyTimeToday/60), // study time today (min)
    cardsViewedToday, // cards viewed today
    dueTodayCount, // cards due today
    tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
    formatDue(card.due - card.interval), // when card was last seen
    formatDue(card.due),  // when the card was due
    formatDue(due), // the new due date
    factor, // updated interval factor
    elapsed, // elapsed time studying this card
    card.ord
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
  const type = interval > 60*60*24*21 ? 2 : lapses === 0 ? 0 : 1;
  const info = db.prepare('insert into revlog (id, cid, usn, ease, ivl, lastivl, factor, time, type, lapses) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(
    now * 1000, // Time the card was seen
    card.id,  
    -1,
    ease,
    interval, // Time until the card is due to be seen again
    lastInterval, // Time since card was last seen
    factor,  // Factor for adjusting interval
    elapsed,  // Time spent viewing card
    type,  // 0 - New; 1 - Lapsed; 2 - Review
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
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return([year, month, day].join('-'));
  } else if (interval < -3600) {
    return('-' + Math.floor(-interval/3600) + ':' + Math.floor((-interval % 3600) / 60));
  } else if (interval < -60) {
    return('-' + Math.floor(-interval/60) + ' min');
  } else if (interval < 0) {
    return('-' + Math.floor(-interval) + ' sec');
  } else if (interval < 60) {
    return(Math.floor(interval) + ' sec');
  } else if (interval < 3600) {
    return(Math.floor(interval/60) + ' min');
  } else if (interval < 3600 * 24) {
    return(Math.floor(interval/3600) + ':' + Math.floor((interval % 3600) / 60));
  } else {
    const d = new Date(due * 1000);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();
    let hours = d.getHours();
    let minutes = d.getMinutes();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    if (hours.lengh < 2) hour = '0' + hours;
    if (minutes.length < 2) minute = '0' + minutes;
    //return([year, month, day].join('-'));
    return([year, month, day].join('-') + 'T' + [hours, minutes].join(':'));
  }
}

function getNextCard () {
  const newCardsAllowed = getEstimatedTotalStudyTime() < studyTimeNewCardLimit;
  if (newCardsAllowed && lastNewCardTime < now - 300) {
    const card = getNewCard();
    if (card) {
      lastNewCardTime = now;
      console.log('new card');
      return(card);
    }
  } else {
    const card = getDueCard();
    if (card) {
      return(card);
    } else if (newCardsAllowed) {
      const card = getNewCard();
      console.log('new card');
      return(card);
    }
  }
}

function getNewCard () {
  const card = db.prepare('select * from cards where due < ? and interval = 0 order by new_order limit 1').get(now);
  return(card);
}

function getDueCard () {
  const card = db.prepare('select * from cards where interval != 0 and due < ? order by interval, due limit 1').get(now);
  return(card);
}

function getEstimatedTotalStudyTime () {
  const dueTodayCount = getCountCardsDueToday();
  const dueStudyTime = Math.floor(dueTodayCount * averageTimePerCard);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  //console.log('Estimated total study time: ',
  //  tc.seconds(estimatedTotalStudyTime).toFullString());
  return(estimatedTotalStudyTime);
}

/**
 * For each note there may be several cards. This sets due for any of these
 * cards that are later in order to be at least a day later. Due is set on
 * unseen cards to ensure they are not selected as a new card too soon
 * after seeing a related card.
 */
function buryRelated (card) {
  // const related = db.prepare('select * from cards where nid = ? and ord > ? and due < ?').all(card.nid, card.ord, now + secPerDay);
  // console.log('related ', related);
  db.prepare('update cards set mod = ?, due = ? where nid = ? and ord > ? and due < ?')
    .run(now, now + secPerDay, card.nid, card.ord, now + secPerDay);
}

function dueAgain (card) {
  return(now + 10);
}

function dueHard (card) {
  if (!card.interval || card.interval === 0) return(now + 30);
  return(now + Math.max(30, Math.floor((now - card.due + card.interval) * 0.5)));
}

function dueGood (card) {
  if (!card.interval || card.interval === 0) return(now + 300);
  return(
    now +
    Math.min(
      secPerYear,
      Math.max(
        60,
        Math.floor(
          (now - card.due + card.interval) * card.factor / 1000
            * (5 - Math.random())/ 5
        )
      )
    )
  );
}

function dueEasy (card) {
  if (!card.interval || card.interval === 0) return(now + secPerDay);
  return(
    now +
    Math.min(
      secPerYear,
      Math.max(
        secPerDay,
        Math.floor((now - card.due + card.interval) * card.factor / 1000)
      )
    )
  );
}

function logCard (card) {
  console.log(
    'interval: ', formatDue(now + card.interval),
    'due: ', formatDue(card.due),
    'again: ', formatDue(dueAgain(card)),
    'hard: ', formatDue(dueHard(card)),
    'good: ', formatDue(dueGood(card)),
    'easy: ', formatDue(dueEasy(card))
  );
}

/**
 * getAverageTimePerCard returns the average time spent per card over the
 * past 10 days. Note that this is not the average time per view, as some
 * cards are viewed more than once.
 */
function getAverageTimePerCard () {
  const result = db.prepare('select avg(t) from (select sum(time) as t, cast(id/1000/60/60/24 as integer) as d, cid from revlog where id > ? group by d, cid)')
    .get((now - 60 * 60 * 24 * 10)*1000)['avg(t)'] || 30;
  return(Math.round(result,0));
}

function getCountCardsDueToday () {
  return(db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0);
}

function getCountCardsDueNow () {
  return(db.prepare('select count() from cards where interval != 0 and due < ?').get(now)['count()'] || 0);
}

function getCountCardsViewedToday () {
  return(db.prepare('select count() from revlog where id >= ?').get(startOfDay*1000)['count()']);
}
