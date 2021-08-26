# srf
Spaced Repetition Flashcards,
based loosely on [Anki](https://github.com/ankitects/anki).

## Background
I used [Anki](https://github.com/ankitects/anki) for a couple of years but
wanted a better scheduler. An Anki addon to add a scheduler
was practically impossible and even simple modifications (e.g. [Anki -
limit new](https://github.com/ig3/anki-limitnew) was difficult and
excessivly time consuming to maintain due to frequent changes in the Anki
fundamentals. So I wrote this. It is much simpler than Anki
(i.e. has a small subset of Anki features) but the scheduler is much
better for my purposes: studying language.

## Getting Started

```
$ git clone https://github.com/ig3/srf.git
$ cd srf
$ npm install
$ node bin/cmd.js import <export file>
$ node bin/cmd.js
```
The import supports Anki exports and shared decks (.apkg files).

Browse to http://localhost:8000/.

The home page presents some basic study statistics:

 * The number of cards and minutes studied in the past 24 hours
 * The number of cards due and estimated minutes to study in the next 24
   hours
 * The percentage of correct responses (not 'Again') in the past 10,000
   reviews
 * The number of cards currently overdue (due more than 24 hours ago)
 * The number of cards due now
 * The time until the next card is due
 * A histogram of cards due in the next 24 hours

If there is a card available for study, the 'Study' button will appear.
Click it to study a card. After studying a card, the next card will be
presented, until there are no more cards to be studied and the home page is
displayed again.

Cards become due for review at random times. If you don't study them
immediately, they will accumulate, so you will sometimes have many cards
due for review. It's like an
[assembly line](https://www.youtube.com/watch?v=59BIB-2FVmM): you will
sometimes be waiting for the next card to study, and you will sometimes
have a backlog of cards to catch up. While you don't want to get too far
behind, it is OK to accumulate cards to review. Studying to clear the
backlog once per day will work well. While there is nothing wrong with
studying in multiple sessions each day, don't obsess about reviewing every
card that comes due each day. It is OK to leave them until the next day, or
even longer.

If your backlog of cards to study is too large, new cards will not be
presented until you clear your backlog. The system will match your study
capacity.

The data is in ~/.local/share/srf by default, including database (srf.db)
and media files. The database in ~/.local/share/srf/srf.db. Media files
must bein in ~/.local/share/srf/media.

## Command Synopsis

```
usage:
  srf --help
  srf [--directory <root-directory>] [--config <config-file>] [--database <database-name>] [--media <media-directory>]
  srf [--directory <root-directory>] [--config <config-file>] [--database <database-name>] [--media <media-directory>] import <filename>
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
    // The maximum interval until a card is due (seconds).
    maxInterval: 31536000,  // 1 year

    // The factor used to add dispersion to the interval.
    // Smaller values add more dispersion.
    intervalDispersionFactor: 50,

    // The maximum number of new cards in 24 hours.
    maxNewCards: 20,

    // Study time (seconds) per 24 hours beyond which no new cards are shown
    studyTimeLimit: 3600, // 1 hour

    // The maximum value factor may take.
    maxFactor: 10000,

    // The interval beyond which due times are rounded to the start of the
    // day, in seconds.
    dueTimeRoundingThreshold: 432000, // 5 days

    // again
    // The interval when again is selected, in seconds.
    againInterval: 10,
    // The minimum factor when again is selected.
    againMinFactor: 1500,
    // The sensitivity of factor to previous interval when again is selected.
    // The time constant of exponential decay towards maxFactor, in seconds.
    againIntervalSensitivity: 1814400, // 21 days

    // hard
    // The minimum interval when hard is selected, in seconds.
    hardMinInterval: 30,
    // The factor for adjusting interval when hard is selected.
    hardIntervalFactor: 0.5,
    // The minimum factor when hard is selected.
    hardMinFactor: 1500,
    // The change of factor when hard is selected.
    hardFactorAdjust: -50,

    // good
    // The minimum interval when good is selected, in seconds.
    goodMinInterval: 60,
    // The minimum factor when good is selected.
    goodMinFactor: 1100,
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

srf regulates overall workload by regulating the introduction of new cards.

All cards are initially considered to be 'new'. Technically, this is
determined by cards.interval being 0. After a card has been seen,
its interval is set to some non-zero value: the time, in seconds, until
the card is due to be seen again.

srf regulates the presentation of new cards based on actual study in the
past 24 hours and projected study in the next 24 hours, based on the number
of cards that will be due for review and historic average time per card. In
addition, if there are cards that were due more than 24 hours ago (for
example, after a study break of several days) new cards will not be
presented until the backlog is cleared. The target study time per day,
around which new cards are regulated, is 60 minutes per day, but
configurable in case you want to study more or less. Only the introduction
of new cards is regulated. There is no limit on reviews, other than the
time you choose to spend.


New cards are presented when:

 * There were no cards due more than 1 day ago (overdue) at start of day
 * Study time, past 24 hours, is less than studyTimeLimit
 * Estimated study time, next 24 hours, is less than studyTimeLimit
 * Estimated 5 day average study time is less than studyTimeLimit
 * There are no due cards or it is more than 5 minutes since last new card
 * There is a new card available

Estimates of future study time are based on number of cards due and average
time per card, per day, over the past 10 days.

The objective is to keep daily study time close to studyTimeLimit by
regulating the presentation of new cards. There is no limit on review of
due cards. Only new cards are limited.

Note that studyTimeLimit is a limit per 24 hours, not a limit per day. srf
considers study time in the past 24 hours and the next 24 hours from the
current time, without regard to what the actual time is, local time or day
boundaries.

In the event of a significant backlog of due cards (e.g. after not studying
for several days), no new cards will be presented until the backlog is
cleared.

In the event of an upcoming surge of due cards, no new cards will be
presented, even if current study time is low.


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

### Anki implementation

In Anki, the implementation of template rendering is split between pythong
and rust. While the form of the templates appears to be much like Mustache,
and there is at least one comment in the code that refers to the `{{` and
`}}` as mustaches, there does not appear to be an implementation of the
mustache templates included in the code, so the implementation is all
local. The rust code has comments that mention 'handlebars' but appears not
to use a handlebars package (crate or whatever the rust incantation is).

[Anki Scripting: Automate your flashcards](https://www.juliensobczak.com/write/2016/12/26/anki-scripting.html) is from 2016.
It doesn't mention the version of Anki investigated, but it is quite
different from Anki in 2021. Correlating with tags in the Anki git
repository, it would have been Anki 2.0.35 or earlier. There was a long
break from 2.0.35 (2016) to the next tag 2.1.0 (2018). None the less, there
is some good information here, including the comment: 'Anki uses a modified
version of Pystache to provide Mustache-like syntax.' Indeed, Anki 2.0.34
included a copy of pystache, with files not modified for 7 to 9 years.

Anki 2.1.0 updated the pystache readme to:

```
Anki uses a modified version of Pystache to provide Mustache-like syntax.
Behaviour is a little different from standard Mustache:

- {{text}} returns text verbatim with no HTML escaping
- {{{text}}} does the same and exists for backwards compatibility
- partial rendering is disabled for security reasons
- certain keywords like 'cloze' are treated specially
```

This persisted until Anki 2.0.52 (8 Mar 2020) but was removed from Anki
2.1.21 (9 Mar 2020), which is about when I started using Anki. My oldest
archive of the source is 2.1.16, Dec 22, 2019. 2.1 tags before 2.1.21 have
been removed, it seems. Anyway, the template folder was still present in
2.1.16 but gone by 2.1.28, my next archive. This was the beginning of the
pervasive changes, including the move to rust and fragmentation of the
implementations of various features that put me of developing Anki addons
or trying to improve the Anki scheduler. Quite an aside to templating, but
template rendering is just one more feature that is now fragmented between
python and rust code. And it seems no longer using anything like an
external implementation of mustache: the current implementation maintains
some of the syntax and semantics of mustache but the implementation is all
local to Anki, since about Anki version 2.1.28.


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

The type seems to relate to how scheduling is done, at least in the version
2 scheduler. For example, there are distinct 'schedules' for learning and
re-learning. These schedules are selected based on type, rather than queue.

In Anki, interval progresses through a series of values configured for new
and relearning (lapses). These series of steps are configured in deck
options: New Cards and Lapses tabs. A Lapsed card goes to relearn. 

Getting a card seems to be based on queue, rather than type. But when a
card is ansered, updating the interval seems to be based on type, not
queue. The card type is also used when creating and deleting filtered
decks.

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

##### type
type is an integer.

type can be:
 * 0=new,:
 * 1=lrn,
 * 2=rev,
 * 3=relrn.

From consts.py:
```
# Card types
CARD_TYPE_NEW = 0
CARD_TYPE_LRN = 1
CARD_TYPE_REV = 2
CARD_TYPE_RELEARNING = 3
```

The card type determines aspects of how the cards are scheduled.

The card type is not completely orthogonal to the card queue. The
relationship is obscure. Several of the decisions about scheduling are
based on the queue, rather than the type. But others are based on type.

When a card is answered, the first decision: to treat it as a learning card
or a review card, is based on queue. Many subsequent decisions are based on
type.

There is different configuration for learning and relearning cares. In deck
configuration, these are on tabs New Cards and Lapses. Each case has
different sequence of steps. New cards have two settings for initial
interval on graduation to review: Graduating interval and Easy interval.
Relearning cards (lapses) only have New interval, which is a percentage of
the previous interval.

If queue = `QUEUE_TYPE_LRN` or `QUEUE_TYPE_DAY_LEARN_RELEARN`, card is
rescheduled as a learning card: new or lapse according to type:
`CARD_TYPE_REV` and `CARD_TYPE_RELEARNING` are relearning, otherwise learning.
Relearning cards use settings from Lapse while learning cards use settings
from New Cards.

If type is `CARD_TYPE_NEW`, the card hasn't been seen before. On first view,
it is changed to `CARD_TYPE_LRN` and learning steps are initialized to the
first step from New cards configuration. This includes setting left.

If type is `CARD_TYPE_REV` or `CARD_TYPE_RELEARNING`, the card has lapsed.
Learning steps are from the Lapses configuration.

If type is `CARD_TYPE_LRN`, it progresses through the learning steps on Good,
until the last step, after which it is changes to `CARD_TYPE_REV` and ivl is
set to the Graduating interval. But on Easy, remaining learning steps are
skipped, type is changes to `CARD_TYPE_REV` and ivl is set to Easy
Interval.

##### queue
queue is an integer.

queue can be:
 * 0=new,
 * 1=(re)lrn,
 * 2=rev,
 * 3=day (re)lrn,
 * 4=preview,
 * -1=suspended,
 * -2=sibling buried,
 * -3=manually buried.

From consts.py:
```
# Queue types
QUEUE_TYPE_MANUALLY_BURIED = -3
QUEUE_TYPE_SIBLING_BURIED = -2
QUEUE_TYPE_SUSPENDED = -1
QUEUE_TYPE_NEW = 0
QUEUE_TYPE_LRN = 1
QUEUE_TYPE_REV = 2
QUEUE_TYPE_DAY_LEARN_RELEARN = 3
QUEUE_TYPE_PREVIEW = 4
```
If queue is 1, due is epoch seconds and within the current day.

If queue is 3, due is day number, counting from collection creation day.
This queue is used when the next (re)learning step is past the end of the
day, in which case there is no provision for scheduling a time within the
day. If one is studying near the end of the day, the next step may be one
second beyon the end of the day or one second less than 24 hours beyond the
end of the day and both cases are treated the same: the queue is set to 3
and card becomes due the next day. For example, the next steap may be 5
minutes (in the progression [1, 2, 5, 8, 10, 20] but if 5 minutes from now
is past the end of the day, due becomes 'next day'.


##### due
due is an integer.

If type is 0 (new) then due is the note ID or some other value used to sort
the new cards to order their presentation.

If type is 1 (learning) or 3 (relearning) then due is either epoch seconds
or day number according to queue = 1 (learning) or 3 (day learning)
respectively.

If type is 2 (review) then due is day number from collection creation day.

##### ivl
ivl is an integer.

ivl is the number of days between card reviews.

ivl is only relevant to review cards, which are scheduled according to the
SRS scheduling algorithm. Learning and relearning cards are scheduled
according to the steps in deck configuration for new and lapses: ivl is
irrelevant.

For a card that has never been reviewed (i.e. new or learning), ivl will be
0.

Once a card has progressed to the review queue, ivl will be set to the
interval in days. If it lapses, ivl is reduced by a configurable amount so
that after completing the lapse/relearning steps, it graduates with a
lesser interval. On graduation, the interval is what it was set to on
lapse, or one more than this if it graduated early by 'Easy'.

Initially, ivl is 0. It is set to the configurable graduating interval or
Easy interval when a card graduates from learning to review, according to
whether ease was Good or Easy. By default, Graduating interval is 1 day and
Easy interval is 4 days.

##### left
left is an integer value.

If type is 1 (CARD_TYPE_LRN) then left is initially set to the number of
learning steps (per deck configuration for new cards) + 1000 * the number
of steps that could be completed before the end of the day. The latter
depends on the current time, when the end of the day is and the size of
each step.

left = X + Y * 1000, where X is the number of learning steps still to be
completed (i.e. it is an index into the array of learning steps, but from
the end of the array instead of the beginning) and Y is the number of steps
that can be completed in the same day, at the time the card was scheduled,
given current time, time of end of day and the size of the remaining steps
to be completed.

As the card progresses through the learning steps, X is decremented and Y
is updated according to the time and step sizes.





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

#### id
integer

epoch milliseconds.

##### cid
integer

fk to cards.id

##### usn
integer

Something to do with syncing. -1 by default.


##### ease
integer

The button that was clicked on review 1, 2, 3 or 4 for Again, Hard, Good or
Easy.

##### ivl
integer

Negative value is seconds. Positive value is days since collection
creation day.

##### factor
integer

The factor for adjusting interval. 0 for non-review cards. This is 1000
times that multiplier (i.e. the new interval is the old interval * factor /
1000)

##### time
integer

Milliseconds spent viewing the card.

##### type
integer

Always 0???

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

I'm not the only one frustrated by Anki and writing an alternative. See
[Where Anki falls short](https://verbally.flimzy.com/pet-peeves-about-anki/)

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
