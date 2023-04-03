-- schema version 3
-- Rename revlog.time to revlog.viewtime
-- Add revlog.studytime

begin transaction;

alter table revlog rename to oldrevlog;

create table revlog (
  id            integer not null,
  cardid        integer not null,
  ease          integer not null,
  interval      integer not null,
  lastinterval  integer not null,
  factor        real not null,
  viewtime      integer not null,
  studytime     integer not null,
  lapses        integer not null
);

drop index if exists idx_revlog_id;
create index idx_revlog_id on revlog (id);

insert into revlog (id, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) select id, cardid, ease, interval, lastinterval, factor, time, time, lapses from oldrevlog;

drop table oldrevlog;

update config set value = '3' where name = 'srf schema version';

commit;
