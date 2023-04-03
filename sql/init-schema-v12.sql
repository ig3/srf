-- schema version 12
-- Add dailystats.percentcorrect

begin transaction;

alter table dailystats add column percentcorrect real;

update config set value = '12' where name = 'srf schema version';

commit;
