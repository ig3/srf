-- schema version 14

begin transaction;

update revlog set ease = 'fail' where ease = 'again';

update config set value = '14' where name = 'srf schema version';
commit;
