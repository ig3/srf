# srf
Spaced Repetition Flashcards.

## Getting Started

```
$ git clone https://github.com/ig3/srf.git
$ cd srv
$ npm install
$ node index.js import <export file>
$ node index.js
```
The import supports Anki exports and shared decks (.apkg files).

The server listens on port 8000 by default.

The data is in ~/.local/share/srf by default, including database (srf.db)
and media files. The database in ~/.local/share/srf/srf.db. Media files
must bein in ~/.local/share/srf/media.

## Command Synopsis

```
usage:
  index.js --help
  index.js [--directory <root-directory>] [--config <config-file>] [--database <database-name>] [--media <media-directory>]
  index.js [--directory <root-directory>] [--config <config-file>] [--database <database-name>] [--media <media-directory>] import <filename>
```

### options

#### --help|-h
Display usage and exit.

#### --directory|--dir
Set the root directory, in which the database and media files are located.

Default is ~/.local/share/srf

If the given directory is absolute (i.e. begins with '/') it is used as
given. If it is relative (i.e. does not begin with '/') it is relative to
`~/.local/share`.

For example: `/tmp/testing` would use that directory but `testing` would
use `~/.local/share/testing` and `testing/a` would use
`~/.local/share/testing/a`.

Media files are located in the `media` subdirectory of this directory.

The srf database is, by default, `srf.db` in this directory, but see option
`--database` below.

#### --config|-c
Set the configuration filename.

Default is `config.json`

If the given path is absolute (i.e. begins with '/') it is used as given.
If it is relative (i.e. does not begin with '/') it is relative to the path
of the --directory option.

#### --database|--db
Set the sqlite3 database name.

Default is ~/.local/share/srf/srf.db or, if --directory is specified then
srf.db in that directory.

If the given path is absolute (i.e. begins with '/') it is used as given -
the database file can be outside the data directory. If it is relative,
then it is relative to the path of the --directory option.

The directory to contain the database is created if it doesn't exist.

#### --media|-m
Set the path of the media directory.

Default is `media`

If the given path is absolute (i.e. begins with '/') it is used as given.
If it is relative (i.e. does not begin with '/') it is relative to the path
of the --directory option.

The directory is created if it doesn't exist.

## Config

Scheduling is tuned by configuration parameters in file
`~/.local/share/srf/config`. The file
content must be in [JSON5](https://json5.org/) format.

This is out of date: I have revised the database schema and various aspects
of the scheduler, but haven't settled the changes yet so haven't updated
the documentation.

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

Of the cards to be studied, the next card to be studied is the card with
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

The interval is reduced to 2% of its previous interval or
config.againInterval, whichever is greater.

### Hard
For cards you remember with difficulty.

Interval is reduced to 50% of its previous interval or
config.hardMinInterval, whichever is greater. The 50% factor is
configurable with config.hardIntervalFactor, wich is 0.5 by default.

### Good
For cards that you remember well.

Interval is changed by a factor which depends on recent history of the
interval. The algorithm is a bit complex. I will document it at some point,
but it is still in flux. See the code for details: intervalGood() and
newFactor() in particular.

### Easy
For cards that you remember very well, that you are viewing too frequently.

Similarly to Good, but with a more aggressive factor and a minimum interval
of one week. The point of Easy is to avoid reviewing an easy card over and
over. If it is still good or easy in a week, interval will grow quite
quickly from there.

## New Cards

Workload is managed by controlling the introduction of new cards.

All cards are initially considered to be 'new'. Technically, this is
determined by cards.interval being 0. After a card has been seen,
its interval is set to some non-zero value: the time, in seconds, until
the card is due to be seen again.

New cards are allowed when the estimate of total time to complete all due
reviews is less than the value of studyTimeNewCardLimit (currently
hard-coded in server.js as one hour (60\*60)).

While new cards are allowed, a new card will be presented if it is more
than 5 minutes since the last new card was presented or there are no cards
currently due for review.

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

### Anki features not supported

#### Text to Speech

In Anki 2.1.20 or later on Windows, MacOS or iOS, or Linux with an add-on,
a field of the from `{{tts en_US:Front}}` will read the Front field in a
U.S. English voice.

A field of the from {{tts-voices:}} will produce a list of all supported
voices. And various options can be given to specify the voice, speed, etc.

None of these are supported in srf.

#### Special Fields

The special fields `{{tags}}`, `{{Type}}`, `{{Deck}}`, `{{Subdeck}}`,
`{{Card}}` are not supported in srf.

The special field `{{FrontSide}}` is supported in srf.

#### Hint Fields

Fields of the form `{{hint:MyField}}` are not supported in srf.

#### HTML Stripping

Fields of the form `{{text:Expression}}` to strip HTML from the value are
not supported in srf.

#### Checking Your Answer

Fields of the form `{{type:Foreign Word}}` are not supported in srf.

#### Conditional Replacement

Sections bracketed by `{{#FieldName}}` and `{{/FieldName}}` do not work in
srf as in Anki. 

In srf, the section will not be displayed if the field value is false or an
empty list. If the value is a non-empty list, the section will be displayed
once for each value in the list, with the list element as context for
interpreting the field reference (i.e. the value should be a hash/object
with an attribute matching the field reference). If the value is not a list
and not false, the block will be rendered once with the value as context.

#### Cloze Templates
Cloze templates are not supported in srf.



## srf database

Initially I used a slight modification of the Anki database but
subsequently started over with a new, simplified database schema. Notes
here are incomplete and probably out of date. The database structure is
still evolving.

A fact set records a set of related facts as field/value pairs. These are
the essential items to be studied.

Templates produce cards from the fact sets. Each card has a front and a
back side. One views the front side then attempts to remember what will be
on the back side. The front and back sides are filled with static content
and the values of select fields.

Each fact set is related to one set of templates.

Each template is related to one set of templates.

Each set of templates has a set of fields that are used in rendering the
templates. These are the fields for which values may be stored in the fact
set.



These fact sets are presented in the form of cards, generated from the fact
sets by templates. Each template produces a front and back, each presenting
a different subset of the fields.

Each template consists of html for the front and back and common CSS.

A set of templates produces a set of cards. 

Each study item consists of a set of field/value pairs which record the
essential, related facts to be learned. Cards are generated from these
items by way of templates. Typically, a set of cards will be produced for
each item. 

## Anki database

Understanding details of the Anki database was essential to the initial
implementation of srf: it used a slightly modified Anki database. Anki
exports include a database that is similar but simpler than the database
used by Anki itself, but some of these details are still helpful to
interpreting the database in the export. The main advantage of the export
is that all data serialization is to JSON rather than rust serde.

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

### Anki source files

#### rslib/src/sched/cutoff.rs

This is a set of functions related to timing, including collection creation
time, days since creation, day rollover time, offset from UTC, etc.

This defines v1_create_date which is the last 4:00 a.m. local time before
the time the function was called.

#### rslib/src/storage/schema11.sql

This file contains SQL code to create the initial database, identified as
Schema version 11. When a new database is created, this is the first set of
tables, indexes, etc. created. Run from rslib/src/storage/sqlite.rs.

#### rslib/src/storage/sqlite.rs

This is code for low level database operations on the Anki database. A key
function is 'open_or_create_collection_db' which initializes the database
connection and 'open_or_create' which opens the database and creates Anki
tables as necessary according to the schema.

#### rslib/src/storage/upgrades/mod.rs

This defines upgrade_to_latest_schema and related constants
(SCHEMA_MIN_VERSION, SCHEMA_STARTING_VERSION and SCHEMA_MAX_VERSION) but
not the procedures for the actual upgrades.

### Anki Database Schema

Anki supports multiple database schemas, starting with schema 11.
Presumably there were earlier schemas, but current code doesn't deal with
them. When a new database is created, it begins as schema 11.

#### Schema 11
tables: col, notes, cards, revlog, graves. 

#### Schema 14

Add tables: deck_config, config and tags

Deck configuration is moved from serialized data in col.dconf to the new
deck_config table, one parameter per record, then col.dconf is cleared.
Note that the configuration is still serialized data. There is one record
per selectable deck configuration (deck type). My database has Default and
Hard.

Tags are moved from col.tags to the new tags table, one tag per record,
then col.tags is cleared.

Collection configuration is moved from col.conf to the new conf table, one
parameter per record, then col.conf is cleared.


#### Schema 15

Add tables: fields, templates, notetypes, decks, 

Note types are moved from col.models to the new notetypes, fields and
templates tables, then col.models is cleared.

Decks are moved from col.decks to the new decks table, then col.decks is
cleared.

Multiply deck initial ease * 100.

#### Schema 16

Divide initial ease of decks by 100 (revert change from Schema 15)

Change initial ease <= 1.3 to 2.5. and update cards with low eases.


#### col

Table col contains a single record with parameters of the entire
collection.

create table col
(
    id     integer primary key,
    crt    integer not null,
    mod    integer not null,
    scm    integer not null,
    ver    integer not null,
    dty    integer not null,
    usn    integer not null,
    ls     integer not null,
    conf   text    not null,
    models text    not null,
    decks  text    not null,
    dconf  text    not null,
    tags   text    not null
);

Fields:
 * id - always 1
 * crt - collection creation time in seconds since the epoch
 * mod - modification time in milliseconds
 * scm - schema modification time
 * ver - The database schema version
 * dty - 0
 * usn - 0
 * ls  - Last sync time in milliseconds
 * conf - serialized collection configuration, before conf table, now ''
 * models - serialized note types, before notetypes, now ''
 * decks - Empty string
 * dconf - serialized deck configuration, before deck_config, now ''
 * tags - serialized tags before tags, now ''

In schema 11, crt is the last 4:00 a.m. local time before the actual
creation time, as seconds since the epoch.

At database creation, scm is crt * 1000: that same 4:00 a.m. local time,
but milliseconds since the epoch.

#### notes

create table notes
(
    id    integer primary key,
    guid  text    not null,
    mid   integer not null,
    mod   integer not null,
    usn   integer not null,
    tags  text    not null,
    flds  text    not null,
    sfld  integer not null,
    csum  integer not null,
    flags integer not null,
    data  text    not null
);

Fields:
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

mid was model ID in Schema 11 but Schema 15 added table notetypes so now
mid is fk to notetypes, but without a name change (it really should be
ntid, or something like that).

#### cards

create table cards
(
    id     integer primary key,
    nid    integer not null,
    did    integer not null,
    ord    integer not null,
    mod    integer not null,
    usn    integer not null,
    type   integer not null,
    queue  integer not null,
    due    integer not null,
    ivl    integer not null,
    factor integer not null,
    reps   integer not null,
    lapses integer not null,
    left   integer not null,
    odue   integer not null,
    odid   integer not null,
    flags  integer not null,
    data   text    not null
);

Fields:
 * id - primary key
 * nid - fk to notes
 * did - fk to decks
 * ord - order among cards linked to same note
 * mod - card modification time
 * usn - something to do with syncing in Anki
 * type - 0: New, 1: Learn, 2: Review, 3: Relearn
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

#### revlog

create table revlog
(
    id      integer primary key,
    cid     integer not null,
    usn     integer not null,
    ease    integer not null,
    ivl     integer not null,
    lastIvl integer not null,
    factor  integer not null,
    time    integer not null,
    type    integer not null
);

#### graves

create table graves
(
    usn  integer not null,
    oid  integer not null,
    type integer not null
);




#### fields

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

From rslib/backend.proto:

```
message NoteFieldConfig {
    bool sticky = 1;
    bool rtl = 2;
    string font_name = 3;
    uint32 font_size = 4;

    bytes other = 255;
}
```

If sticky is true, then the input is not cleared on save when entering
notes. Default is false.

If rtl is true then the field text is right-to-left. Default is false.

Font name and size are for the Anki note editor. This doesn't affect
display of the note/cards. Default is Arial, 20.

Other is unknown. All I see is `{"media":[]}`.

srf uses ntid, ord and name, at least until I add a card/note editor.

Note that this table only holds field names and sort order. The values
are in the notes table: notes.flds, with all field values serialized into
the single field.

#### notetypes

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

#### templates

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

### fs and path
Dealing with file system. I haven't tried this on Windows. It probably
doesn't handle paths in a Windows compatible way, but it shouldn't take too
much work to make it compatible. It doesn't deal with files too much. On
the other hand, it's not a priority for me: I don't use Windows unless I
have to.

### timezonecomplete and tzdata
For some timezone and time data processing.

### uuid
For generating UUID/GUID.

### getopts
For command line argument processing. I tried a few. This one is simple and
adequate.

### json5
For parsing config file, which is JSON, but with support for comments.

### express
The is the web server framework. It handles parsing and routing of requests
and production of responses.

### serve-favicon
To serve a favicon.

### express-handlebars
This is template middleware for express. The website pages are generated
from handlebars templates.

### handlebars-form-helper
For dealing with form fields.

### mustache
Another template engine. This one is, by default, a bit more compatible
with the Anki templates. So, the Anki templates are processed by Mustache
and the web pages are then produced from Handlebars templates. Handlebars
documentation says that it is compatible with Mustache, so perhaps there is
a way to consolidate on just Handlebars, in which case Mustache can be
dropped.

### yauzl
For unzipping Anki export files.

### better-sqlite3
Interface to the SQLite database

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

## Motivation

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
and I should have been doing other things) for a couple of weeks, to adapt
my Anki scheduling add-on to more recent versions of Anki and, in
particular, to the shift of scheduling function to the back-end and
elimination of the hooks I had been using. While the outcome was some
improvement in the approach (necessity is the mother of invention, as they
say) overall the cost/benefit was not good.

It took me only three days to get this to the point I could get back to
studying - significantly less time than the last iteration of my Anki
add-ons, and I still didn't have the scheduling I actually wanted in Anki.
It has taken considerably longer to bring it to its current state, and it
still needs a lot of work, but it is good enough for my immediate needs.

With this, I can do whatever I want with scheduling, and I like this
schedule much more than the Anki scheduler, old or new. In particular, a
backlog of cards is easy to work through, as opposed to the 'ease hell' of
Anki. This is because of the prioritization of cards with shorter
intervals. It is not possible to become so overwhelmed and fail to make
progress, regardless of the backlog.

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

Subsequently, I have abandoned conversion of the Anki database. I have
written an import from an Anki export. The Anki export is similar to the
Anki database, but all the serialized data is JSON, which is much easier to
work with.

## Pros

* Pure JavaScript on Node
* Browser based
* Simple scheduler without the complexity of Anki queues
* SQLite3 database
* No obscure collation function in the database
* Import from Anki deck exports

## Cons

* Very little for configuration - need to edit the code for most changes
* No reports - just rudimentary stats to the browser or server console
* No decks, tags or flags - just one pool of cards
* Only simple text fields and media
