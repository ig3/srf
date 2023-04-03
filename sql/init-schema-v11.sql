-- schema version 11
-- Add lastinterval to card

begin transaction;

alter table card rename to oldcard;

-- one card for each note/template combination
-- multiple cards per note
create table card (
  id           integer primary key,
  fieldsetid   integer not null,
  templateid   integer not null,
  modified     integer default (strftime('%s', 'now')) not null,
  -- seconds from last seen to due
  interval     integer not null,
  lastinterval integer not null,
  -- epoch seconds when card is due to be seen or 0 for an unseen card
  due          integer not null,
  -- exponentially smoothed interval
  factor       integer not null,
  -- number of times the card has been viewed
  views        integer not null,
  -- number of times the card has lapsed
  lapses       integer not null,
  -- sort order for selecting new cards
  ord          integer not null
);

drop index idx_card_id;
create index idx_card_id on card (id);

drop index idx_card_due_interval;
create index idx_card_due_interval on card (due, interval);

drop index idx_card_fieldsetid_templateid;
create unique index idx_card_fieldsetid_templateid on card (fieldsetid, templateid);

insert into card (id, fieldsetid, templateid, modified, interval, lastinterval, due, factor, views, lapses, ord) select id, fieldsetid, templateid, modified, interval, interval as lastinterval, due, factor, views, lapses, ord from oldcard;

drop table oldcard;

update config set value = '11' where name = 'srf schema version';

commit;
