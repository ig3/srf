'use strict';

/**
 * importdb.js reads an Anki database and produces an srf database,
 * for an early version of srf. It is no longer used and is not compatible
 * with the current version of srf. It manifests most of what I learned
 * about the Anki database, up to Anki version 2.1.43.
 *
 * I began srf using an unmodified Anki database. I then began transforming
 * the database. Primary motivation was to eliminate the need to serialize
 * and deserialize the fields set by rust/serde serialization. I then wrote
 * importdb.js (this module) to allow fresh imports from Anki: transforming
 * the database to the requirements of srf.
 *
 * Later, I added to srf and import function that imports from Anki
 * "Packaged Decks" (see: https://docs.ankiweb.net/exporting.html),
 * including .apkg and .colpkg files. Anki shared decks are in the .apkg
 * format, so this allowed import of Anki shared decks. While I haven't
 * found an Anki shared deck that can't be imported, I have only tested a
 * small number of them and some template features are not supported by
 * srf. For example: cloze cards, text to speech, etc. See README for a
 * fuller description of unsupported features.
 *
 * Since adding the import function to srf, this (importdb.js) has not been
 * updated as the srf database further evolved. Thus it is of no use with
 * the current version of srf. I have not removed it only because it
 * embodies some significant information about the Anki database that I
 * don't have recorded elsewhere.
 *
 */

const fs = require('fs');

const srcFile = process.argv[2];
const dstFile = process.argv[3];

if (!srcFile || srcFile === '' || !dstFile || dstFile === '') {
  console.log('Usage: importdb.js <source> <destination>');
  process.exit(1);
}

if (srcFile === dstFile) {
  console.log('source and destination must be different');
  process.exit(1);
}

fs.copyFileSync(srcFile, dstFile);

console.log('copied');

removeCollationUnicase();
lowercaseTableNames();
addColumns();
renameColumns();
fixDue();
setNewOrder();
reviseRevlog();
reviseTemplates();

/**
 * Anki uses rust sqlite driver to access its database and this uses
 * a collation function called unicase on several fields. This manifests
 * in the database as a 'collation unicase' on affected fields. When using
 * the database, a unicase collation function must be registered. But the
 * rust unicase function is non-trivial. I haven't found its equivalent in
 * javascript but conceptually it is a collation/sort order that is case
 * insensitive across the unicode character set. I don't need. this.
 *
 * This function removes the collation from fields that have it. SQLite
 * doesn't support an alter table... query to change the collation of a
 * field, so this reads the schema SQL and modifies it.
 */
function removeCollationUnicase () {
  let db = require('better-sqlite3')(dstFile);
  const schemaEntries = db.prepare("select name, sql from sqlite_master where type='table'").all();

  db.unsafeMode(true);
  db.pragma('writable_schema = 1');
  schemaEntries.forEach((entry, id) => {
    if (/collate unicase/i.test(entry.sql)) {
      const sql = entry.sql.replace(/ collate unicase/i, '');
      db.prepare("update sqlite_master set sql = ? where type == 'table' and name = ?").run(sql, entry.name);
    }
  });
  db.unsafeMode(false);
  db.close();
  db = require('better-sqlite3')(dstFile);
  db.prepare('reindex').run();
  db.close();
}

/**
 * I don't think this is necessary but recent version of Anki makes the
 * name of the fields table all uppercase. It's just a detail, but I prefer
 * lowercase table names. This function makes sure all the table names are
 * lowercase.
 *
 * Sqlite doesn't distinguish case so it is not possible to change case
 * directly. Need to rename twice: to a temporary name then to the final
 * name.
 */
function lowercaseTableNames () {
  const db = require('better-sqlite3')(dstFile);
  const tables = db.prepare("select name from sqlite_master where type='table'").all();
  tables.forEach(entry => {
    if (entry.name !== entry.name.toLowerCase()) {
      const newName = entry.name.toLowerCase();
      db.prepare('alter table ' + entry.name + ' rename to XXX').run();
      db.prepare('alter table XXX rename to ' + newName).run();
    }
  });
  db.close();
}

/**
 * addColumns adds new columns to existing tables.
 *
 * cards.new_order - sorting field for new cards
 */
function addColumns () {
  const db = require('better-sqlite3')(dstFile);
  try {
    db.prepare('alter table cards add column new_order integer not null default 0').run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: duplicate column name: new_order') {
      throw e;
    }
  }
  try {
    db.prepare("alter table templates add column front text not null default ''").run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: duplicate column name: front') {
      throw e;
    }
  }
  try {
    db.prepare("alter table templates add column back text not null default ''").run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: duplicate column name: back') {
      throw e;
    }
  }
  try {
    db.prepare("alter table templates add column css text not null default ''").run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: duplicate column name: css') {
      throw e;
    }
  }
  try {
    db.prepare('alter table revlog add column lapses integer not null default 0').run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: duplicate column name: lapses') {
      throw e;
    }
  }
  db.close();
}

/**
 * renameColumns renames existing columns
 *
 * ivl -> interval
 */
function renameColumns () {
  const db = require('better-sqlite3')(dstFile);
  try {
    db.prepare('alter table cards rename column ivl to interval').run();
  } catch (e) {
    if (e.toString() !== 'SqliteError: no such column: "ivl"') {
      console.log('error: ' + e);
      throw e;
    }
  }
  db.close();
}

/**
 * Anki puts various values into due depending on the queue. But srf sets
 * due to seconds since the epoch always. So, for each card, set due
 * to the appropriate value for srf.
 */
function fixDue () {
  const db = require('better-sqlite3')(dstFile);
  const db2 = require('better-sqlite3')(dstFile);
  // crt is the collection creation time in seconds since epoch
  // many due values are relative to this
  const crt = db.prepare('select crt from col').get().crt;
  console.log('crt ', crt);

  const cards = db.prepare('select * from cards');

  // Limit due to 1 year from now
  const dueLimit = Date.now() / 1000 + 60 * 60 * 24 * 365;

  for (const card of cards.iterate()) {
    // console.log('card ', card);
    if (card.queue === 0) { // new
      // For new cards, due is an ordinal
      // In Anki the new card queue is filled with
      // select id from cards where did = ? and queue = {QUEUE_TYPE_NEW}
      // order by due,ord limit ?
      // Merge due and ord into ord and set due to 0
      // console.log('set ord on ' + card.id);
      // Doing this one at a time is inefficient.
      // See setNewOrder()
      // db2.prepare('update cards set ord = ?, due = 0 where id = ?')
      //  .run(card.due + card.ord, card.id);
    } else if (card.queue === 1) { // (re)learn
      // due is epoch seconds. Limit it to dueLimit.
      // interval is an index into the learning steps. Set it to 60.
      // Move to queue 2: all cards are review cards in srf
      db2.prepare('update cards set queue = ?, interval = ?, due = ? where id = ?')
      .run(2, 60, Math.min(dueLimit, card.due), card.id);
    } else if (
      card.queue === -3 || // manually buried
      card.queue === -2 || // sibling buried
      card.queue === -1 || // suspended
      card.queue === 2 || // review queue
      card.queue === 3 // day (re)learn
    ) {
      if (card.due < crt) {
        // due is a day with crt being day 0
        const due = Math.min(dueLimit, crt + card.due * 60 * 60 * 24);
        // interval is a number of days.
        const interval = card.interval * 60 * 60 * 24;
        db2.prepare('update cards set queue = ?, interval = ?, due = ? where id = ?')
        .run(2, interval, due, card.id);
      }
    } else {
      console.log('Unsupported queue ', card.queue);
    }
  }
  db2.close();
  db.close();
}

/**
 * ivl is negative for seconds or positive for days. Convert all to
 * seconds. Same for lastivl. Time is milliseconds. Convert to seconds.
 */
function reviseRevlog () {
  const db = require('better-sqlite3')(dstFile);
  db.prepare(`
update revlog set
  ivl = case when ivl < 0 then -ivl else ivl*60*60*24 end,
  lastivl = case when lastivl < 0 then -lastivl else lastivl*60*60*24 end,
  time = round(time/1000,0)
  `).run();
  db.prepare('update revlog set lapses = (select count() from revlog as b where b.cid = revlog.cid and b.ivl < 60*60*24*21 and b.lastivl > 60*60*24*21 and b.id <= revlog.id)').run();
  db.prepare('update revlog set type = 2 where ivl > 60*60*24*21').run();
  db.prepare('update revlog set type = 0 where ivl < 60*60*24*21 and lapses = 0').run();
  db.prepare('update revlog set type = 1 where ivl < 60*60*24*21 and lapses > 0').run();
  db.prepare('update revlog set lastivl = 0 where id in (select id from revlog group by cid order by cid, id)').run();
  db.close();
}

/**
 * In Anki, the order of presentation of new cards is primarily determined
 * by due which, for new cards isn't a due day or time.
 *
 * The sort for new cards is: order by due, ord
 *
 * In this case, due is a fairly arbitrary integer. Not sure the rules.
 * The ord coordinates with templates to identify the specific template
 * to be used to present the note to the user.
 *
 * Having new card sort order in due has the disadvantage that after the
 * card is seen the sort information is overwritten, after which it is not
 * possible to reset the card and maintain original sort order.
 *
 * In srf, the new card sort order is in a new, separate field: new_order.
 *
 * For cards in the new queue, we can set new_order. For cards in other
 * queues, the information has already been overwritten.
 *
 */
function setNewOrder () {
  const db = require('better-sqlite3')(dstFile);
  db.prepare('update cards set queue = 2, new_order = due where queue = 0 and new_order = 0').run();
  db.close();
}

/**
 * In Anki, the HTML for front and back are serialized into a blob
 *
 * In Anki, the CSS for the templates is in table notetypes. It is common
 * to all the templates associated with a given note type. Here it is
 * replicated to each template so that in srf each template has its own,
 * independent CSS.
 *
 * In srf the front and back templates and CSS are put into separate
 * fields, rather than serialized into the config field.
 */
function reviseTemplates () {
  const db = require('better-sqlite3')(dstFile);
  const templates = db.prepare('select * from templates');

  for (const template of templates.iterate()) {
    if (!template.front) {
      const config = parseTemplateConfig(template.config);
      const noteType = getNoteType(template.ntid);
      const db = require('better-sqlite3')(dstFile);
      db.prepare('update templates set front = ?, back = ?, css = ? where ntid = ? and ord = ?')
      .run(
        config.front,
        config.back,
        noteType.config.css,
        template.ntid,
        template.ord
      );
      db.close();
    }
  }
  db.close();
}

/**
 * parseTemplateConfig takes the buffer returned by SQLite for the config
 * field and parses it into a JavaScript object, which is returned.
 *
 * From rslib/backend.proto:
 *
 * message CardTemplateConfig {
 *  string q_format = 1;
 *  string a_format = 2;
 *  string q_format_browser = 3;
 *  string a_format_browser = 4;
 *  int64 target_deck_id = 5;
 *  string browser_font_name = 6;
 *  uint32 browser_font_size = 7;
 *  bytes other = 255;
 * }
 *
 * The other field will be a JSON string.
 *
 * There are, potentially, 8 fields, but I have only seen 2: q_format
 * (0x08) and a_format (0x12).
 *
 * I expect the bottom three bits of the field code incode type field type,
 * with 0 for integer and 2 for string. There are likely different codes
 * for int74 and uint32 and bytes and maybe other field types.
 */
function parseTemplateConfig (buffer) {
  const value = {};
  const buf = {
    pos: 0,
    str: buffer.toString('binary')
  };
  while (buf.pos < buf.str.length) {
    const fieldCode = serdeGetInt(buf);
    if (fieldCode === 0x0a) {
      const len = serdeGetInt(buf);
      value.front = buf.str.substr(buf.pos, len);
      buf.pos += len;
    } else if (fieldCode === 0x12) {
      const len = serdeGetInt(buf);
      value.back = buf.str.substr(buf.pos, len);
      buf.pos += len;
    } else {
      throw new Error('Unsupported field code ' + fieldCode + ' in template config ' + JSON.stringify(buf));
    }
  }
  return (value);
}

/**
 * serdeGetInt parses an integer value from in.str starting at in.pos.
 * The string is rust serde serialization as per Anki use of serde.
 *
 * The integer is stored little-endian, seven bits per byte. If the high
 * order bit is set then the next byte is part of the integer. Otherwise,
 * the current byte is the last byte of the integer.
 */
function serdeGetInt (buf) {
  let value = 0;
  let n = 0;
  do {
    value = value | ((buf.str.charCodeAt(buf.pos) & 0x7f) << (n++ * 7));
  } while (buf.str.charCodeAt(buf.pos++) > 0x7f);
  return (value);
}

/**
 * getNoteType retuns details of the note type with the given ID.
 */
function getNoteType (ntid) {
  const db = require('better-sqlite3')(dstFile);
  const noteType = db.prepare('select * from notetypes where id = ?').get(ntid);
  const config = parseNoteTypeConfig(noteType.config);
  noteType.config = config;
  return (noteType);
}

/**
 * parseNoteTypeConfig takes the buffer returned by SQLite for the config
 * field and parses it into a JavaScript object, which is returned.
 *
 * From rslib/backend.proto
 *
 * message NoteTypeConfig {
 *  enum Kind {
 *    KIND_NORMAL = 0;
 *    KIND_CLOZE = 1;
 *  }
 *  Kind kind = 1;
 *  uint32 sort_field_idx = 2;
 *  string css = 3;
 *  int64 target_deck_id = 4;
 *  string latext_pre = 5;
 *  string latex_post = 6;
 *  bool latex_svg = 7;
 *  repeated CardRequirement reqs = 8;
 *  bytes other = 255;
 * }
 *
 * More of this 'other' nonsense. It's already a serialized object, why
 * have one inside another?
 *
 * message CardRequirement {
 *  enum Kind {
 *    KIND_NONE = 0;
 *    KIND_ANY = 1;
 *    KIND_ALL = 2;
 *  }
 *  uint32 card_ord = 1;
 *  Kind kind = 2;
 *  repeated uint32 field_ords = 3;
 * }
 *
 * I don't know how that repeated CardRequirement would manifest.
 *
 * sort_field_idx is the index of the field by which cards are sorted in
 * the Anki card browser.
 *
 * target_deck_id appears to be a default deck into which cards are added.
 * I don't see a way to set this in the Anki UI. When adding a card, one
 * selects the deck in the UI. Maybe this target_deck_id determines the
 * default deck in the selector (I haven't traced the code that far) but
 * either it is never set or doesn't have this effect: the default deck is
 * the same no matter which card type I select. If it is 0, then no deck is
 * selected. In at least one place, if this is 0 then the target deck is
 * deck ID 1.
 *
 * CardRequirement appears to relate to fields. See
 * rslib/src/notetype/mod.rs. It is set on all note types, but it isn't
 * clear from a quick review of the code if or how or when it is used.
 *
 */
function parseNoteTypeConfig (buffer) {
  const value = {};
  const buf = {
    pos: 0,
    str: buffer.toString('binary')
  };
  while (buf.pos < buf.str.length) {
    const fieldCode = serdeGetInt(buf);
    if (fieldCode === 0x08) {
      // kind is 0 for Standard or 1 for Cloze
      value.kind = serdeGetInt(buf);
    } else if (fieldCode === 0x10) {
      value.sortFieldIndex = serdeGetInt(buf);
    } else if (fieldCode === 0x1a) {
      const len = serdeGetInt(buf);
      value.css = buf.str.substr(buf.pos, len);
      buf.pos += len;
    } else if (fieldCode === 0x20) {
      value.targetDeckID = serdeGetInt(buf);
    } else if (fieldCode === 0x2a) {
      const len = serdeGetInt(buf);
      value.latexPre = buf.str.substr(buf.pos, len);
      buf.pos += len;
    } else if (fieldCode === 0x32) {
      const len = serdeGetInt(buf);
      value.latexPost = buf.str.substr(buf.pos, len);
      buf.pos += len;
    } else if (fieldCode === 0x38) {
      value.LatexSvg = serdeGetInt(buf);
    } else if (fieldCode === 0x42) {
      const len = serdeGetInt(buf);
      const cardReqStr = buf.str.substr(buf.pos, len);
      if (!value.cardRequirements) value.cardRequirements = [];
      value.cardRequirements.push(parseCardRequirement(cardReqStr));
      buf.pos += len;
    } else if (fieldCode === 0x7fa) {
      const len = serdeGetInt(buf);
      value.other = JSON.parse(buf.str.substr(buf.pos, len));
      buf.pos += len;
    } else {
      throw new Error('Unsupported field code ' + fieldCode + ' in notetype config ' + JSON.stringify(buf));
    }
  }
  console.log('Note type config: ', value);
  return (value);
}

/**
 * parseCardRequirement takes a string containing the content of one
 * cardRequirement item, parses it into an object and returns the object.
 *
 * From rslib/backend.proto
 *
 * message NoteTypeConfig {
 *  enum Kind {
 *    KIND_NORMAL = 0;
 *    KIND_CLOZE = 1;
 *  }
 *  Kind kind = 1;
 *  uint32 sort_field_idx = 2;
 *  string css = 3;
 *  int64 target_deck_id = 4;
 *  string latext_pre = 5;
 *  string latex_post = 6;
 *  bool latex_svg = 7;
 *  repeated CardRequirement reqs = 8;
 *  bytes other = 255;
 * }
 *
 * More of this 'other' nonsense. It's already a serialized object, why
 * have one inside another?
 *
 * message CardRequirement {
 *  enum Kind {
 *    KIND_NONE = 0;
 *    KIND_ANY = 1;
 *    KIND_ALL = 2;
 *  }
 *  uint32 card_ord = 1;
 *  Kind kind = 2;
 *  repeated uint32 field_ords = 3;
 * }
 *
 * I don't know how that repeated CardRequirement would manifest.
 * It looks like a count followed by that many integers in a row
 * with no further field/type codes. But this is inconsistent with
 * the repeated above, where each repeat has a leading code and length,
 * but maybe it depends on the type??? Who knows, because I can't find
 * the rust/serde code.
 *
 * The result doesn't look too grosly unreasonable, but there is a good
 * chance this parsing is wrong.
 */
function parseCardRequirement (str) {
  const value = {};
  const buf = {
    pos: 0,
    str: str
  };
  while (buf.pos < buf.str.length) {
    const fieldCode = serdeGetInt(buf);
    if (fieldCode === 0x08) {
      value.cardOrd = serdeGetInt(buf);
    } else if (fieldCode === 0x10) {
      value.kind = serdeGetInt(buf);
    } else if (fieldCode === 0x1a) {
      const count = serdeGetInt(buf);
      if (!value.fieldOrds) value.fieldOrds = [];
      for (let i = 0; i < count; i++) {
        value.fieldOrds.push(serdeGetInt(buf));
      }
    } else {
      throw new Error('Unsupported field code ' + fieldCode + ' in CardRequirement' + JSON.stringify(buf));
    }
  }
  return (value);
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
// eslint-disable-next-line
function parseFieldsConfig (str) {
  throw new Error('not implemented');
}
