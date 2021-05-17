use strict;
use warnings;
use Data::Dumper::Concise;
use DBI;
my $dbh = DBI->connect("dbi:SQLite:dbname=collection.anki2","","", {
  RaiseError  => 1,
  sqlite_unicode  => 1,
});
$dbh->sqlite_create_collation('unicase', sub {
    my ($a, $b) = @_;
    $a cmp $b;
  });

my $sth = $dbh->prepare("select name, sql from sqlite_master where type='table'");
$sth->execute();

my $rows = $sth->fetchall_arrayref;


print "PRAGMA writable_schema=1;\n";
for my $row (@$rows) {
  my ($name, $sql) = @$row;
  if( $sql =~ m/collate/i ) {
    $sql =~ s/ collate unicase//i;
    print "update sqlite_master set sql='$sql' where type='table' and name='$name';\n";
  }
}
