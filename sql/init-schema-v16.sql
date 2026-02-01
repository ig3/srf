-- schema version 15

begin transaction;

alter table revlog add column due integer;
alter table revlog add column lastdue integer;
alter table revlog add column backlog integer;
alter table revlog add column overdue integer;
alter table dailystats add column latency integer;
alter table dailystats add column backlog integer;
alter table dailystats add column overdue integer;

update config set value = '16' where name = 'srf schema version';
commit;
