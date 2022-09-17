-- schema version 8
-- Add ord to fieldset

begin transaction;

alter table fieldset rename to oldfieldset;

create table fieldset (
  id            integer primary key,
  guid          text not null,
  templateset   text not null,
  fields        text not null,
  ord           integer default 0
);

drop index idx_fieldset_id;
create index idx_fieldset_id on fieldset (id);

insert into fieldset (id, guid, templateset, fields) select id, guid, templateset, fields from oldfieldset;

drop table oldfieldset;

update config set value = '8' where name = 'srf schema version';

commit;
