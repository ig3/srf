# srf
Spaced Repetition Flashcards.

I have been using Anki, which I quite like, but it has fixed new cards per
day. I wrote an add-on to adjust new cards automatically but Anki is
increasingly being migrated to rust and the rust based component don't
support hooks or monkey patching. As the scheduler migration to rust
progressing, it will be increasingly difficult to maintain the add-on, and
there is a new scheduler now in development, likely to be significantly
different. It is a moving target.

I have also wanted to experiment with the scheduler algorithm but the way
it is tied into code makes it difficult. There is not a simple API to the
scheduler.

The cards I used are simple html/css. Nothing fancy. It should be easy to
present them in the browser, electron or any other context that supports
html/css.

So, this is yet another spaced repetition flashcard app (npmjs and GitHub
are littered with them).


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



