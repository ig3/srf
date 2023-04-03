-- schema version 5
-- Change revlog.ease from integer to text

begin transaction;

alter table revlog rename to oldrevlog;

create table revlog (
  id            integer not null,
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

insert into revlog (id, cardid, ease, interval, lastinterval, factor, viewtime, studytime, lapses) select id, cardid, case ease when 1 then 'again' when 2 then 'hard' when 3 then 'good' when 4 then 'easy' end as ease, interval, lastinterval, factor, viewtime, studytime, lapses from oldrevlog;

drop table oldrevlog;

update config set value = '5' where name = 'srf schema version';

commit;
