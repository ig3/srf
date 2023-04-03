-- schema version 7
-- Remove table templateset

begin transaction;

-- Change templatesetid to templateset in fieldset
alter table fieldset rename to oldfieldset;

create table fieldset (
  id            integer primary key,
  guid          text not null,
  templateset   text not null,
  fields        text not null
);

drop index if exists idx_fieldset_id;
create index idx_fieldset_id on fieldset (id);

insert into fieldset (id, guid, templateset, fields) select oldfieldset.id, oldfieldset.guid, templateset.name, oldfieldset.fields from oldfieldset join templateset on templateset.id = oldfieldset.templatesetid;

drop table oldfieldset;


-- Change templatesetid to templateset in template
alter table template rename to oldtemplate;

-- template records the front and back html and related css for production
-- of a card from a fact set. The template name, front and back html and css
-- are serialized as JSON data, in value. Each template belongs to a
-- template set.
create table template (
  id            integer primary key,
  templateset   text not null,
  name          text not null,
  front         text not null,
  back          text not null,
  css           text not null
);

create index idx_template_id on template (id);

insert into template (id, templateset, name, front, back, css) select oldtemplate.id, templateset.name, oldtemplate.name, oldtemplate.front, oldtemplate.back, oldtemplate.css from oldtemplate join templateset on templateset.id = oldtemplate.templatesetid;

drop table oldtemplate;


-- Drop templateset - it's not used any more
drop table templateset;

update config set value = '7' where name = 'srf schema version';

commit;
