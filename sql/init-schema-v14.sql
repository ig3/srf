-- schema version 13
-- change dailystats.studyminutes to dailystats.studytime

begin transaction;

update revlog set ease = 'fail' where ease = 'again';

commit;
