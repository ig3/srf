-- schema version 15

begin transaction;

alter table dailystats drop column matured;
alter table dailystats drop column lapsed;
alter table dailystats drop column mature;
alter table dailystats add column stageNew integer;
alter table dailystats add column stageLearning integer;
alter table dailystats add column stageMature integer;
alter table dailystats add column stageMastered integer;
alter table card drop column lapses;
alter table revlog drop column lapses;

-- alter table revlog add column views integer;
-- with t1 as (
--   select id, count() over (partition by cardid order by id) as views
--   from revlog
-- )
-- update revlog
-- set views = (select views from t1 where t1.id = revlog.id);

update config set value = '15' where name = 'srf schema version';
commit;
