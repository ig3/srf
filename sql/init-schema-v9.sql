-- schema version 9
-- Add revdate to revlog and set default for id

begin transaction;

alter table revlog rename to oldrevlog;

create table revlog (
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
);

drop index if exists idx_revlog_id;
create index idx_revlog_id on revlog (id);
drop index if exists idx_revlog_revdate;
create index idx_revlog_revdate on revlog (revdate);
drop index if exists idx_revlog_cardid_id;
create index idx_revlog_caradid_id on revlog (cardid, id);

insert into revlog (id, revdate, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) select id, strftime('%Y-%m-%d', id/1000, 'unixepoch', 'localtime') as revdate, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses from oldrevlog;

drop table oldrevlog;

update config set value = '9' where name = 'srf schema version';

commit;
