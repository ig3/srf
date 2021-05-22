'use strict';

const tc = require('timezonecomplete');
const fs = require('fs');

const srcFile = process.argv[2];
const dstFile = process.argv[3];

if (!srcFile || !dstFile) {
  console.log('Usage: importdb.js <source> <destination>');
}

if (srcFile === dstFile) {
  console.log('source and destination must be different');
}

fs.copyFileSync(srcFile, dstFile);

console.log('copied');

removeCollationUnicase();
lowercaseTableNames();
addSeen();
addNewOrder();
fixDue();
setNewOrder();



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
      const sql = entry.sql.replace(/ collate unicase/i, "");
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
      db.prepare("alter table " + entry.name + " rename to XXX").run();
      db.prepare("alter table XXX rename to " + newName).run();
    }
  });
  db.close();
}


/**
 * srf uses a new integer field on the cards table: seen
 */
function addSeen () {
  const db = require('better-sqlite3')(dstFile);
  db.prepare("alter table cards add column seen integer not null default 0").run();
  db.close();
}

/**
 * srf uses a new integer field on the cards table: new_order
 */
function addNewOrder () {
  const db = require('better-sqlite3')(dstFile);
  db.prepare("alter table cards add column new_order integer not null default 0").run();
  db.close();
}


/**
 * Anki puts various values into due depending on the queue. But srf sets
 * due to milliseconds since the epoch always. So, for each card, set due
 * to the appropriate value for srf.
 */
function fixDue () {
  const db = require('better-sqlite3')(dstFile);
  const db2 = require('better-sqlite3')(dstFile);
  // crt is the collection creation times
  // many due values are relative to this
  const crt = db.prepare('select crt from col').get()['crt'] * 1000;
  console.log('crt ', crt);

  const cards = db.prepare('select * from cards order by due');

  const dueLimit = Date.now() + 1000 * 60 * 60 * 24 * 365;

  for (const card of cards.iterate()) {
    // console.log('card ', card);
    if (card.queue === 0) { // new
      // For new cards, due is an ordinal
      // In Anki the new card queue is filled with
      // select id from cards where did = ? and queue = {QUEUE_TYPE_NEW}
      // order by due,ord limit ?
      // Merge due and ord into ord and set due to 0
      //console.log('set ord on ' + card.id);
      // Doing this one at a time is inefficient.
      // See setNewOrder()
      //db2.prepare('update cards set ord = ?, due = 0 where id = ?')
      //  .run(card.due + card.ord, card.id);
    } else if  (card.queue === 1) { // (re)learn
      // Due is epoch seconds ivl is ???
      // left is used to index into the list of delays
      // Some people have very long steps in learning
      // but mine are no more than an hour
      let due = card.due * 1000;
      // I have seen a few strange due values
      // Probably because I don't understand the database conents
      // Make sure due isn't more than a year in the future.
      if (due > dueLimit) due = dueLimit;
      const seen = due - 60000;
      db2.prepare('update cards set due = ?, seen = ? where id = ?')
        .run(due, seen, card.id);
    } else if (
      card.queue === -3 || // manually buried
      card.queue === -2 || // sibling buried
      card.queue === -1 || // suspended
      card.queue === 2 ||  // review queue
      card.queue === 3 // day (re)learn
    ) {
      // due is a day with crt being day 0
      let due = crt + card.due * 1000 * 60 * 60 * 24;
      console.log('due  ', due, new Date(due).toString());
      if (due > dueLimit) due = dueLimit;
      // ivl is a number of days. Set seen based on due and ivl
      const seen = due - card.ivl * 1000 * 60 * 60 * 24;
      console.log('seen ', seen, new Date(seen).toString());
      db2.prepare('update cards set due = ?, seen = ? where id = ?').run(due, seen, card.id);
    } else if (card.queue === 4) { // preview
      console.log('queue 4 ', card);
    } else {
      console.log('Unsupported queue ', card.queue);
    }
  }
  db2.close();
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
  db.prepare('update cards set new_order = due where seen = 0').run();
  db.close();
}
