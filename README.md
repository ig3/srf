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

The script `importdb.js` reads an Anki database and makes changes so that
it will work with srf. There aren't many changes. Read the script for
details. For my decks, I am then able to study cards without further
modification, but I use only simple card types. Closures will not work, for
example. It preserves the due dates of cards. It preserves the due times of
day learn cards but ignores the intervals - setting interval to 1 minute.
This is OK for me. A small percentage of my collection are learning and my
learning intervals are all under 1 hours, so no big loss being set back to
1 minute interval.

`importdb.js` requires two arguments: the path of the Anki database file,
which it reads, and the path of the srf database to produce, which it
writes. You can try this script on your database and maybe it will suffice.

I will probably write something to import a published Anki deck, but not
yet.

Copy all the Anki media to the media subdirectory. You will probably have
to create it. I don't think git will create an empty directory and my media
isn't (at least it shouldn't be) committed.

## Scheduling

Scheduling is very simple. 

Cards with interval = 0 are 'new'. They are only shown if workload permits.

Cards with interval != 0 have been seen before. Seen is the epoch time of when
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

Related data is stored in notes. For example, a question and answer.

A note has a type, which determines what fields may be populated (e.g.
question and answer, or English and Chinese and pinyin).

A note type has a set of fields.

A note type has a set of card types/templates. The card types have front
and back templates.

For each note, one card is produced for each card type associated with the
note type of the note. The cards are associated with the note types by
field ord.

The CSS for the cards is stored in notetypes.config. It isn't obvious from
the card type editor, where it appears that each card type has front and
back templates and 'styling'. The styling is common to all the card types
of a given note type.

The database doesn't have a cardtypes table. Rather, the card types are
manifest in the templates table. Each template is linked to a notetypes by
templates.ntid. The relationship is many-to-one, with the different
templates distinguished by ord, which is also in cards. The specific
template for a card is determined by matching cards.ord to templates.ord.

Each templates record has two templates: front and back, serialized into
templates.config.

Each note type is associated with a set of fields and a set of templates
(a.k.a. card types).

Each note is associated with a note type which determines the fields and
cards associated with the note. The fields are the attributes for which
values may be saved. The templates determine how these are presented to the
user. Each template has a front and a back layout (the 'flashcard').


### cards

 * id - primary key
 * nid - fk to notes
 * did - fk to decks
 * ord - order among cards linked to same note
 * mod - card modification time
 * usn - something to do with syncing in Anki
 * type - ???
 * queue - the Anki queue
 * due - when the card is due seconds since epoch or day number
 * ivl - (renamed to interval) the interval between views
 * factor - the factor for increasing the interval between views
 * reps - number of times the card has been viewed
 * lapses - number of times the card was 'repeat'
 * left - something to do with (re)learn cards progress through steps
 * odue - original due, for cards temporarily in a different deck
 * odid - original deck ID, for cards temporarily in a different deck
 * flags - ???
 * data - ???
 * seen - srf: milliseconds since epoch when card was last seen
 * new_order - srf: integer for sorting new cards

type can be 0=new, 1=lrn, 2=rev, 3=relrn. It has something to do with
filtered decks, at least.

srf records all times with units of milliseconds. This includes due and
interval. New cards have interval = 0. When the card is seen, interval is
set to the interval from the current time to when the card will next be
due.

The relevant interval, when a card is seen, is the interval from when it
was last seen to the time it was next seen. The card was last seen at
cards.interval milliseconds before cards.due. The cards won't be shown
before they are due but they might not be seen until some time after they
are due - maybe hours or days after.  That's OK. The actual interval is
more relevant than any intended, theoretically ideal interval.

cards.new_order is for ordering the presentation of new cards. On import,
it is set to whatever due was equal to. The separate field gives the
advantage that the new card order isn't overwritten when the card is
viewed. The deck can be reset, including the order of new cards. But, any
cards viewed before import cannot be restored to their original new card
order - the information is gone.

In Anki, review and 'day' learning cards have due set to a day number, with
day 0 being the collection creation day, which is stored in the col table.
In srf, day numbers aren't used. Due is always milliseconds since the
epoch.

### fields

CREATE TABLE "fields" (
	"ntid"	integer NOT NULL,
	"ord"	integer NOT NULL,
	"name"	text NOT NULL,
	"config"	blob NOT NULL,
	PRIMARY KEY("ntid","ord")
) WITHOUT ROWID;

ntid: fk to notetypes
ord: ordinal for sorting fields
name: the field name
config: not used in srf. 

The config field holds a serialized data structure (rust/serde) that appear
to relate to the Anki field content editor: sticky, rtl (right-to-left),
font_name, font_size and 'other' for a JSON string, I think.

srf uses ntid, ord and name, at least until I add a card/note editor.

Note that this table only holds field names and sort order. The values
are in the notes table: notes.flds, with all field values serialized into
the single field.

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

CREATE TABLE "templates" (
	"ntid"	integer NOT NULL,
	"ord"	integer NOT NULL,
	"name"	text NOT NULL,
	"mtime_secs"	integer NOT NULL,
	"usn"	integer NOT NULL,
	"config"	blob NOT NULL,
	"front"	text NOT NULL DEFAULT '',
	"back"	text NOT NULL DEFAULT '',
	"css"	text NOT NULL DEFAULT '',
	PRIMARY KEY("ntid","ord")
) WITHOUT ROWID;

I added front, back and css. In Anki the HTML for front and back are
serialized into templates.config and the css is serialized into
notetype.config. The downside of this being that the CSS is common to all
card types associated with a given note type. Not a big issue, but with the
CSS moved to the templates table, each template can have its own CSS.

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



## Charts

I have tried [chart.js](https://chartjs.org). It's quite simple for a basic chart. 

Consider also d3.js

[Highcharts](https://www.highcharts.com/docs/chart-concepts/series) is easy
to use. But it requires a license. CC for non-commercial, but it's not like
FOSS.

https://alternativeto.net/software/highcharts/?license=free

[plotly](https://plotly.com/javascript/) is open source under MIT license,
available on GitHub and js available from CDN. It is even easier to use
than Highcharts (at least, less verbose) and makes good looking charts with
download, zoom, pan, values on hover and all sorts. Seems quite awesome.


## Dependencies

### NodeJS
The server runs on NodeJS

### better-sqlite3
Interface to the SQLite database

### body-parser
Because some template for using Express said to use this.

### cookie-parser
Because some template for using Express said to use this.

### express
The is the web server framework. It handles parsing and routing of requests
and production of responses.

### express-handlebars
This is template middleware for express. The website pages are generated
from handlebars templates.

### handlebars
This is the handlebars template engine. It is an extension of, or at least
largely compatible with the Mustache template engine.

### multer
Because some template for using Express said to use this.

### mustache
Another template engine. This one is, by default, a bit more compatible
with the Anki templates. So, the Anki templates are processed by Mustache
and the web pages are then produced from Handlebars templates. Handlebars
documentation says that it is compatible with Mustache, so perhaps there is
a way to consolidate on just Handlebars, in which case Mustache can be
dropped.

### timezonecomplete
For some timezone and time data processing.

### tzdata
Timezone data from timezonecomplete.

## Potential Dependencies

### [sorttable](https://kryogenix.org/code/browser/sorttable/)

Some script for making tables sortable. A copy of the script is in the root
directory of the project, for the moment, but not used.

### [tabulator](http://www.tabulator.info/)

This is another script for generating sortable tables. This takes quite a
different approach to sorttable. It seems well documented, but I haven't
tried it yet.

### [sort a table](https://htmldom.dev/sort-a-table-by-clicking-its-headers/)

This is some guidance and examples of sorting a table.
