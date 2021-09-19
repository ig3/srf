-- schema version 2
-- Add field config.modified with a trigger to set it on update
-- Add a trigger to card to set card.modified on update

begin transaction;

-- Adding a column to an existing table, the column cannot have a default
-- value that is an expression in parentheses. So, rename the config table
-- create a new one, copy the records into the new table and delete the
-- old table.

alter table config rename to oldconfig;

create table config (
  name  text not null unique,
  modified integer not null default (strftime('%s', 'now')),
  value text not null
);

create trigger configUpdate
update on config
begin
  update config set modified = strftime('%s', 'now') where name = old.name;
end;

insert into config (name, value) select name, value from oldconfig;

drop table oldconfig;

create trigger cardUpdate
update on card
begin
  update card set modified = strftime('%s', 'now') where id = old.id;
end;

update config set value = '2' where name = 'srf schema version';

commit;
