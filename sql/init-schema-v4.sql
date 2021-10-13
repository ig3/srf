-- schema version 4
-- Add index on revlog cardid, id

begin transaction;

CREATE INDEX "idx_revlog_cardid_id" ON "revlog" (
	"cardid",
	"id"
);

update config set value = '4' where name = 'srf schema version';

commit;
