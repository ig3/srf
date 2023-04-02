-- schema version 10
-- Add dailystats table

begin transaction;

create table dailystats (
  date          text default (strftime('%Y-%m-%d','now','localtime')) not null,
  cardviews     integer,
  studyminutes  integer,
  newcards      integer,
  matured       integer,
  lapsed        integer,
  mature        integer
);

create unique index idx_dailystats_date on dailystats (date);

update config set value = '10' where name = 'srf schema version';

commit;
