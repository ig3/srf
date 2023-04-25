-- schema version 13
-- change dailystats.studyminutes to dailystats.studytime

begin transaction;

alter table dailystats rename column studyminutes to studytime;

update dailystats set studytime = studytime * 60;

update config set value = '13' where name = 'srf schema version';

commit;
