# srf
Spaced Repetition Flashcards.

## Why?

Yet another flashcard program, because I am too stupid, lazy and stubborn
to find and adapt to an existing one (there are many).

I used [Anki](https://apps.ankiweb.net/) desktop for a couple of years. 
It is quite good, with many decks available and a good feature set. But
there were a bugs in timezone handling that affected me and I wanted a
somewhat different scheduler. I created submitted patches and created
add-ons to fix bugs and add some of the features I wanted, but became
increasingly frustrated by the complexity of the build environment, the
frequency of changes to the scheduler api and internals, lack of
documentation of the internals and add-on apis, the inscrutable rust back
end and blobs in the database.

What I really wanted to do was to write my own scheduler, but with so many
rapidly changing hooks into it from various parts of the code, doing so was
impractical.

## Pros

* Pure JavaScript on Node
* Browser based
* Simple scheduler without the complexity of Anki queues
* SQLite3 database
* No obscure collation function
* card templates compatible with Anki templates for simple fields

## Cons

* Very much alpha code - just an experiment at this point
* No configuration interface, not even a configuration file - edit the code
* No reports - just rudimentary stats to the browser or server console
* No deck import
* Not well tested
* No support for cloze cards

## Getting Started

```
$ git clone https://github.com/ig3/srf.git
$ cd srv
$ npm install
$ node index.js
```

The server listens on port 8000 by default. But the server won't work until
you have a database.

I started with a copy of my Anki database. I had to remove the collation in
order to work with it. To do so, you can run the Perl script:

```
$ perl removeCollation.pl > removeCollation.sql
```

This will produce SQL code that you can run against your database:

```
$ sqlite3 srf.db <removeCollation.sql
$ sqlite3 srf.db reindex
```

The only change to the database structure thus far is addition of column
`seen` to table cards.

The following might work but I haven't tested it. I used DB Browser for
SQLite.

```
$ sqlite3 srf.db 'alter table cards add column seen integer NOT NULL'
```

While the table structures are otherwise unaltered from Anki, the use of
columns in the cards and revlogs tables are different. While you can just
start browsing cards, you might to better to reset them all by setting due
to 0 for all cards in queues other than 0 then setting queue and seen to 0
for all cards.


## Scheduling

Scheduling is very simple. 

Cards with seen = 0 are 'new'. They are only shown if workload permits.

Cards with seen != 0 have been seen before. Seen is the epoch time of when
they were last seen and due is the time they are due to be seen again.

When a card is seen, it can be updated with one of four buttons:

* Again - factor = 2000, due = now + 60 seconds
* Hard - factor -= 50, due = now + (now-seen) * 0.9
* Good - factor += 50, due = now + (now-seen) * factor/1000
* Easy - factor += 200, due = now + (now-seen) * factor/1000

Minimum time to next due is one minute.
Maximum time to next due - there isn't one, but probably should be
Minimum factor is 1200
Maximum factor is 10000

For Easy, factor is set to a minimum of 4000 and time to next due is a
minimum of one day.

Unlike Anki, there is no 'interval'. Or, rather, the interval is the time
from when the card was last seen until now, regardless of whether the card
has just come due or came due several weeks ago (if you take a break from
study for whatever reason). If you really want it, you can get the old
interval: its the difference between when the card was last seen and when
it was due. But, you view cards when you do, always more or less after they
are due. The actual interval might not be ideal, in terms of learning
performance, but whatever it is, that's what it is. Base the time to next
due based on the actual interval and whether it was easy, good, hard or
again (ease, in Anki terms) this time.

Workload is managed by controlling the introduction of new (seen = 0)
cards.

Total time to view all cards due by end of day is estimated. This is based
on the number of cards due and average time per view for all cards viewed
the past 10 days. This should probably be increased by some factor, as not
all cards are easy - you will view some cards more than once in a day. But
the estimate includes actual time reviewing cards during the day, so the
estimate becomes more accurate as the day progresses.

If the estimated time to complete reviews exceeds studyTimeNewCardLimit
(which is set to 1 hour at the moment) then new cards are not shown.

Otherwise, if there are due cards then a new card is shown approximately
every 10 minutes. If there are no due cards, then new cards are shown
immediately, until the estimate of total study time exceeds 1 hour.

The objective is to keep study time close to 1 hour per day by adding new
cards if it is less and blocking new cards if it is more. It is always
possible to review all due cards. There is no limit on cards viewed - only
on new cards.

## Notes

The cards I used are simple html/css. Nothing fancy. It should be easy to
present them in the browser, electron or any other context that supports
html/css.

## Anki database

See [Anki 2 annotated schema](https://gist.github.com/sartak/3921255)

See [Database Structure](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure), which is a little more complete/correct.

### cards

### notes

 * id - primary key
 * guid - a GUID, probably used in syncing as id can't be consistent
 * mid - fk to notetype.id
 * mod - presumably epoch seconds of last modification time
 * usn - ??? - always -1 in my database - to do with sync
 * tags - Anki can add tags to cards, maybe notes too? Don't know how to
     tag a note Vs a card. - probably legacy
 * flds - the field data, 0x1f as separator (escape???)
 * sfld - something to do with searching and duplicates
 * csum - some sort of checksum - some sort of sha1 digest
 * flags - I guess notes can have flags too - probably legacy
 * data - always empty - probably legacy


### templates
From templates.rs:

```
        CardTemplate {
            ord: None,
            name: name.into(),
            mtime_secs: TimestampSecs(0),
            usn: Usn(0),
            config: CardTemplateConfig {
                q_format: qfmt.into(),
                a_format: afmt.into(),
                q_format_browser: "".into(),
                a_format_browser: "".into(),
                target_deck_id: 0,
                browser_font_name: "".into(),
                browser_font_size: 0,
                other: vec![],
            },
        }
```



