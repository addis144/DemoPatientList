#!/usr/bin/env perl
use strict;
use warnings;
use CGI;
use JSON::PP;
use FindBin;
use lib $FindBin::Bin;
use HL7Generator;
use CGI::Carp qw(fatalsToBrowser warningsToBrowser);
warningsToBrowser(1);

my $q = CGI->new;
print $q->header(-type => 'text/plain', -charset => 'UTF-8');

my $patient_id     = $q->param('patient_id')     // '';
my $action         = $q->param('action')         // 'A01';
my $facility_name  = $q->param('facility_name')  // $q->param('hospital') // 'Seattle Grace Hospital';
my $facility_code  = $q->param('facility_code')  // '';
my $sending_id     = $q->param('sending_id')     // '';

if ($action !~ /^(A01|A03|A08)$/) {
    print "Invalid action";
    exit;
}

my $patient = _load_patient($patient_id);
my $hl7_message = HL7Generator::build_message({
    patient  => $patient,
    action   => $action,
    facility_name => $facility_name,
    facility_code => $facility_code,
    sending_id    => $sending_id,
});

print $hl7_message->toString(1);

sub _load_patient {
    my ($id) = @_;
    my $dbh = eval { _connect_db() };
    if ($dbh && $id) {
        my $sth = $dbh->prepare('SELECT * FROM patients WHERE id = ?');
        if ($sth && $sth->execute($id)) {
            my $row = $sth->fetchrow_hashref;
            return $row if $row;
        }
    }

    my %fallback = (
        id         => $id || 1,
        mrn        => 'MRN00001',
        last_name  => 'Smith',
        first_name => 'John',
        middle_name => 'A',
        dob        => '1980-03-14',
        sex        => 'M',
        address    => '123 Maple St',
        city       => 'New York',
        state      => 'NY',
        zip        => '10001',
    );
warn "DEBUG: \$dbh = $dbh, DBI->errstr = " . DBI->errstr;
    return \%fallback;
}

sub _connect_db {
    # Peer authentication: local socket, no password
    my $dsn = 'dbi:Pg:dbname=mirth_db';
    my $user = 'src';
    return DBI->connect($dsn, $user, undef, \ RaiseError => 0, PrintError => 0 });
}

