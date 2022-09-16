-- schema version 6
-- Remove field templateset.fields

begin transaction;

alter table templateset rename to oldtemplateset;

-- A template set is a set of templates used to produce a set of cards
-- from a fieldset. The individual templates are stored in table template,
-- which links to this table by id. Each fieldset links to a templateset
-- by id.
create table templateset (
  id            integer primary key,
  name          text not null
);

insert into templateset (id, name) select id, name from oldtemplateset;

drop table oldtemplateset;

update config set value = '6' where name = 'srf schema version';

commit;
