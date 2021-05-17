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
const crt = getCreationTime();
console.log('crt: ', crt);
const crtDate = new Date(crt * 1000);
console.log('crtDate: ', crtDate);
let dueCards = getDueCards(crtDate);
console.log('dueCards length ', dueCards.length);
let note;

const expressHandlebars = require('express-handlebars');

app.engine('handlebars', expressHandlebars());
app.set('view engine', 'handlebars');
app.use(express.static('media'));

app.get('/', (req, res) => {
  dueCards = getDueCards(crtDate);
  const card = dueCards.shift();
  note = getNote(card);
  res.render('home', note);
});

app.get('/back', (req, res) => {
  res.render('back', note);
});

app.get('/again', (req, res) => {
  console.log('record that this card was again');
  const card = dueCards.shift();
  note = getNote(card);
  res.render('home', note);
});

app.get('/hard', (req, res) => {
  console.log('record that this card was hard');
  const card = dueCards.shift();
  note = getNote(card);
  res.render('home', note);
});

app.get('/good', (req, res) => {
  console.log('record that this card was good');
  const card = dueCards.shift();
  note = getNote(card);
  res.render('home', note);
});

app.get('/easy', (req, res) => {
  console.log('record that this card was good');
  const card = dueCards.shift();
  note = getNote(card);
  res.render('home', note);
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

function getDueCards (crtDate) {
  const now = new Date();
  const days = Math.floor((now - crtDate) / 1000 / 60 / 60 / 24);
  console.log('elapsed days', days);
  const cards = db.prepare('select * from cards where queue = 2 and due < ?').all(days+1);
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


  const front = Mustache.render(note.template.front, fieldData);
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
