'use strict';

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
      '<audio autoplay controls src="' + x[1] + '"></audio></br>'
    );
  }
  return(text);
};
const app = express();
const db = require('better-sqlite3')('srf.db');
let dueCards = getDueCards();
console.log('dueCards length ', dueCards.length);
let card;
let note;
let startTime;
let cardsViewed = 0;
const secondsPerDay = 60 * 60 * 24;
const startOfDay = Math.floor(new Date() / (1000 * secondsPerDay))
  * secondsPerDay * 1000;
console.log('startOfDay ', startOfDay);
let cardsViewedToday = db.prepare('select count() from revlog where id >= ?').get(startOfDay)['count()'];
console.log('cardsViewedToday ', cardsViewedToday);


const expressHandlebars = require('express-handlebars');

app.engine('handlebars', expressHandlebars());
app.set('view engine', 'handlebars');
app.use(express.static('media'));

app.get('/', (req, res) => {
  if (!dueCards || !dueCards.length) {
    console.log('load dueCards');
    dueCards = getDueCards();
  }
  if (dueCards && dueCards.length) {
    card = dueCards.shift();
    note = getNote(card);
    startTime = new Date();
    cardsViewed++;
    cardsViewedToday++;
    res.render('home', note);
  } else {
    res.send('All done for now');
  }
});

app.get('/back', (req, res) => {
  if (!note) {
    return res.redirect('/');
  }
  res.render('back', note);
});

app.get('/again', (req, res) => {
  if (card) {
    console.log('again');
    const newFactor = 4000;
    // ivl is time to next view in seconds
    const newInterval = 60;
    const newDue = Math.floor(new Date() / 1000) + newInterval;
    db.prepare('update cards set factor = ?, ivl = ?, due = ? where id = ?')
    .run(newFactor, newInterval, newDue, card.id);
    logReview(card, 1, newInterval, newFactor, newDue);
  }
  res.redirect('/');
});

app.get('/hard', (req, res) => {
  if (card) {
    console.log('hard');
    const newFactor = card.factor - 50;
    // ivl is time to next view in seconds
    const newInterval = Math.max(60, Math.floor(newFactor / 1000 * card.ivl));
    const newDue = Math.floor(new Date() / 1000) + newInterval;
    db.prepare('update cards set factor = ?, ivl = ?, due = ? where id = ?')
    .run(newFactor, newInterval, newDue, card.id);
    logReview(card, 2, newInterval, newFactor, newDue);
  }
  res.redirect('/');
});

app.get('/good', (req, res) => {
  if (card) {
    console.log('good');
    const newFactor = card.factor + 50;
    const now = new Date()/1;
    // ivl is time to next view in seconds
    const newInterval = Math.max(60, Math.floor(newFactor / 1000 * card.ivl));
    const newDue = Math.floor(new Date() / 1000) + newInterval;
    db.prepare('update cards set factor = ?, ivl = ?, due = ? where id = ?')
    .run(newFactor, newInterval, newDue, card.id);
    logReview(card, 3, newInterval, newFactor, newDue);
  }
  res.redirect('/');
});

app.get('/easy', (req, res) => {
  if (card) {
    console.log('easy');
    const newFactor = card.factor + 200;
    // ivl is time to next view in seconds
    const newInterval = Math.max(60*60*24, Math.floor(newFactor / 1000 * card.ivl));
    const newDue = Math.floor(new Date() / 1000) + newInterval;
    db.prepare('update cards set factor = ?, ivl = ?, due = ? where id = ?')
    .run(newFactor, newInterval, newDue, card.id);
    logReview(card, 4, newInterval, newFactor, newDue);
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
  const now = Math.floor(new Date() / 1000);
  console.log('now ', now);
  const count = db.prepare('select count() from cards where queue = 2 and due < ?').get(now);
  console.log(count, ' cards due');
  const cards = db.prepare('select * from cards where queue = 2 and due < ? order by due limit 10').all(now);
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

function logReview (card, ease, newInterval, newFactor, newDue) {
  const now = new Date()/1;
  let elapsed = Math.floor(now - startTime);
  if (elapsed > 120000) {
    elapsed = 120000;
  }
  console.log(cardsViewed, cardsViewedToday, now, card.id, ease, formatDue(card.due), formatDue(newDue), newInterval, card.ivl, newFactor, elapsed);
  db.prepare('insert into revlog (id, cid, usn, ease, ivl, lastivl, factor, time, type) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(now, card.id, -1, ease, newInterval, card.ivl, newFactor, elapsed, 2);
}

function formatDue (due) {
  const now = new Date()/1000;
  const interval = due - now + 10;
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
  } else if (interval < 0) {
    return('-' + Math.floor(-interval/60) + ' min');
  } else if (interval < 3600) {
    return(Math.floor(interval/60) + ' min');
  } else if (interval < 3600 * 24) {
    return(Math.floor(interval/3600) + ':' + Math.floor((interval % 3600) / 60));
  } else {
    const d = new Date(due * 1000);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return([year, month, day].join('-'));
  }
}
