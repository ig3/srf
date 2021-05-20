# srf
Spaced Repetition Flashcards.

## Why?

Yet another flashcard program, because I am too stupid, lazy and stubborn
to find and adapt to an existing one (there are many).

I used [Anki](https://apps.ankiweb.net/) desktop for a couple of years.  It
is quite good, with many decks available and a good feature set. But there
were bugs in timezone handling that affected me and I wanted a somewhat
different scheduler with automatic adjustment of new cards per day to
maintain a more constant workload. I submitted patches and created add-ons
to fix bugs and add some of the features I wanted, but I became
increasingly frustrated by the complexity of the build environment, the
frequency of changes to the scheduler api and internals, lack of
documentation of the internals and add-on APIs, the inscrutable rust back
end and blobs in the database. Eventually I decided it would be less work
to write my own (I only need and use a small subset of Anki features) than
to keep struggling with Anki. I have much respect and appreciation for
Anki, but I want something a little different in the scheduler and to spend
more time using the tool and less time developing and maintaining it. 

I just spent all my free time (and a lot of time that really wasn't free,
and I should have been doing other things, like sleeping) for a couple of
weeks to adapt my Anki scheduling add-on to more recent versions of Anki
and, in particular, to the shift of scheduling function to the back-end and
elimination of the hooks I had been using. While the outcome was some
improvement in the approach (necessity is the mother of invention, as they
say) overall the cost/benefit was not good.

It took me only three days to get this to the point I could get back to
studying - significantly less time than the last iteration of my Anki
add-ons, and I still didn't have the scheduling I actually wanted in Anki.

Now, with this, I can do whatever I want with scheduling.

The biggest challenges were reverse engineering the serialization of the
blobs in the database (because after hours of searching I still couldn't
find a definition of the rust/serde serialization. It's open source. I'm
sure the information is there somewhere, but it's not documented, not
discussed, and there are too many layers of abstraction and build
automation on top of it - I couldn't find the code. The other issue was the
collation function in the rust sqlite driver. It is rust specific. I found
the implementation but didn't want to re-implement it in JavaScript - I
don't need it. But I couldn't decide this until I found what it was. Once I
had determined I didn't need or want it, it only took me a little while to
learn how to remove it from the database.

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

The server listens on port 8000 by default.

But the server won't work until you have a database. The server works for
me, with a database copied from Anki version 2.1.43. If you are using some
other version of Anki, it probably won't work. Each release of Anki (many
of them, at least) `upgrades` the database. The Anki Profiles screen has a
Downgrade & Quit button, but it is not obvious what one is downgrading to
and when I try it now it simply says that profiles can now be opened with
an older verson of Anki. Last time I tried, older versions of Anki prompted
to re-run the new version and downgrade. It might be necessary to step back
through each release since, to get to an older release - I don't know, I
haven't done it, but as of 2.1.43, there seems to be no way to downgrade
anymore.

I started with a copy of my Anki desktop database. I had to remove the
collation in order to work with it. To do so, you can run the Perl script:

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

If you want preserve the state of cards rather than reset, set due and seen
based on current queue and due.

For the review and day learn queues: due is days since collection creation.
Add these and convert to UTC epoch seconds, and save this to due. For
review queue, set seen to this new due less the interval converted to
milliseconds (it's days for review queue).

For day (re)learn queue: due is (I think) epoch seconds. Convert to
milliseconds. Figure out the current interval (I forget the details: it's a
sequence of intervals in the config and perhaps field left records which is
the current step) and subtract that interval, converted to milliseconds,
from due to derive seen.

If you set seen to 0 then your next interval will be 60 seconds. This
effectively resets the card in terms of learning interval. If you have a
lot of cards with large intervals, that's quite a setback, though daily
workload will not be excessive and if you keep finding the cards easy, they
will progress back to reasonable intervals fairly quickly.

Maybe I will write something to import from an Anki database and code all
the conversions, but I don't have much need for it myself, so maybe not.

I will probably write something to import a published Anki deck, but that
would add all the cards as new and the databse format is quite different
from that of Anki desktop. And I guess the database formats of other
versions of Anki are different again.

Copy all the Anki media to the media subdirectory. You will probably have
to create it. I don't think git will create an empty directory and my media
isn't (at least it shouldn't be) committed.

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

Unlike Anki, there are no separate queues and there is no jump to
scheduling by day. Cards are always due at some specific time and this may
be any time of day. Don't worry about it. Don't obsess about viewing all
cards every day. Unless you are studying until midnight every day, there
will likely be some cards due later in the day. That's OK. As long as you
view all due cards at least once each day, you will do fine. You will view
the cards that come due later in the day when you study on the following
day - it's not a problem. I say this probably because I have obsessed about
completing all reviews every day in Anki.

## Templates

My notes/cards are simple: text fields, audio, images and hyperlinks. 

srf uses two template engines: one for the Anki templates (mustache) and
the other for pages (handlebars). I used mustache for the Anki templates
because, unlike handlebars, it handles spaces in the parameter names
(`{{Some Parameter}}`) which handlebars doesn't. But handlebars seemed a
little more featureful and I found a tutorial that made it easy to get
going with some simple pages (express setup and example pages). I probably
could have used mustache throughout but couldn't have used handlebars
without changing my templates.

srf works with my Anki templates and content without modifying them at all:
no changes to the front or back templates or to the CSS. No changes to the
media either, other than to make a copy of it for srf. My media includes
sounds and images.

## Anki database

See [Anki 2 annotated schema](https://gist.github.com/sartak/3921255)

See [Database Structure](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure), which is a little more complete/correct.

This code parses some of the blobs in the Anki database. I could not find
definition of how Anki/serde does this. The code was based on inspection of
the blobs, trial and error. It may be that different database instances
will code the data somewhat differently, or the field codes will change
with each release of Anki. What I have here works for me, with the database
from Anki 2.1.43.

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



