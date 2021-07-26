begin transaction;

create table config (
  name  text not null,
  value text not null
);

-- one card for each note/template combination
-- multiple cards per note
create table card (
  id          integer primary key,
  factsetid   integer not null,
  templateid  integer not null,
  modified    integer not null,
  -- seconds from last seen to due
  interval    integer not null,
  -- epoch seconds when card is due to be seen or 0 for an unseen card
  due         integer not null,
  -- exponentially smoothed interval
  factor      integer not null,
  -- number of times the card has been viewed
  views       integer not null,
  -- number of times the card has lapsed
  lapses      integer not null,
  -- sort order for selecting new cards
  ord         integer not null
);

create index idx_card_due_interval on card (due, interval);

create table factset (
  id            integer primary key,
  guid          text not null,
  templatesetid integer not null,
  fields        text not null
);

-- A template set is an ordered set of templates used to produce a set of
-- cards from a fact set. The individual templates are stored in table
-- template. The set is stored as a JSON encoded array of template IDs in
-- field templates. The set of fields used by the collection of templates
-- is stored as a JSON encoded array of field names in field fields.
create table templateset (
  id            integer primary key,
  name          text not null,
  templates     text not null,
  fields        text not null
);

-- template records the front and back html and related css for production
-- of a card from a fact set. The template name, front and back html and css
-- are serialized as JSON data, in value. Each template belongs to a
-- template set.
create table template (
  id            integer primary key,
  value         test not null
);

create table revlog (
  id            integer not null,
  cardid        integer not null,
  ease          integer not null,
  interval      integer not null,
  lastinterval  integer not null,
  factor        real not null,
  time          integer not null,
  lapses        integer not null
);

create index idx_revlog_id on revlog (id);

insert into config (name, value) values ('srf schema version', 1);

commit;
