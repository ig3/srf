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

The database must be in ~/.local/share/srf/srf.db.

Media files must bein in ~/.local/share/srf/media.

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

Copy the imported database to: `~/.local/share/srf/srf.db`.

I will probably write something to import a published Anki deck, but not
yet.

Copy all the Anki media to the media subdirectory: `~/.local/share/srf/media`.

## Config

Scheduling is tuned by configuration parameters in file
`~/.local/share/srf/config`. The file
content must be in [JSON5](https://json5.org/) format.

For example:

```
{
    // The maximum value factor may take.
    maxFactor: 10000,
    // The interval beyond which due times are rounded to the start of the
    // day, in seconds.
    dueTimeRoundingThreshold: 432000, // 5 days
    // The factor for randomizing intervals when good or easy are selected.
    intervalRandomFactor: 5,

    // again
    // The interval when again is selected, in seconds.
    againInterval: 10,
    // The minimum factor when again is selected.
    againMinFactor: 1200,
    // The sensitivity of factor to previous interval when again is selected.
    // The time constant of exponential decay towards maxFactor, in seconds.
    againIntervalSensitivity: 1814400, // 21 days

    // hard
    // The minimum interval when hard is selected, in seconds.
    hardMinInterval: 30,
    // The factor for adjusting interval when hard is selected.
    hardIntervalFactor: 0.5,
    // The minimum factor when hard is selected.
    hardMinFactor: 1200,
    // The change of factor when hard is selected.
    hardFactorAdjust: -50,

    // good
    // The minimum interval when good is selected, in seconds.
    goodMinInterval: 60,
    // The minimum factor when good is selected.
    goodMinFactor: 2000,
    // The change of factor when good is selected.
    goodFactorAdjust: 50,

    // easy
    // The minimum interval when easy is selected, in seconds.
    easyMinInterval: 432000, // 5 days
    // The minimum factor when easy is selected.
    easyMinFactor: 4000,
    // The change of factor when easy is selected.
    easyFactorAdjust: 200
}
```

## Scheduling

Cards have a due time (seconds since the epoch).

The cards to be studied are the cards with a due time before the current
time. Cards with later due times are to be studied later / in the future.

Of the cards to be studied, then next card to be studied is the card with
shortest interval and earliest due time.

After a break (a few hours, a day, a week or whatever) there will be many
cards due with various intervals. As you study, some of these will be
scheduled to be seen again in the next few seconds, minutes or hours.
Sorting by interval ensures that these cards are seen again as scheduled,
rather than being blocked until the backlog of due cards (some of which
might have much longer intervals) has been cleared.

When a card is seen, it can be updated with one of four buttons:

### Again
For cards you don't remember.

Factor is set to 2000. This factor determines how quickly the interval
increases for Good and Easy cards (see below).

Next due is in 10 seconds.

### Hard
For cards you remember with difficulty.

Factor is decreased by 50, to a minimum of 1200.

Next due is 50% of the interval from when the card was last seen. For
example, if the card was last seen 4 days ago, it will be due in 2 days, if
the card was last seen 2 hours ago, it will be due in 1 hour, etc. The
minimum interval is 30 seconds.

### Good
For cards that you remember well.

Factor is increased by 50, to a maximum of 10000 and a minimum of 1200.

Next due is time since last seen multipied by factor/1000, with a minimum
of 60 seconds and a maximum of one year.

### Easy
For cards that you remember very well, that you are viewing too frequently.

Factor is increased by 200, to a maximum of 10000.

Next due is time since last seen multipied by factor/1000, with a minimum
of one day and a maximum of one year.

## New Cards

Workload is managed by controlling the introduction of new cards.

All cards are initially considered to be 'new'. Technically, this is
determined by cards.interval being 0. After a card has been seen,
cards.interval is set to some non-zero value: the time, in seconds, until
the card is due to be seen again.

New cards are allowed when the estimate of total time to complete all due
reviews is less than the value of studyTimeNewCardLimit (currently
hard-coded in server.js as one hour (60\*60)).

While new cards are allowed, a new card will be presented if it is more
than 5 minutes since the last new card was presented or there are no cards
due for review (i.e. their due time is before current time - there may well
be more cards due later in the day).

Total time to view all cards due by end of day is estimated. This is based
on actual study time, the number of cards due and historic time per card
per day, averaged over the past 10 days. The product of cards due and
average time per card is added to the actual time already spent to estimate
the time it would take to complete study of all due cards. This takes into
account that some cards are viewed more than once in a day.  It's only an
estimate: not terribly accurate. But it is only a basis for limiting new
cards, to avoid overload. It doesn't have to be very accurate.

The objective is to keep study time close to 1 hour per day by adding new
cards if it would be less and blocking new cards if it would be more. It is
always possible to review all due cards. There is no limit on cards viewed
- only on new cards.

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

The config field holds a serialized data structure (rust/serde) that
appears to relate to the Anki field content editor: sticky, rtl
(right-to-left), font_name, font_size and 'other' for a JSON string, I
think.

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


### notetypes

 * id - primary key
 * name - text name of notetype
 * mtime_secs - modification time
 * usn - ???
 * config - serialized data structure

Note types are identified by ID. Fields and notes are linked to this ID.

mtime_secs is used in Anki sync, to find note types modified since last
sync, presumably. I haven't looked into sync.

usn is used in Anki sync.

config - this is a rust/serde serialized data structure. See importdb.js

config:
 * kind: 0 - Normal, 1 - Cloze
 * sort_field_idx: 
 * css: the css for the notes
 * target_deck_id: ???
 * latex_pre
 * latex_post
 * latex_svg
 * reqs: an array ???
 * other: arbitrary JSON serialized data

The css for the cards is here. This makes it common to all the templates
related to the note type. In srf, the css is extracted and added to the
templates table. In srf, each template has its own CSS.

Anki has support for using LaTeX to format cards. The latex_\* fields relate
to this.

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
For parsing JSON in POST bodies.

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
