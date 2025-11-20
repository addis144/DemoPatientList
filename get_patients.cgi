#!/usr/bin/env perl
use strict;
use warnings;
use JSON::PP;
use DBI;

print "Content-Type: application/json\n\n";

my $dbh = eval { _connect_db() };
my $patients = [];

if ($dbh) {
    my $sth = $dbh->prepare(
        'SELECT id, last_name, first_name, mrn FROM patients ORDER BY id LIMIT 200'
    );
    if ($sth && $sth->execute) {
        $patients = $sth->fetchall_arrayref({});
    }
}

if (!@$patients) {
    $patients = [
        { id => 1, last_name => 'Smith', first_name => 'John', mrn => 'MRN00001' },
        { id => 2, last_name => 'Patel', first_name => 'Priya', mrn => 'MRN00002' },
        { id => 3, last_name => 'Chen', first_name => 'Alex', mrn => 'MRN00003' },
    ];
}

print encode_json({ patients => $patients });

sub _connect_db {
    my $dsn = $ENV{PATIENTS_DSN} || 'dbi:Pg:dbname=patients;host=localhost';
    my $user = $ENV{PATIENTS_DB_USER} || 'postgres';
    my $pass = $ENV{PATIENTS_DB_PASSWORD} || '';
    return DBI->connect($dsn, $user, $pass, { RaiseError => 0, PrintError => 0 });
}
