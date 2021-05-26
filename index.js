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
// in seconds, after which no more new cards will be shown.
const studyTimeNewCardLimit = 60 * 60;

// secPerDay is the number of seconds in a day
const secPerDay = 60 * 60 * 24;

// secPerYear is the number of seconds in a year
const secPerYear = secPerDay * 365;

// startTime is the time when this execution of the server started.
const startTime = Math.floor(Date.now() / 1000);


// now is the current time, updated on receipt of each request
let now = startTime;

// cardStartTime is the time when the current card was shown.
// It is updated each time a card is shown.
let cardStartTime = now;

// startOfDay is the epoch time of midnight as the start of the current day.
let startOfDay = Math.floor(new Date().setHours(0,0,0,0).valueOf() / 1000);

// endOfDay is the epoch time of midnight at the end of the current day.
let endOfDay = startOfDay + secPerDay;

// lastNewCardTime is the time the last new card was shown.
let lastNewCardTime = now;

// averageTimePerCard is the average time viewing each card in ms.
// Averaged over all cards viewed in the past 10 days.
// Updated when the day rolls over.
let averageTimePerCard = Math.floor(db.prepare('select avg(time) from revlog where id > ?').get((now - 60 * 60 * 24 * 10)*1000)['avg(time)']) || 30;
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
    startOfDay = newStartOfDay;
    endOfDay = startOfDay + secPerDay;
    averageTimePerCard = Math.floor(db.prepare('select avg(time) from revlog where id > ?').get((now - 60 * 60 * 24 * 10)*1000)['avg(time)']) || 30;
    studyTimeToday = 0;
  }
  next();
}

app.use(initRequest);

app.get('/', (req, res) => {
  const dueNow = db.prepare('select count() from cards where interval != 0 and due < ?').get(now)['count()'] || 0;
  console.log('dueNow ', dueNow);
  console.log('endOfDay ', endOfDay);
  const dueToday = db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0;
  console.log('dueToday ', dueToday);
  const viewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay*1000)['count()'];
  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get()['due'];
  const timeToNextDue = tc.seconds(nextDue - now);
  const chart1Data = { x: [], y: [], type: 'bar' };
  const offset = (new Date().getTimezoneOffset()) * 60;
  const duePerHour = db.prepare('select cast((due+?)/(60*60)%24 as integer) as hour, count() from cards where interval != 0 and due > ? and due < ? group by hour').all(offset,startOfDay, endOfDay)
  .forEach(el => {
    console.log('el ', el);
    chart1Data.x.push(el.hour);
    chart1Data.y.push(el['count()']);
  });
  console.log('duePerHour ', duePerHour);
  console.log('chart1Data ', chart1Data);
  res.render('home', {
    dueNow: dueNow,
    dueToday: dueToday,
    viewedToday: viewedToday,
    timeToNextDue: timeToNextDue.toFullString().substr(0,9),
    chart1Data: JSON.stringify(chart1Data),
  });
});

app.get('/help', (req, res) => {
  res.render('help');
});

app.get('/stats', (req, res) => {
  const startOfDay =
    Math.floor(new Date(req.startTime).setHours(0,0,0,0).valueOf() / 1000);
  const cardsViewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay*1000)['count()'];
  const dueCount = db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0;
  const nextDue = db.prepare('select due from cards where interval != 0 order by due limit 1').get()['due'];
  const timeToNextDue = tc.seconds(nextDue - now);
  const dueStudyTime = Math.floor(dueCount * averageTimePerCard);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  const chart1Data = { x: [], y: [] };
  let first;
  let last;
  // The database timestamps are UTC but we want local days so must
  // add the local offset to determine which day a card was reviewed.
  const offset = (new Date().getTimezoneOffset()) * 60 * 1000;
  const viewsPerDay = db.prepare('select cast((id + ?)/(60*60*24) as integer) as day, count() from revlog group by day').all(offset).forEach(el => {
    if (!first) first = el.day-1;
    chart1Data.x.push(el.day-first);
    chart1Data.y.push(el['count()']);
  });

  const chart2Data = { x: [], y: [] };
  db.prepare('select cast((id + ?)/(60*60*24) as integer) as day, sum(time) as time from revlog group by day').all(offset).forEach(el => {
    chart2Data.x.push(el.day-first);
    chart2Data.y.push(el.time/60);
  });
  res.render('stats', {
    dueCount: dueCount,
    timeToNextDue: timeToNextDue.toFullString(),
    cardsViewedToday: cardsViewedToday,
    studyTimeToday: tc.seconds(studyTimeToday).toFullString(),
    estimatedTotalStudyTime: tc.seconds(estimatedTotalStudyTime).toFullString(),
    averageTimePerCard: Math.floor(averageTimePerCard),
    chart1Data: JSON.stringify(chart1Data),
    chart2Data: JSON.stringify(chart2Data),
  });
});

app.get('/front', (req, res) => {
  card = getNextCard();
  if (card) {
    cardStartTime = now;
    card.note = getNote(card);
    // logCard(card);
    res.render('front', card.note);
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
function getNote (card) {
  const nid = card.nid;
  const note = db.prepare('select * from notes where id = ?').get(nid);
  if (!note) {
    console.log('No note for card ', card.id);
    return;
  }
  const noteTypeID = note.mid;
  const noteType = db.prepare('select * from notetypes where id = ?').get(noteTypeID);
  if (!noteType) {
    console.log('No notetypes for note ', note.id);
    return;
  }
  note.noteType = parseNoteTypeConfig(noteType.config.toString('binary'));
  const fields = db.prepare('select * from fields where ntid = ?').all(noteTypeID);
  if (!fields) {
    console.log('No fields for note ', note.id);
  }

  // Primary key of templates is (ntid, ord)
  note.template = db.prepare('select name, front, back, css from templates where ntid = ? and ord = ?').get(noteTypeID, card.ord);
  if (!note.template) {
    console.log('No template for note ', note.id);
    return;
  }

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
    db.prepare('update cards set factor = ?, interval = ?, due = ? where id = ?')
    .run(factor, (due - now), due, card.id);
    buryRelated(card);
    logReview(card, ease, factor, due);
}

function logReview (card, ease, newFactor, newDue) {
  let elapsed = Math.min(120, Math.floor(now - cardStartTime));
  studyTimeToday += elapsed;
  const cardsViewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay*1000)['count()'];
  const dueTodayCount = db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0;
  console.log(
    Math.floor(studyTimeToday/60), // study time today (min)
    cardsViewedToday, // cards viewed today
    dueTodayCount, // cards due today
    tc.seconds(getEstimatedTotalStudyTime()).toFullString(),
    formatDue(card.due - card.interval), // when card was last seen
    formatDue(card.due),  // when the card was due
    formatDue(newDue), // the new due date
    newFactor, // updated interval factor
    elapsed // elapsed time studying this card
  );
  db.prepare('insert into revlog (id, cid, usn, ease, ivl, lastivl, factor, time, type) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(Date.now(), card.id, -1, ease, newDue - now, now - card.due,
    newFactor, elapsed, 2);
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
  const dueTodayCount = db.prepare('select count() from cards where interval != 0 and due < ?').get(endOfDay)['count()'] || 0;
  const dueStudyTime = Math.floor(dueTodayCount * averageTimePerCard);
  const estimatedTotalStudyTime = studyTimeToday + dueStudyTime;
  //console.log('Estimated total study time: ',
  //  tc.seconds(estimatedTotalStudyTime).toFullString());
  return(estimatedTotalStudyTime);
}

/**
 * For each note there may be several cards. This sets due for any of these
 * cards that are later in order to be at least a day later.
 */
function buryRelated (card) {
  db.prepare('update cards set due = ? where nid = ? and ord > ? and due < ?')
    .run(now + secPerDay, card.nid, card.ord, now + secPerDay);
}

function dueAgain (card) {
  return(now + 10);
}

function dueHard (card) {
  if (!card.interval || card.interval === 0) return(30);
  return(now + Math.max(30, Math.floor((now - card.due + card.interval) * 0.9)));
}

function dueGood (card) {
  if (!card.interval || card.interval === 0) return(600);
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
  if (!card.interval || card.interval === 0) return(secPerDay);
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
