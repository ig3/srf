# srf
Web server providing
[Spaced Repetition](https://en.wikipedia.org/wiki/Spaced_repetition) Flashcards,
based loosely on [Anki](https://github.com/ankitects/anki).

## Installation

```
$ npm install -g @ig3/srf
```

## Operation

 1. Create some cards (see below)
 2. Run the server: `srf`
 3. Study: http://localhost:8000

The server listens on http://localhost:8000 by default.

### Create some cards

There are various ways to create cards:
 * Import Anki .apkg or .colpkg file
 * Import CSV files
 * Add them one at a time via the browser
 * Direct database update

Cards are the basic elements of study. They are produced from fieldsets,
transformed by templates.

A fieldset is a set of name/value pairs that you want to remember in
relationship to each other, stored as JSON.

For example:

```
{
  "Country": "Canada',
  "Capital": "Ottawa",
  "Continent": "North America"
  "Area': "over 9.98 million square kilometres",
  "Population": "38 million"
}
```

A template is a pair of Mustache templates for the front and back of a card
that include some of the fields in the fieldset, and some css for styling
the card.

For example:

```
Front: The <span class="keyword">capital</span> of {{Country}} is?
Back: {{Capital}}
css: .keyword { font-style: italic; }
```

A single template can be used to produce cards from many fieldsets.

Templates are grouped into sets identified by templateset name.

Each fieldset is related to a templateset and one card is produced for each
template in the templateset.

You study the cards. The cards are produced automatically when you add or
edit fieldsets or templates. They are presented for review at intervals
determined by the scheduling algoriithm, accoring to how you rate your
ability to recall them: Again, Hard, Good or Easy.

Each day, if your study workload isn't excessive, some new cards will be
presented for study. The number of new cards is regulated automatically. If
you have a large backlog: if you don't review all cards scheduled for
review in a timely manner or your study time exceeds your configured limits
(default: 1 hour), then no new cards will be presented. Otherwise, new
cards will be presented, up to the daily limit you configure (default: 20
new cards per day). But you can always choose to see new cards, regardless
of the algorithm: just click `New Card` on the home page.

Cards start as unseen cards. Then they are presented as new cards with a
short interval. Each time you review a card, its interval is adjusted
according to how you rate it: Again, Hard, Good or Easy. As you learn the
card the interval becomes longer until it becomes a mature card with a
maximal interval: review once a year, by default.

The order that unseen cards are presented as new cards is determined by
their ordinal (ord), which is copied from the fieldset.

It's all about the cards.

#### Create Cards by importing an Anki .apkg or .colpkg file

The easiest way to get started with srf is by importing an Anki
[Packaged Deck](https://docs.ankiweb.net/exporting.html). This will import
the Anki cards, notes and note types into srf.

If you have been using Anki, you can export your own decks. Be sure ti
include media when you export your decks. If you include scheduling
information, it will be preserved.

Anki collection packages and shared decks can include review logs. These
will be imported and merged with existing logs. Daily stats will be cleared
and recalculated to including the new revlog entries.

Otherwise, you can download a shared Anki deck from
[AnkiWeb](https://ankiweb.net/shared/decks/) or use various tools to
produce Anki Packaged Deck files from other sources.

Srf doesn't distinguish decks. If you import multiple decks or a deck
collection, all the cards will appear in a single pool in srf. If you want
to keep decks separate, you can import each deck into a separate srf
database.

Note that srf only supports simple cards. In particular, closures are not
supported. See below for what is/isn't supported. Start with something
basic.

To import an Anki packaged deck:

```
$ srf import <shared_deck.apkg>
```

To import an Anki deck collection:

```
$ srf import <deck_collection.colpkg>
```

#### Create Cards by importing CSV files

Create two CSV files:
 * templates.csv
 * fieldsets.csv

Import each file with:

```
$ srf import templates.csv
$ srf import fieldsets.csv
```

##### templates.csv

The templates determine which cards are produced and how the are presented.
One card is produced for each template with matching templateset value.

The fields for a template are:
 * templateset - the name of the templateset, must match same on fieldset
 * name - the name of the template
 * front - the mustache template code for the front of the card
 * back - the mustache template code for the back of the card
 * css - the CSS for rendering the card

Make a CSV file with these headings and appropriate data.

For example:

```
templateset,name,front,back,css
Basic,Card 1,{{Front}},{{Back}},".card { Background-color: red; }"
Basic,Card 2,{{Back}},{{Front}},".card { Background-color: red; }"
```

You can create many templatesets and each templateset can have as many
templates as you like. One card will be produced for each template with
templateset matching that of a fieldset.

##### fieldsets.csv

The fields for a fieldset are:
 * guid - optional guid that uniquely identifies the fieldset
 * templateset - the templateset for rendering the fieldset
 * fields - the fields data as a JSON string
 * ord - an ordinal number for sorting the fieldsets

guid will default to md5 checksum of the concatenation of the templateset
and fields values.

ord will default to the row number * 10.

For example:

```
templateset,fields
Test1,"{""Front"": ""Who you gonna call?"", ""Back"": ""Ghost Busters!""}"
Test1,"{""Front"": ""Where's Waldo?"", ""Back"": ""Hold on a sec... I'm still looking.""}"
```

You can have as many fields as you want in your templates and fieldsets.

Read below for details of all the options for the templates. They are
[Mustache](https://github.com/janl/mustache.js) templates with all the
field values available.

##### Add media files

If the fieldsets refer to media files (images, audio, video, etc.), you
will have to copy these to the media directory: ~/.local/share/srf/media by
default.

For example, a field might include an image with something like:
`<img src=\"my-image.png\" />`, or an audio file with something like:
`[sound:my-audio.mp3]`.

#### Create Cards Manually

You can create templates and fieldsets manually in the browser. I don't
recommend it. The UI is crude. But it's an option.

On the home page, click the Templates or Fieldsets buttons at the bottom of
the page to view, edit or add templates or fieldsets. Click an item in the
list to edit it or click the Add button at the top of the list to add a new
item.

Click Templatesets to view a summary of template sets, their fields and the
templates in them.

When you edit a fieldset, the fields you can set are determined from the
templates in the selected templateset: every field included in any template
in the templateset. You can't set fields that are not included in any
template. If you want to set another field, include it in at least one of
the templates.

#### Create Cards by direct database update

You can write your own application to add cards to the srf database.

By default, the srf database is ~/.local/share/srf/srf.db and media files
are in ~/.local/share/srf/media.

Add templates by adding records to the template table.

Add fieldsets by adding records to the fieldset table.

See [the database description](#srf-database) for a description of the database
and details of these tables.

After modifying template or fieldset tables, generate missing cards and
delete orphaned cards by running fix:

```
$ srf fix
```

### Run the server

```
$ srf
Listening on http://:::8000
```

Alternatively, create a systemd service file
(e.g. ~/.config/systemd/user/srf.service) similar to:

```
[Unit]
Description=Spaced Repetition Flashcards

[Service]
Type=simple
Restart=on-failure
WorkingDirectory=/tmp
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=srf
ExecStart=bash -l -c srf

[Install]
WantedBy=default.target
```

Then enable and run the service:

```
$ systemctl --user enable srf
$ ssytemctl --user start srf
```

With this done, your srf server will run whenever you login.


### Study!

Browse to [http://localhost:8000/](http://localhost:8000/)

The initial stats may not be correct. I don't spend much time looking at
them. Just click Study and you should get a new card. Once there is some
data, the stats should come right.

## Background
I used [Anki](https://github.com/ankitects/anki) for a couple of years but
wanted to change the scheduler. An Anki addon to add a new scheduler
was impossible because Anki addons are Python code but the scheduler
implementation is partially in Python and partially in Rust back-end code.
Even limited modifications to the existing schedulers
(e.g. [Anki - limit new](https://github.com/ig3/anki-limitnew))
were difficult and time consuming to maintain due to frequent changes
to the Anki internals. It was easier to write this and get the scheduler I
wanted than to maintain the Anki addon that provided only part of what I
wanted.

The srf scheduler:
 * prioritizes cards with shorter intervals over those with longer intervals
 * regulates the introduction of new cards to maintain constant study time
 * is written entirely in JavaScript and is easy to modify

srf is able to import Anki decks that use only basic features of Anki. Not
all field and media types are supported, but enough for many decks / cards
to work.

## Comparison to Anki

srf provides only a small subset of the features of Anki: enough for my
purposes: studying language on a single device, but without support for
synchronizing multiple devices or distinguishing decks / multiple topics of
study. 

The srf scheduler does not suffer from
[Ease Hell](https://readbroca.com/anki/ease-hell/).

The srf scheduler has an equivalent to Anki ease factor for each card
but it is simpler: it is the
[exponentially weighted moving average](https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average)
of the weighted answers. The default answer weights are 0, 1, 2 and 4 for
Again, Hard, Good and Easy and the default decay factor is 0.9, but these
are all configurable. By default, the range of the ease factor is 0.0
through 4.0: somewhat equivalent to Anki ease factors 0% to 400%. With srf
the ease factor never gets 'stuck' at an unreasonably low setting. It
always adapts to the recent ease of the card.

The srf scheduler does not suffer from
[Backlog Hell](https://iansworld-nz.blogspot.com/2022/04/anki-backlog-hell.html).

The srf scheduler sorts cards for review first by interval (shorter first)
then by due date. Thus you can review cards you are learning on time, even
when you have a backlog. This keeps learning optimal, which is the best way
to clear the backlog. Also, when you have a backlog, srf automatically
stops presenting new cards. No need to fuss with it. You can choose to
review new cards manually if you want, any time: backlog or not. But by
default you only see new cards if you are caught up with study.

## Getting Started

```
$ git clone https://github.com/ig3/srf.git
$ cd srf
$ npm install
$ node bin/cmd.js import <export file>
$ node bin/cmd.js
```
The import supports Anki exports and shared decks (.apkg files). When I
migrated from Anki, I exported all decks as an Anki deck package (\*.apkg),
including media, then imported this into srf.

Browse to http://localhost:8000/.

### Home Page
The home page presents some basic study statistics:

 * The number of cards reviewed and minutes studied in the past 24 hours
 * The number of cards due and estimated minutes to study in the next 24
   hours
 * Daily study time averaged over the past 14 days
 * The percentage of correct (not 'Again') responses to mature cards in the
   past 14 days
 * The number of cards currently overdue (due more than 24 hours ago)
 * The number of cards due now
 * The number of new cards seen in the past 24 hours and the number
   remaining to be seen, should workload permit: (config.newCardLimit - the
   limit on new cards in the past 24 hours)
 * The time until the next card is due
 * A histogram of study time per hour through past and next 24 hours

If there is a card available for study, the 'Study' button will appear.
Click it to study a card. After studying a card, the next card will be
presented, until there are no more cards to be studied and the home page is
displayed again. Alternatively, click the space bar: shortcut for Study.

The scheduler determines when a card is due to be studied. Each time a card
is reviewed, the scheduler sets a new time when it is due to be studied
again. The cards to be studied are all those which are past their due date
and time. If it is more than 24 hours past their due date and time, they
are considered overdue. 

It's like an [assembly line](https://www.youtube.com/watch?v=59BIB-2FVmM):
you will sometimes be waiting for the next card to study, and you will
sometimes have a backlog of cards to catch up. While you don't want to get
too far behind, it is OK to accumulate cards to review. Studying to clear
the backlog once per day will work well. While there is nothing wrong with
studying in multiple sessions each day, don't obsess about reviewing every
card that comes due each day. It is OK to leave them until the next day, or
even longer.

The data is in ~/.local/share/srf by default, including database (srf.db)
and media files. The database is ~/.local/share/srf/srf.db. Media files
are in ~/.local/share/srf/media.

#### Buttons

##### New Card

Study a new card, regardless of study time and number of new cards studied.

##### Admin

View the admin page, with links to administer templates, template sets and
field sets, and view configuration.

##### Stats

View the statistics page.

##### Help

This will be documentation, if I ever write it.

### Admin
Links to the administration pages:

#### Templates

View a list of all templates in the system. Click on a template to edit it.

Each template is linked to a template set and should have a unique name
among the templates linked to that template set. There are three
attributes:

Front: handlebars template code for the front of the card.

Back: handlebars template code for the back of the card.

CSS: CSS that will be loaded to the front and back.

All the fields of the template/fieldset are available. For example, if the
fieldset includes a field `English` then include this in the template with
`{{English}}`.

The set of fields are defined in the template set definition.

#### Template Sets

View a list of all template sets in the system.

The view is read-only. To change them, add or edit the templates.

The fields of a templateset are all the fields of all the templates in the
templateset. If you add a field to one of the templates, it will be added
to the templateset.

#### Field Sets

View a list of all field sets in the system. Click on a field set to edit
it. Click the New button to add a field set.

A field set is a collection of field values that populate cards. The set of
fields is defined in the linked template set.

Each fieldset must be linked to a Template set. The set of fields is
defined in the template set. If you change the template set after setting
field data, the field data will be lost.

To attach media files, put the cursor into the field value input where the
media file is to be attached, then click the Attach button and select the
file containing the media data.

At the moment, the only supported media types are image/jpeg and
audio/mpeg. These are inserted as img tags and `audio` respectively.

#### Config

A read-only view of the loaded configuration.

### Stats Page

The Stats Page is available from the Home Page by clicking the Stats
button. It shows some basic statistics about study performance.

#### New cards per day

This is the average number of new cards per day since the start of study.

#### Cards seen

This is the total number of distinct cards that have been seen at least
once since the start of study.

#### Mature cards

This is the total number of cards with interval greater than
config.matureThreshold.

#### Percent Correct

This is the percentage of 'correct' responses (a.k.a. not Again) for cards
with intervals between config.matureThreshold and config.maxInterval,
reviewed in the window config.percentCorrectWindow.

Cards with maximum interval are excluded on the premise that they are
mastered and it is not performance on these cards that should be regulated,
but rather performance on mature cards (Unconcious Competence). 

Maybe this should also include the learning cards, but these are excluded
on the premise that while learning the error rate will be relativley high
and the regulation effectively regulates how quickly cards progress through
learning to mastered, even though the learning cards are not included in
the calculation of percent correct.

#### Correct factor

This is the factor for calculation of new card intervals for ease Good or
Easy, based on Percent Correct Vs config.percentCorrectTarget.

#### Card views today

This is the total number of views today, including multiple reviews of a
card.

#### Cards due later today

This is the number of cards due to be reviewed in the remainder of the day.

#### Average time per review

This is the average time for each review of a card. It includes small gaps
between reviews. It is the total study time for the day divided by the
number of reviews.

#### Study time today

This is the total time spent studying today.

#### Average time per day

This is the average total study time per day, averaged over the past 14
days.

#### Next card due in

The time until the next card is due for review.

#### Charts

##### Card Views per day

This is the total number of card views each day since the start of study.

##### Minutes Studied per day

This is the total study time per day since the start of study.

##### Cards Due per day

This is the number of cards due for review each day, looking forward from
today.

##### Cards per interval

This is the number of cards with the given interval in days. There are two
lines: Adjusted Interval and Unadjusted Interval. The Adjusted Interval is
the interval after adjustment for percent correct. The Unadjusted Interval
is the interval as set when the card was last viewed. The adjusted interval
is the interval that will be the basis for calculation of the interval
after the next review.

##### New Cards per day

This is the number of new cards presented each day since the start of study

##### Matured & Lapsed

This is the number of cards matured, lapsed, net change and cumulative per
day since the start of study.

## Command Synopsis

```
usage:
  srf --help
  srf [options...] [run]
  srf [options...] import <filename>
  srf [options...] backup
  srf [options...] fix
```

### run

Run the server. This is the default.

### import

Import an Anki apkg or colpkg file, or a csv file containing template or
fieldset data.

### backup

Create a backup of the srf database.

The server makes a backup of the database each time it starts and then once
every 24 hours if it runs that long.

The backups are in the same directory as the database, with timestamp
appended to their name.

### fix

This performs several 'fixes':

 * create any missing cards from fieldsets and templates and delete any
   cards for which there is no longer a fieldset and template.
 * fix revlog entries:
   * make revlog IDs unique
   * set 'lastinterval' to 'interval' of the previous revlog entry for the
     card
   * set 'interval' of the last revlog entry for a card to the 'lastinterval'
     of the card

### options

#### --help|-h
Display usage and exit.

#### --port|-p
Set the port that the srf server listens on.

Default is 8000.
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

#### --media
Set the path of the media directory.

Default is `media`

If the given path is absolute (i.e. begins with '/') it is used as given.
If it is relative (i.e. does not begin with '/') it is relative to the path
of the --directory option.

The directory is created if it doesn't exist.

#### --htdocs
Set the path of the htdocs directory.

Default is `htdocs`

If the given path is absolute (i.e. it begins with '/') it is used as
given. If it is relative (i.e. does not begin with '/') it is relative to
the path of the --directory option.

This directory contains overrides for the static content of the srf server.

 * css/dark.css
 * img/dark-go.png
 * img/dark-slow.png
 * img/dark-stop.png
 * img/favicon.png
 * img/logo.png
 * js/plotly-latest.min.js
 * js/sorttable.js

#### --views
Set the path of the views directory.

Default is `views`

If the given path is absolute (i.e. it begins with '/') it is used as
given. If it is relative (i.e. does not begin with '/') it is relative to
the path of the --directory option.

This directory contains overrides for the handlebars templates of the srf
server. Templates in this folder will override the default templates.

 * back.handlebars
 * fieldset.handlebars
 * front.handlebars
 * help.handlebars
 * home.handlebars
 * stats.handlebars
 * template.handlebars
 * templates.handlebars

### Config

Configuration files may be put in several places:

 * /etc/srf
 * /etc/srf.ini
 * /etc/srf.json
 * /etc/srf/config
 * /etc/srf/config.ini
 * /etc/srf/config.json
 * ~/.config/srf
 * ~/.config/srf.ini
 * ~/.config/srf.json
 * ~/.config/srf/config
 * ~/.config/srf/config.ini
 * ~/.config/srf/config.json
 * ~/.srf
 * ~/.srf.ini
 * ~/.srf.json
 * ~/.srf/config
 * ~/.srf/config.ini
 * ~/.srf/config.json
 * .srf
 * .srf.ini
 * .srf.json

And, finally, `config.json` in the directory containing the data
(~/.local/share/srf by default but may be set by option --directory).

Files with extension `.json` and files without extension are parsed as JSON
after stripping comments from them.

Files with extension `.ini` are parsed as `ini` files.

Parameters which are durations may be specified as integer seconds or a
string with units: `seconds`, `minutes`, `hours`, `days`, `weeks` or
`years`, or any prefix of one of these. The units may be separated from the
number by spaces.

For example:
 * 10 // 10 seconds
 * "10 seconds"
 * "5 days"
 * "1 day"
 * "1 d"
 * "1d"

Other parameters are integers.

For example, a json file might be:

```
{
  // Minimum time between related cards (seconds)
  "minTimeBetweenRelatedCards": "5 days"

  // Window (seconds) to look ahead for due cards
  "previewWindow": 0,

  // Backup retention time (milliseconds)
  "backupRetention": "7 days",

  // Minimum number of backups to keep
  "minBackups": 2,

  // Maximum number of backups to keep
  "maxBackups": 10,

  // The maximum time for viewing a card (seconds).
  // Beyond this, any answer is converted to 'again'
  "maxViewTime": "2 minutes",

  // The maximum interval to when a card is due.
  "maxInterval": "1 year",
  "maxGoodInterval": "1 year',
  "maxEasyInterval": "1 year",

  // The interval (seconds) beyond which a card is considered 'mature'
  "matureThreshold": "21 days",

  // The window (seconds) in which to average Percent Correct reviews
  "percentCorrectWindow": "14 days",

  // The interval (seconds) between correct factor adjustments
  "correctFactorAdjustmentInterval": "1 day",

  // The factor used to add dispersion to the due time.
  // As percentage of the total interval.
  "dispersionFactor": 5,

  // The maximum number of new cards in 24 hours.
  "newCardLimit": 20,

  // The mimimum percentCorrect for new cards to be presented
  "newCardMinPercentCorrect": 75,

  // Study time (seconds) per day beyond which no new cards
  "studyTimeLimit": "1 hour",

  // The maximum value factor may take.
  "maxFactor": 10000,

  // minimum intervals according to responses to reviews
  "againMaxInterval": "1 day",
  "hardMinInterval": 30,
  "goodMinInterval": 60,
  "goodMinFactor": 1.1,
  "easyMinInterval": "7 days",

  // Static interval factors
  "againFactor": 0.1,
  "hardFactor": 0.5,
  "goodFactor": 1.0,
  "easyFactor": 1.5,

  // Answer weights
  "weightAgain": 0,
  "weightHard": 1,
  "weightGood": 2,
  "weightEasy": 4

}
```

#### theme

default: dark

There is only one theme: dark. But this is only a CSS file. This setting is
just the name of the CSS file, less the `.css` extension.

#### minTimeBetweenRelatedCards (seconds)

default: 5 days

A template set typically contains several templates. For each field set, a
card will be produced for each template in the template set. Thus there
will be several cards for each field set.

The set of cards from a single field set are considered related. If one
card from the set is reviewed, this is the minimum time before any other
card from the set will be presented for review.

#### previewWindow (seconds)

default: 0

This is the interval to look ahead of current time for due cards. If this
is 0 then only cards currently due will be presented for review but if this
is greater than 0 then cards due up to this many seconds in the future will
be presented for review. This will cause cards to be reviewed before their
due time, somewhat defeating the spaced repetition algorithm but only
within the window.

The idea was to allow study until there were no cards due 'soon' (i.e. in
the preview window) then take a break from study. It doesn't work well and
I will probably remove this. I set this to 0 - disabling the feature by
default.

####  backupRetention

default: 30 days

The time to retain database backups. Backups older than this will be
deleted.

#### minBackups

default: 2

The minimum number of backups to retain, regardless of their age.

#### maxBackups

default: 10

The maximum number of backups to retain, regardless of their age.

#### maxViewTime (seconds)

default: 2 minutes

The maximum time for viewing a card. If a card is viewed for longer than
this ease will be forced to 'again'.

#### maxInterval (seconds)

default: 1 year

The maximum interval (time until next review) for a card. Note that the
actual maximum time until next review can be a bit larger than this due to
dispersion of due times.

#### maxGoodInterval (seconds)

default: 1 year

The maximum interval (time until next review) for a card that is Good.

#### maxEasyInterval (seconds)

default: 1 year

The maximum interval (time until next review) for a card that is Easy.

#### learningThreshold (seconds)

default: 1 week

The interval beyond which cards are considered to be 'learning' cards
rather than 'new' cards. Beyond this threshold, they are scheduled
according to the actual interval since they were last reviewed, rather than
the scheduled interval.

#### matureThreshold (seconds)

default: 21 days

The interval beyond which cards are considered 'mature'. This doesn't
affect reviews. It only affects some of the statistics.

This affects the calculation of Percent Correct, which is compared against
percentCorrectTarget. Only review of cards with an interval greater than
matureThreshold are considered in calculating Percent Correct.

A card is considered lapsed if its interval changes from longer than
matureThreshold to shorter than matureThreshold.

A card is counted as mature (Unconcious Competence) or mastered if its
interval is greater than matureThreshold.

#### percentCorrectWindow (seconds)

default: 1 month

The percentage of 'correct' responses (not 'Again') is a factor in
determining the intervals of cards. All responses within this window are
considered in determining the percentage. Results of reviews longer ago
than percentCorrectWindow are ignored.

#### minPercentCorrectCount

default: 10

The minimum number of mature cards in the percent correct window at which
percent correct is calculated.

#### percentCorrectTarget (percent)

default: 90

The percentage of 'correct' responses (not 'Again') is a factor in
determining the intervals of cards. The percentCorrectTarget is the target
percentage of 'correct' responses.

The interval and due date of cards are adjusted according to the difference
between the Percent Correct and this target, multiplied by
percentCorrectSensitivity.

Cards actually have two interval values: interval and lastinterval. The
interval value is the interval, including any adjustments. The lastinterval
value is what the interval was when the card was last reviewed, without any
adjustments.

Revlog also has two interval values: interval and lastinterval. But here
their values are different. The value of interval is the new interval of
the card, after review, based on the ease. The value of lastinterval is the
unadjusted interval of the card the last time it was reviewed. It is used
to determine if the card has matured or lapsed. It is redundant with the
interval value of the previous revlog record for the card but saves a lot
of lookup producing the statistics.

#### percentCorrectSensitivity

default: 0.0001

This determines the sensitivity to the difference between Percent Correct
and percentCorrectTarget, when adjusting the interval and due date of
learning and mature cards.

#### correctFactorAdjustmentInterval (deprecated)

This is no longer used.

default: 1 day

The correct factor is one of the factors used to determine the intervals of
cards. This is the minimum time between adjustments of this factor.

  // The factor used to add dispersion to the due time.
  // As percentage of the total interval.

#### dispersionFactor

default: 5

The dispersion factor is used to add a random amount to the interval when
calculating the next due time of a card. This randomization helps to avoid
cards always appearing together, even if they always get the same response.
It is a percentage of the interval.

#### newCardLimit

default: 20

The maximum number of new cards to be presented within 24 hours.

#### newCardMinPercentCorrect

default: 75

The minimum value of percentCorrect for viewing new cards.

#### studyTimeLimit

default: 1 hour

If the time spent studying during the past 24 hours or the estimated time
to study cards due in the next 24 hours exceeds this limit then new cards
will not be presented.

#### againMaxInterval (seconds)

default: 1 day

The maximum interval for cards after response 'Again'.

#### hardMaxInterval (seconds)

default: 1 week

This is the maximum interval after responding 'Hard' to a review.

#### goodMinInterval (seconds)

default: 60

This is the minimum interval after responding 'Good' to a review.

#### goodMinFactor 

default: 1.1

This is the minimum interval multiplier after responding 'Good' to a review.

#### easyMinInterval (seconds)

default: 1 day

This is the minimum interval after responding 'Easy' to a review.

#### againFactor

default: 0.3

After responding 'Again' to a review, the new interval is the previous
interval multiplied by this factor, but with a maximum of againMaxInterval
which, by default, is 1 day.

#### hardFactor

default: 0.5

After responding 'Hard' to a review, the new interval is the previous
interval multiplied by this factor, but with a maximum of hardMaxInterval
which, by default, is 1 week.

#### goodFactor

After responding 'Good' to a review, the new interval is the previous
interval multiplied by this factor, the card factor and the 'correct'
factor. See 'scheduler' below for details.

#### easyFactor

After responding 'Easy' to a review, the new interval is the interval for a
'Good' response multiplied by this factor.

#### weightAgain

default: 0

The weight of an answer of Again when calculating the exponentially
weighted moving average of review replies: the card ease factor.

#### weightHard

default: 1

The weight of an answer of Hard when calculating the exponentially
weighted moving average of review replies: the card ease factor.

#### weightGood

default: 2

The weight of an answer of Good when calculating the exponentially
weighted moving average of review replies: the card ease factor.

#### weightEasy

default: 4

The weight of an answer of Easy when calculating the exponentially
weighted moving average of review replies: the card ease factor.

#### decayFactor

default: 0.95

The decay factor when calculating the exponentially weighted moving average
of review replies: the card ease factor.

ewma(n) = w(n-1) * decayFactor + w(n) * (1 - decayFactor)

### Commands

#### run

Run the web server. This is the default command (i.e. if srf is run without
specifying a command on the command line, it runs the webserver).

#### import \<filename>

Import an Anki export (i.e. a .apkg file). This is the primary way to get
cards into srf. To migrate from Anki to srf, export decks from Anki,
including media, and then import them to srf. Exporting all decks works.

#### fix

Fix a few inconsistencies in revlog:

 * duplicate IDs
 * inconsistency between interval and lastinterval
 * inconsistency between interval and card interval

This isn't necessary but it ensures greater consistency between the various
srf metrics, particularly related to matured cards.

## Study

When you study a card, its front side will be presented. 

Review the front side and try to recall the corresponding back side.

When you are ready, click the Flip button or click the space bar (shortcut
for Flip).

The back side of the card will be displayed, with buttons to indicate how
well you remembered the card:

 * Again: you didn't remember the card - you need to see it again soon
 * Hard: you remembered the card but it was a bit hard to recall
 * Good: you remembered the card 
 * Easy: you remembered the card but it was too easy

What you should remember, when you see the front side, and what constitutes
an adequate recollection is up to you. Some cards may be very specific and
fact based while others might be more vague or conceptual. It's up to your
own judgement.

Keyboard shortcuts for these are 'j', 'k', 'l' and ';' respectively. These
are hard coded, but it is easy to edit the templates in the views directory
if you want different shortcuts.

The card is then scheduled for review according to which button you
clicked.

If there is another card due for study, the front of it is displayed and
you continue your study.

If there are no more cards to be studied at this time the home page is
displayed. You can review your progress and return to study when additional
cards come due for study.

Every card that is not 'new' has a time when it is due. If this is before
the current time, you may study the card. If it is in the future, you may
not study the card. You must wait until the card is due for review to study
it.

The only exception is new cards. They don't have a due time. Instead, they
are presented when study time does not exceed configured limits, up to a
maximum number of new cards per day.

## Card Lifecycle

Cards progress through the following stages:
 * unseen / unconcious incompetence / UI
 * new / concious incompetence / CI
 * learning / concious competence / CC
 * mature / unconcious competence / UC
 * mastered / mastery / M

### Unseen / unconcious incompetence / UI

When you add cards to srf, initially they are unseen. If you add a thousand
cards, you probably don't want to study them all on the day you add them.
Most of them remain unseen for some time before they are presented as new
cards.

If you look at the database. These unseen cards will have an interval of 0.
Cards that have been seen have an interval greater than 0. Even if these
cards have a due time set, the due time is ignored until they are selected
to be presented as new cards.

### New / concious incompetence / CI

Eventually an unseen card is presented for study for the first time,
becoming a 'new' card. It is deemed to be a new card until its interval
reaches the learning threshold (config.learningThreshold).

At this stage, your ability to remember the card might be quite volatile.
On the one hand, the novelty of it might make it easier to remember. On the
other hand, the unfamiliarity of it might make it harder to rememger.

New cards are scheduled according to their scheduled interval, not the
actual interval since they were last studied. If a card has a scheduled
interval of 30 minutes but you don't study overnight so you don't see it
until 10 hours later, it is scheduled on the basis of the scheduled 30
minute interval, not the 10 hour interval.

### Learning / concious competence / CC

After familiarizing with a new card, the real work of committing it to long
term memory begins. Intervals are still fairly short and your ability to
recall the card might be quite sensitive to the actual interval. Reviewing
the card a few days late might make the card much more difficult to recall.

During this phase, the card is scheduled according to the actual interval
since last review. If you don't review it on time (maybe because of exams
or vaction) but when you do you recall it well, it is the actual interval
through which you were able to recall it that matters.

### Mature / unconcious competence / UC

Eventually the card is well committed to long term memory. When you see the
card, you recognize it immediately, without having to think about it. The
the exact interval doesn't make much difference.

By default, cards are considered mature when their interval reaches 21
days. The scheduling algorithm is still applied and the interval will still
gradually increase, up to the maximum interval (config.maxInterval) which,
by default, is one year.

### Mastered / mastery / M

Finally, cards reach the interval limit. They are mastered. 

By default, the interval limit is 1 year (config.maxInterval). 

## Scheduler

There are two aspects to the scheduler:

 1. Determining when a card is due for review
 2. Determining which card is to be studied next

### Determining when a card is due to be studied

Cards that have been viewed at least once have a time that they are due for
review. Technically, this is stored in the database as a date and time in
UTC timezone.

Cards that have never been viewed are called 'new' cards. They do not have
a time that they are due for review. They have not been viewed and
therefore cannot be reviewed, until after they have been viewed for the
first time. For details of when new cards are first presented, see the next
section. 

The timing, from one review to the next, is the spacing of spaced
repetition. The theory is that there is an optimum interval that minimizes
the total number of reviews required until a card can be remembered
indefinitely: until it has been learned. If the interval is too long, the
card is forgotten before it is reviewed: it is not learned. If the interval
is too short, the card is easily remembered but reviewing the card too
often wastes time that could be used to learn other cards.

Each time a card is studied, whether it is its initial viewing or a later
review, the ease with which it was remembered is rated by clicking one of
four buttons: Again, Hard, Good or Easy. The card is then scheduled for
review, sooner or later, according to the ease with which it was
remembered.

The interval to the next review is determined based on the ease of the
current and past reviews, and a factor that is adjusted to achieve an
overall 90% successful review of mature cards. 

(Almost) All the scheduling parameters are configurable. The following sections
describe the default configuration.

#### Again

This is for cards that you could not remember: that you want to see again
sooner rather than later. The card is scheduled to be reviewed in 30% of
the time since it was last reviewed, with a maximum of 1 day.

For example, if you last reviewed a card 1 hour ago but couldn't remember
it, it will be scheduled for review in 18 minutes. If you can't remember it
again after 18 minutes then it will be scheduled for review in about 5
minutes.

But there is a maximum interval. If it is more than 3 weeks since you last
reviewed the card, the new interval will be 1 week.

Cards that were easily remembered at a long interval might become
difficult. For example, other similar cards may have been introduced,
leading to confusion. This might make the old card difficult until it can
be reliably distinguished from the new one.

#### Hard

This is for cards that you could remember but they were too hard: it was
too long since the last review and you want to see the card again sooner.
The card is scheduled to be reviewed in 50% of the time since it was last
reviewed, with a maximum of 1 week.

For example, if you last reviewed a card 10 days ago but found it hard,
then it will be scheduled for review in 5 days.

#### Good

This is for cards that you could remember well: the timing since the last
review was good - it was not too hard and not too easy. The card will be
scheduled for review after a longer interval.

For new cards (scheduled interval is less than config.learningThreshold),
the previous schduled interval is used to calculate the new interval. For
learning and mature cards, the actual interval since last review is used.
This only makes a difference if there is a delay from scheduled review to
actual review. The principle is, if you still remembered it well after a
longer interval than scheduled, then use that longer interval to calculate
the next interval.

The new interval is the greater of:
 * config.goodMinInterval
 * the previous interval multiplied by config.goodMinFactor
 * the previous interval multiplied by the product of
config.goodFactor and the card ease factor.

The card ease factor depends on how easy the card is. It accommodates the
fact that some cards are easier than others and that the ease of a card
varies with time. It is an exponentially weighted moving average of
response values.

##### Card Ease

The card ease factor is an exponentially weighted moving average of the
weighted response values for the card. The weights are 0, 1, 2 and 4 for
Again, Hard, Good and Easy respectivley. The decay factor is 0.9.

The card ease factor is dominated by performance on recent reviews. Older
reviews quickly become insignificant. But there is some 'history': the
factor is larger for cards that have consistently been Good or Easy and
smaller for cards that have consistently been Again or Hard. A mix of
replies will result in an intermediate ease factor.

The range of the card ease factor is 0 to 4. It is a simple multiplier for the
interval. If you keep choosing Again, the factor will drop to 0. If you
consistently click Good, the factor will rise to 2: the interval will
double after each review. A mix of Good and Hard will result in a factor
between 1 and 2, resulting in a slower increase in the interval.

The card ease factor begins at 0 for a new card but will quickly climb with
a few Good answers. It is expected that it will typically be between 1 and
2 for a card past the initial learning phase.

The card ease factor is specific to the card. Each card has its own history
of answers and its own ease factor. This addresses the issue that some
cards are harder or easier than others. This will be reflected in
their individual histories of answer and resulting ease factors. On the
other hand, cards that were hard will generally become easy with practice
and familiarity: they don't stay hard forever. On the other hand, a card
that was easy may become hard if other, similar new cards are introduced:
it may take time to learn the subtle differences and avoid confusing them.
Thus the card ease factor is specific to each card and changes as your
success recalling the card changes. And the ease factor changes how quickly
the interval grows: from quite slowly (card ease factor around 1) to quite
quickly (ease factors closer to 2 or more).

#### Easy

For cards that you remember very well: the time since the last review was
too short and you don't want to see the card again so soon.

The interval is changed by a factor that is 1.5 times the factor that would
have been used if the answer had been Good, with a minimum interval of 1
day and maximum of 1 year.

For example, if the interval since the last review was 1 day and for Good
the factor would have been 2, resulting in a new interval of 2 days, the
factor for Easy would be 3 (2 * 1.5), resulting in a new interval of 3
days.

### Determining which card is to be studied next

When you study cards, the scheduler determines which card is to be studied
next. There are two possiblities:

 1. a new card: a card that has not been studied previously
 2. a card that has been studied previously and is now due for review

The objective of the scheduler is to introduce as many new cards as
possible, without causing overload: failure to review all cards that are
due for review.

### New Cards

Cards that have never been studied are 'unseen' cards. But eventually they
are selected to be presented for study: they become a 'new' card.

A new card is presented for study if:

 * Study time is less than config.studyTimeTarget, including:
   * total study time in the past 24 hours
   * average study time per 24 hours in the past 14 days
   * estimated total study time in the next 24 hours
   * estimated average study time per 24 hours in the next 5 days
 * There are no cards due more than 24 hours ago (i.e. overdue)
 * Total new cards in the past 24 hours is less than config.newCardLimit
 * percentCorrect is at least config.newCardMinPercentCorrect
 * There is no card due for review or it is more than 5 minutes since the last new card was presented

This regulates the introduction of new cards to maintain daily study time
close to config.studyTimeTarget. If study time falls below the target, more
new cards are introduced, up to the daily maximum. If study time exceeds
the target, no more new cards are presented, allowing you to focus on
learning the cards already seen without becoming overloaded.

Estimates of future study time are based on number of cards due and average
time per card, per day, over the past 10 days.

Note that studyTimeTarget is a limit per 24 hours, not a limit per day. srf
considers study time in the past 24 hours and the next 24 hours from the
current time, without regard to what the actual time is, local time or day
boundaries.

In the event of a significant backlog of due cards (e.g. after not studying
for several days), no new cards will be presented until the backlog is
cleared: there are no overdue cards and study time in the past 24 hours is
less than the target.

In the event of an upcoming surge of due cards, no new cards will be
presented, even if current study time is low.

New cards start with a minimal interval. If they remain hard, the interval
will continue minimal, until you have reviewed the card enough times to
begin to recall it. Once you start clicking Good or Easy, the card's ease
factor will increase and the rate of increase of the interval will increase
accordingly. If the interval doubles at each review, with a series of Good
responses, it will soon be many days between reviews. If the card is easy
and the reviews become tedious, an answer of Easy will increase the
interval more quickly, with a minimum of at least 1 day, and faster
increases going forward.

### Review Backlog

It is normal to have a small backlog: a set of cards due to be studied. The
only way to avoid it is to be studying all day: studying each card as soon
as it is due. But this is impractical.

If you have one study period each day (a perfectly reasonably schedule)
then you will start each day with a small backlog: cards that came due
since you finished studying the previous day.

If you take a vaction (lucky you!), are busy with exams, work or other
priorities, you might not study for a few days or a few weeks. When you
return to study, you might have a large backlog: many cards due to study.

The scheduling algorithm makes it easy to work through the backlog, whether
it is small or large.

When there is a set of cards due for review, the scheduler prioritises the
cards with the shorter intervals. You will see short interval cards as soon
after they are due as possible. Cards with longer intervals will be
deferred until you have learned the cards with shorter intervals. In this
way, the backlog will not interfere with review of the cards you are just
learning: you will continue to learn effectively.

If your backlog is too large, you may not be able to review all due cards
in a day. It may take you several days to catch up. The scheduler will cope
with this, continuing to prioritise the cards you are just learning. You
may have to increase your daily study time a bit to catch up, but there is
no need to catch up in a single day. You can work your way through the
backlog over a few days.

While you have a backlog (cards that were due more than 24 hours ago) no
new cards will be shown. There is no value in making the backlog larger.
You can return to learning new cards after you clear your backlog.

But, of course, this is up to you. There is a New Card button on the home
page. You can click this any time you like to view a new card, regardless
of how larger, or small you backlog is. The New Card button will present a
new card regardless of all the automatic limits on new cards.


## Templates

Card templates are rendered with
[Mustache.js](https://github.com/janl/mustache.js), with a custom `escape`
function to:

 * render `[sound:<media filename>]` as an audio tag
 * pass all other text unaltered (i.e. HTML is NOT escaped)

The templates are rendered with the note fields as context.

This is compatible with
[Anki templates](https://docs.ankiweb.net/templates/intro.html)
for simple templates but only a small subset of Anki template features are
supported.

Note: because field values are rendered without escaping, malicious decks
may inject arbitrary content into the browser. Review the content of decks
carefully before importing them.

Page templates are rendered with [handlebars](https://handlebarsjs.com/). 
I might have used handlebars throughout but I have some templates with
spaces in the key names (e.g. `{{Some Key}}`): mustache supports this but
handlebars does not. It isn't obvious that this is an intentional feature
of mustache. I don't see an explicit test to ensure it works.

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

In Anki, the implementation of template rendering is split between python
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
implementations of various features that put me off developing Anki addons
or trying to improve the Anki scheduler. Quite an aside to templating, but
template rendering is just one more feature that is now fragmented between
python and rust code. And it seems no longer using anything like an
external implementation of mustache: the current implementation maintains
some of the syntax and semantics of mustache but the implementation is all
local to Anki, since about Anki version 2.1.28.


## srf database

### card
A card is the unit of study.

A card associates a fieldset (a set of field name/value pairs) with a
template (mustache templates for the front and back of the card, and
associated CSS) and a set of attributes used for scheduling the card.

The tuple (fieldsetid, templateid) should be unique. A unique index ensures
this.

Fields:
 * id
 * fieldsetid
 * templateid
 * modified
 * interval
 * lastinterval
 * due
 * factor
 * views
 * lapses
 * ord

#### modified
The time (seconds since the epoch) when the card was last modified. Not
used in scheduling. This is present for historical reasons - because it was
kept in Anki.

#### interval
This is the current scheduling interval: the time (seconds) from one review
to the next. When a card is reviewed, a new interval is determined, based
on how the card was rated (again, hard, good or easy) and the new interval
is used to determine when the card is next due for review.

This is adjusted according to the difference between recent percent correct
answers and the target for percent correct. It is a factor in calculation
of the next interval for the card.

#### lastinterval
When a card is reviewed, lastinterval is set to interval but interval might
be adjusted before the card is reviewed again while lastinterval is not. It
is always the interval when the card was last reviewed.

The lastinterval is copied to the lastinterval field of revlog and used to
determine if the card has matured or lapsed.

#### due
This is the time (seconds since the epoch) when the card is due to be
reviewed. This is the conclusion of the scheduling algorithm.

#### factor
This should probably be called Ease Factor. It is a factor of the
scheduling algorithm that reflects how easy the card is to remember. It is
an exponentially weighted moving average of the card ratings (again, hard,
good or easy) of past reviews.

#### views
This is a count of the number of times the card has been viewed. Not used
in scheduling.

#### lapses
This is a count of how many times the card interval has changed from a
value greater than the (arbitrary) 'mature threshold' to a value below it.
Not used in scheduling.

#### ord
This is used to sort new cards. When a new card is to be presented, the
card with the lowest ord value is presented. If there are multiple, the
selection is whichever the database driver returns first.

### config
This table is a set of name/value pairs with their modification times
(seconds since the epoch).

There are only two parameters: the database schema version and the 'correct
factor' used in scheduling.

### fieldset
A fieldset associates a set of field values with a templateset.

One card is produced for each template in the templateset.

Fields:
 * id
 * guid
 * templateset
 * fields
 * ord

#### guid
A guid from Anki import, used to identify matching records if the same card
is imported again, in which case the field values or templateset might be
different, so need to update the matching fieldset.

#### templateset
The name of the templateset this fieldset relates to. One card will be
produced for each template in the templateset (i.e. for each template with
the same templateset value).

#### fields
The field values as a JSON serialization. Keys are field names and values
are field values, which may be substituted into cards according to the
templates in the template table.

For example:

```
{
  "Audio":"[sound:喂你好.mp3]",
  "Hanzi":"喂你好",
  "Pinyin":"Wèi nǐ hǎo",
  "English":"Hello? (on the telephone)"
}
```

#### ord
For ordering the presentation of the cards. When a card is produced from
the fieldset, the card's ord is set to the same as the fieldset's ord.

This only affects the order of presentation of new cards. Cards with lower
ord are presented first.

On import from Anki, this is set to 10 * index where index is the index
into the cards array. This should provide the same order of presentation as
in Anki, except that each import begins with index 0 so cards will
intermix.

### revlog
A revlog record is produced each time a card is reviewed.

```
CREATE TABLE revlog (
  id            integer default (cast(ROUND((julianday('now') - 2440587.5)*86400000) as int)) not null,
  revdate       text default (strftime('%Y-%m-%d','now','localtime')) not null,
  cardid        integer not null,
  ease          text not null,
  interval      integer not null,
  lastinterval  integer not null,
  factor        real not null,
  viewtime      integer not null,
  studytime     integer not null,
  lapses        integer not null
)
```

 * id: record create time, ms since epoch
 * revdate: the date, localtime, of the review
 * cardid: fk to card.id
 * ease: the ease of the review: again, hard, good or easy
 * interval: the new interval in seconds
 * lastinterval: the previous interval in seconds
 * factor: a factor for determining interval
 * viewtime: the time spent viewing the card
 * studytime: the time spent studying the card, for study time calculations
 * lapses: the number of times the card has lapsed

The revdate field is redundant with id but it reduces processing time to
produce statistics charts that are grouped by date, where the date is
local timezone. Performing the conversion dynamically, per record, when the
charts are produced adds significant time to the query or processing.

lastinterval is recorded to avoid having to do a lookup of the interval of
the previous revlog for the card. It is used in determining if a card has
lapsed or matured and if the card was new. It is also used in calculating
percent correct.

### template
A template record associates a templateset name with a pair of mustache
templates for front and back of a card and some CSS for styling the card.

The set of templates with the same templateset value constitutes a
templateset.

A card is linked to a template for rendering.

A fieldset and template both have attribute templateset. When a fieldset is
saved, a card is produced for each template with matching templateset. If
the templateset of a fieldset is changed, all the cards related to the old
fieldset value are deleted and new card records are produced for each
template in the new templateset.

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



## Anki apkg files

These files contain the transferrable state of an Anki collection: a set of
decks containing templates, notes, cards and revision logs.

One could examine the [Anki source
code](https://github.com/ankitects/anki/) to determine what is in an export
from this source but the code is complex with multiple languages and tools
to interface them that obscure the interactions unless is familiar with
them.

I haven't reviewed the Anki source code for a long time. Here are merely my
notes and observations, not rooted in an understanding of the Anki source
code.

The zip file contains:
 * one or more sqlite database files, named `collection` with different
   extensions depening on version (see below).
 * media files

### media files

Media files (audio, images, etc.) are named numerically, from 0.

There is a file named `media` which contains JSON serialization of a map of
these numeric filenames to filenames.

For example:
```
{
  "0": "audio1-2exercise3.mp3",
  "1": "audio1-1exercise2.mp3",
  "2": "audio1-2exercise4.mp3"
}
```

There is no record of mime type. The file type can be deduced from the
filename extension or by inspection of the file data.

### collection database

The zip file will contain one or more sqlite database files, all named
`collection` but with different extensions for different versions of Anki.

There is often only one sqlite databases but occasionally there are
multiple, allowing the collection to be imported to multiple versions of
Anki.

#### collection.sqlite

This is for versions of Anki before 2.0. I have not seen an example of
this.

I haven't searched exhaustively but all the shared decks on
[ankiweb](https://ankiweb.net/shared/decks/) have `collection.anki2` or
`collection.anki21` - even those with modification dates back to 2012,
which seems to be about the oldest.

The old format isn't important. Anki 2.0 has been around since at least
2013. The oldest tag on the
[Anki repository](https://github.com/ankitects/anki/tags?after=2.0.9) is
2.0.4 from 8 Jan 2013.

#### collection.anki2 and collection.anki21

The database schema is the same for these, so the difference must be in the
contained values or their interpretation.

This is for versions of Anki from 2.0 but less than 2.1.

Tables:
 * cards
 * col
 * graves
 * notes
 * revlog
 * sqlite_stat1
 * sqlite_stat4

##### cards

```
sqlite> .schema cards
CREATE TABLE cards (
  id integer PRIMARY KEY,
  nid integer NOT NULL,
  did integer NOT NULL,
  ord integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  type integer NOT NULL,
  queue integer NOT NULL,
  due integer NOT NULL,
  ivl integer NOT NULL,
  factor integer NOT NULL,
  reps integer NOT NULL,
  lapses integer NOT NULL,
  left integer NOT NULL,
  odue integer NOT NULL,
  odid integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
```

##### col

```
sqlite> .schema col
CREATE TABLE col (
  id integer PRIMARY KEY,
  crt integer NOT NULL,
  mod integer NOT NULL,
  scm integer NOT NULL,
  ver integer NOT NULL,
  dty integer NOT NULL,
  usn integer NOT NULL,
  ls integer NOT NULL,
  conf text NOT NULL,
  models text NOT NULL,
  decks text NOT NULL,
  dconf text NOT NULL,
  tags text NOT NULL
);
```

 * id: there is only one record, with ID = 1
 * crt: record creation time
 * mod: record modification time
 * scm: schema modification time - maybe the database schema
 * ver: version - maybe the database schema version
 * dty: dirty
   [ankisyn2](https://github.com/patarapolw/ankisync2/blob/master/ankisync2/anki21/db.py)
   says this is unused.
 * usn: update sequence number - relates to syncing.
 * ls: last sync time
 * conf: JSON serialization of configuration options that are synced
 * models: JSON serialization of the models
 * decks: JSON serialization of the deck(s)
 * dconf: JSON serialization of deck options
 * tags: tags used in the collection

###### conf
Basic Anki configuration option settins.

An example from a collection.anki21 database
```
{
  "timeLim":0,
  "nextPos":9401,
  "dueCounts":true,
  "sortType":"noteFld",
  "localOffset":-720,
  "schedVer":2,
  "estTimes":true,
  "sortBackwards":false,
  "newSpread":0,
  "dayLearnFirst":false,
  "rollover":4,
  "collapseTime":1200,
  "creationOffset":-720,
  "addToCur":true,
  "activeDecks":[1629058964075],
  "curDeck":1629058964075,
  "curModel":1409030500500
}
```

An example from a collection.anki2 database (sorted for consistency with above)
```
{
  "timeLim":0,
  "nextPos":2,
  "dueCounts":true,
  "sortType":"noteFld",
  "localOffset":-720,
  "schedVer":1,
  "estTimes":true,
  "sortBackwards":false,
  "newSpread":0,
  "dayLearnFirst":false,
  "collapseTime":1200,
  "addToCur":true,
  "activeDecks":[1],
  "curDeck":1,
  "curModel":1629059140118,
}
```

So, anki21 has these additional values:
 * rollover
 * creationOffset

From my recollection of early work with Anki 2.0 then Anki 2.1, where I had problems with the buggy timezone handling and rollover from day to day, I think these
are:

rollover: The time of day, local time zone, when the Anki 'day' rolls over. Anki keeps track of longer times in terms of days, not seconds or milliseconds. The day
number is the number of days since the initialization of the collection. The creation time is in col.crt. This setting will affect various statistics and the
interpretation of times specified as a number of days Vs the local time.

creationOffset: I'm not so sure about this but I expect that this is the timezone offset when the collection was created. Different users can be in different time
zones so this might affect how times are recorded. My recollection is that times are recorded in local time not UTC. This was problematic because at transition
between daylight saving and standard time, some calculations were incorrect. I submitted patches for some of these errors, some of which were accepted, others
modified or rejected. Damien was concerned about impact of change on existing users, and chose not to fix all bugs therefore.

So, Anki 2.1 deals with dates and times a bit differently and includes these parameters not present in Anki 2.0. Time related fields (e.g. in card and revlog) are
likely to be interpreted differently even if, superficially they look the same. But this will only affect study history and due dates. The cards themselves (notes,
templates, etc.) do not depend on time of day.

###### models

An example from a collection.anki2 database:
```
{
  "1629059140120": {
    "id": 1629059140120,
    "name": "Basic (optional reversed card)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      },
      {
        "name": "Card 2",
        "ord": 1,
        "qfmt": "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Add Reverse",
        "ord": 2,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ],
      [
        1,
        "all",
        [
          1,
          2
        ]
      ]
    ]
  },
  "1629059140118": {
    "id": 1629059140118,
    "name": "Basic",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ]
    ]
  },
  "1629059140119": {
    "id": 1629059140119,
    "name": "Basic (and reversed card)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      },
      {
        "name": "Card 2",
        "ord": 1,
        "qfmt": "{{Back}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ],
      [
        1,
        "any",
        [
          1
        ]
      ]
    ]
  },
  "1629059140121": {
    "id": 1629059140121,
    "name": "Basic (type in the answer)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}\n\n{{type:Back}}",
        "afmt": "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0,
          1
        ]
      ]
    ]
  },
  "1629059140122": {
    "id": 1629059140122,
    "name": "Cloze",
    "type": 1,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Cloze",
        "ord": 0,
        "qfmt": "{{cloze:Text}}",
        "afmt": "{{cloze:Text}}<br>\n{{Back Extra}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Text",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back Extra",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n\n.cloze {\n font-weight: bold;\n color: blue;\n}\n.nightMode .cloze {\n color: lightblue;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ]
    ]
  }
}
```

So, this is a 'map' of models, keyed by model ID (mid).

type: I have a vague recollection that this is 0 or 1. 1 for models that
support closures or 0 otherwise. But I don't recall where I got that
impression. `const.py` in the source has MODEL_STD = 0 and MODEL_CLOZE = 1.
I have seen MODEL_STD compared to type, so these must be the values. But no
explanation of what they are. If type is not MODEL_STD, one always gets the
first template. Evidently, cloze models don't allow multiple templates.

mod: modification timestamp

usn: 'Update Sequence Number'? Fields with this name are scattered throughtout the database. It relates to synchronization.

sortf: ???

did: deck ID. I have a vague recollection that this is the default deck of cards/notes added with this model.

tmpls: an array of templates. A model might have many templates. A separate card is generated for each template.

tmmpls.ord: ordinal, for controlling the order of the templates.

tmpls.bqfmt: In the source, in one place, bqfmt is mapped to q_format_browser.
'q' is for 'question' (and 'a' is for 'answer'). It seems 'b' is for
browser. There is some code under a comment `# legacy` defining function
`templates_for_card` that takes a boolean `browser`. If `browser` is true,
the bqfmt and bafmt templates are used. If browser is not true or if bqfmt
or bafmt don't exist, then qfmt and afmt are used. So, it seems that bafrt
and bqfmt are templates that can override qftm and afmt in the context of a
browser but doing to is a legacy feature. Maybe, long ago, the templates
could be rendered in a browser or in other contexts???

tmpls.did: This must be deck ID again, but why would an individual template
be associated with a particular deck?

tmpls.bfont and tmpls.bsize: I am guessing that again 'b' relates to
browser. These probably allow different font and font size in a browser.


This is an example from a collection.ank21 database:

```
{
  "1409030500500": {
    "id": 1409030500500,
    "name": "Basic (optional reversed card)-62f40",
    "type": 0,
    "mod": 1410892824,
    "usn": -1,
    "sortf": 0,
    "did": 1410882881255,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "Arial",
        "bsize": 12
      },
      {
        "name": "Card 2",
        "ord": 1,
        "qfmt": "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "Arial",
        "bsize": 12
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20,
        "media": []
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20,
        "media": []
      },
      {
        "name": "Add Reverse",
        "ord": 2,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20,
        "media": []
      }
    ],
    "css": ".card {\n font-familiy: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ],
      [
        1,
        "all",
        [
          1,
          2
        ]
      ]
    ],
    "tags": [
      "chinese-w01-l02"
    ],
    "vers": []
  },
  "1629058828334": {
    "id": 1629058828334,
    "name": "Basic",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ]
    ]
  },
  "1629058828338": {
    "id": 1629058828338,
    "name": "Cloze",
    "type": 1,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Cloze",
        "ord": 0,
        "qfmt": "{{cloze:Text}}",
        "afmt": "{{cloze:Text}}<br>\n{{Back Extra}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Text",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back Extra",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n\n.cloze {\n font-weight: bold;\n color: blue;\n}\n.nightMode .cloze {\n color: lightblue;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ]
    ]
  },
  "1629058828335": {
    "id": 1629058828335,
    "name": "Basic (and reversed card)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      },
      {
        "name": "Card 2",
        "ord": 1,
        "qfmt": "{{Back}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ],
      [
        1,
        "any",
        [
          1
        ]
      ]
    ]
  },
  "1629058828337": {
    "id": 1629058828337,
    "name": "Basic (type in the answer)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}\n\n{{type:Back}}",
        "afmt": "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0,
          1
        ]
      ]
    ]
  },
  "1629058828336": {
    "id": 1629058828336,
    "name": "Basic (optional reversed card)",
    "type": 0,
    "mod": 0,
    "usn": 0,
    "sortf": 0,
    "did": 1,
    "tmpls": [
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      },
      {
        "name": "Card 2",
        "ord": 1,
        "qfmt": "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
        "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        "bqfmt": "",
        "bafmt": "",
        "did": null,
        "bfont": "",
        "bsize": 0
      }
    ],
    "flds": [
      {
        "name": "Front",
        "ord": 0,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Back",
        "ord": 1,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      },
      {
        "name": "Add Reverse",
        "ord": 2,
        "sticky": false,
        "rtl": false,
        "font": "Arial",
        "size": 20
      }
    ],
    "css": ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n",
    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    "latexPost": "\\end{document}",
    "latexsvg": false,
    "req": [
      [
        0,
        "any",
        [
          0
        ]
      ],
      [
        1,
        "all",
        [
          1,
          2
        ]
      ]
    ]
  }
}
```

This has added `flds.media`, but only in the first model. The others don't
have it. It is an empty array in all the cases I have seen.

Otherwise, this looks about the same as in anki2.

###### decks

An example from a collection.anki2 database:

```
{
  "1": {
    "id": 1,
    "mod": 0,
    "name": "Default",
    "usn": 0,
    "lrnToday": [ 0, 0 ],
    "revToday": [ 0, 0 ],
    "newToday": [ 0, 0 ],
    "timeToday": [ 0, 0 ],
    "collapsed": true,
    "browserCollapsed": true,
    "desc": "",
    "dyn": 0,
    "conf": 1,
    "extendNew": 0,
    "extendRev": 0
  }
}
```

An example from a collection.anki21 database:
```
{
  "1629058964075":{
    "id":1629058964075,
    "mod":1629059039,
    "name":"Coursera - Chinese for Beginners",
    "usn":-1,
    "lrnToday":[0,0],
    "revToday":[0,0],
    "newToday":[0,5],
    "timeToday":[0,44860],
    "collapsed":true,
    "browserCollapsed":true,
    "desc":"Please see the <a href='https://ankiweb.net/shared/info/'>shared deck page</a> for more info.",
    "dyn":0,
    "conf":1,
    "extendNew":0,
    "extendRev":0
  },
  "1":{
    "id":1,
    "mod":0,
    "name":"Default",
    "usn":0,
    "lrnToday":[0,0],
    "revToday":[0,0],
    "newToday":[0,0],
    "timeToday":[0,0],
    "collapsed":true,
    "browserCollapsed":true,
    "desc":"",
    "dyn":0,
    "conf":1,
    "extendNew":0,
    "extendRev":0
  }
}
```

These appear to be the same structure.

Keyed by deck ID (did).

mod: modification time.

name: the name of the deck

usn: Update Sequence Number - to do with synchronization

lrnToday: counts of reviews of learning cards

revToday: counts of reviews of non-learning cards

newToday: counts of new cards

timeToday: study time today

collapsed: I think true if the deck is collapsed in the deck browser

browserCollapsed: ???

desc: probably a description

dyn: probably whether the deck is dynamic

conf: ???

extendNew: ??? - maybe for adjusting the number of new cards?

extendRev: ??? - maybe for adjusting the number of review cards?


###### dconf

An example from a collection.anki2 database:

```
{
  "1": {
    "id": 1,
    "mod": 0,
    "name": "Default",
    "usn": 0,
    "maxTaken": 60,
    "autoplay": true,
    "timer": 0,
    "replayq": true,
    "new": {
      "bury": false,
      "delays": [
        1,
        10
      ],
      "initialFactor": 2500,
      "ints": [
        1,
        4,
        0
      ],
      "order": 1,
      "perDay": 20
    },
    "rev": {
      "bury": false,
      "ease4": 1.3,
      "ivlFct": 1,
      "maxIvl": 36500,
      "perDay": 200,
      "hardFactor": 1.2
    },
    "lapse": {
      "delays": [
        10
      ],
      "leechAction": 1,
      "leechFails": 8,
      "minInt": 1,
      "mult": 0
    },
    "dyn": false,
    "newMix": 0,
    "newPerDayMinimum": 0,
    "interdayLearningMix": 0,
    "reviewOrder": 0
  }
}
```

This is a serialization of the deck configuration. Very specific to the workings of the Anki scheduler.

##### graves

I haven't seen an example with anything in this table.

```
sqlite> .schema graves
CREATE TABLE graves (
  usn integer NOT NULL,
  oid integer NOT NULL,
  type integer NOT NULL
);
```

##### notes

```
qlite> .schema notes
CREATE TABLE notes (
  id integer PRIMARY KEY,
  guid text NOT NULL,
  mid integer NOT NULL,
  mod integer NOT NULL,
  usn integer NOT NULL,
  tags text NOT NULL,
  flds text NOT NULL,
  -- The use of type integer for sfld is deliberate, because it means that integer values in this
  -- field will sort numerically.
  sfld integer NOT NULL,
  csum integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_notes_csum ON notes (csum);
```

##### revlog

```
sqlite> .schema revlog
CREATE TABLE revlog (
  id integer PRIMARY KEY,
  cid integer NOT NULL,
  usn integer NOT NULL,
  ease integer NOT NULL,
  ivl integer NOT NULL,
  lastIvl integer NOT NULL,
  factor integer NOT NULL,
  time integer NOT NULL,
  type integer NOT NULL
);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_revlog_cid ON revlog (cid);
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

With this, I can do whatever I want with scheduling. I like the srf
scheduler much more than the Anki scheduler, old or new. In particular, a
backlog of cards is relatively easy to work through. This is because of the
prioritization of cards with shorter intervals and not showing any new
cards while the backlog persists. With the Anki scheduler, I became
overwhelmed and was no longer learning anything effectively, even with new
cards totally disabled. With the srf scheduler, this doesn't happen. Even
with a large backlog, I am able to learn and work through the backlog. It
is a much nicer experience.

The biggest challenges were reverse engineering the serialization of the
blobs in the database: because after hours of searching I still couldn't
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
* No runtime dependencies - works offline
* Simple scheduler without the complexity of Anki queues or decks
* Simple SQLite3 database
* No obscure collation function in the database
* Import from Anki deck exports

## Cons

* Very little for configuration - need to edit the code for most changes
* No reports - just rudimentary stats to the browser or server console
* No decks, tags or flags - just one pool of cards
* Only simple text fields and media
* No synchronization between devices / databases

## Changes

### 1.1.0 - 20220916

Add commandline option htdocs and support for an htdocs directory to
override the static content built into the srf server.

### 1.2.0 - 20220916

Add commandline option views and support for a views directory to override
the handlebars templates built into the web server.

### 1.2.1 - 20220917

Remove templateset.fields - it is redundant with the actual fields in the
templates of the templateset.

### 2.0.0 - 20220917

Remove fieldsets table entirely.
Add fieldset.ord

### 2.1.0 - 20220918

Add support for import of CSV files for templates and fieldsets.

Remove the distinction between imports of anki2 and anki21 apkg files. 
For the purposes of import to srf, they are the same.

### 2.1.1

README changes

### 2.1.2 - 20220919

README changes.

Ensure when editing that a fieldset includes all fields in the templateset.

On import, set card factor to 2.

### 2.1.3

 * README changes
 * LICENSE
 * Remove old cruft
 * Daily database backup

### 2.2.0

 * Fix calculation of last interval
 * Change config.maxNewCards to config.newCardLimit
 * Add config.newCardMinPercentCorrect

### 2.2.1 - 20221122

Update dependencies

### 2.2.2 - 20221216

Update dependencies

### 3.0.0 - 20230109

Changed the scheduling algorith again. Changed Again and Hard to have
maximum intervals instead of minimum intervals and changed the default
again factor to 0.3.

### 3.0.1 - 20230109

Change default again factor to 0.5 and hard factor to 0.8.

### 3.0.2 - 20230314

Eliminate the correct factor.

Add adjustment of interval and due date of learning and mature cards,
according to the difference between Percent Correct and
percentCorrectTarget.

Tune down the ease weights.

### 3.0.3 - 20230330

Change card stages to:
 * 0 / unseen / unconcious incompetence / UI
 * 1 / new / concious incompetence / CI
 * 2 / learning / concious competence / CC
 * 3 / mature / unconcious competence / UC
 * 4 / mastered / mastery / M

### 3.0.4 - 20230402

Change stats charts to by date instead of day#

### 3.0.5 - 20230402

Add revdate to revlog to improve performance of generating charts.

### 4.0.0 - 20230403

Improve performance of rendering charts on stats page

Add table dailystats and re-implement generation of daily stats charts to
get data from dailystats.

Removed the old getChart methods and added getChartsDailyStats.

### 4.0.1 - 20230403

Delete all records from dailystats after an Anki package import, which may
include revlog entries for the imported deck(s). This will force the stats
to be recalculated, including the new revlog entries.

Add card.lastinterval

Database schema 11

Reorder changes

### 4.0.2 - 20230410

Add a minimum count of mature cards in the percent correct window at which
percent correct is calculated.

Add 'if exists' to all 'drop index' statements.

Fix import test

Add chart of percent correct

Update dependencies

### 4.1.0 - 20230413

Add Admin page
Move links to templates, template sets and field sets to the admin page
Add config page - read only view of configuration
Add link to config page to the admin page

### 4.1.1 - 20230417
Review calculation of percent correct: upper bound to config.maxInterval

Fix fixRevlogInterval to get card interval from card.lastinterval (the
unadjusted interval) rather than card.interval (the adjusted interval).

Add a plot of unadjusted interval to Cards per interval.

### 4.1.2 - 20230424
Fix adjustCards to complete before next due is determined
Fix logging reviews of new cards

### 4.2.0 - 20230425
Add options --port
Fix update of daily stats new card count

### 4.2.1 - 20230425
Minimum interval of 1 second
