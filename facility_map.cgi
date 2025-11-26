#!/usr/bin/env perl
use strict;
use warnings;
use CGI;
use JSON::PP;
use DBI;

my $q = CGI->new;
my $method = uc($ENV{REQUEST_METHOD} || 'GET');

if ($method eq 'POST') {
    handle_save();
} else {
    handle_list();
}

sub handle_list {
    print $q->header(-type => 'application/json', -charset => 'UTF-8');
    my $facilities = _default_facilities();

    my $dbh = eval { _connect_db() };
    if ($dbh) {
        my $sth = $dbh->prepare('SELECT name, code, sending_id FROM facilities ORDER BY id');
        if ($sth && $sth->execute) {
            my $rows = $sth->fetchall_arrayref({});
            $facilities = $rows if @$rows;
        }
    }

    print encode_json({ facilities => $facilities });
}

sub handle_save {
    my $body = do { local $/; <STDIN> };
    my $payload = eval { decode_json($body || '{}') } || {};
    my $facilities = $payload->{facilities};

    unless ($facilities && ref $facilities eq 'ARRAY') {
        print $q->header(-status => 400, -type => 'application/json', -charset => 'UTF-8');
        print encode_json({ error => 'Invalid facility payload' });
        return;
    }

    my $dbh = eval { _connect_db() };
    unless ($dbh) {
        print $q->header(-status => 500, -type => 'application/json', -charset => 'UTF-8');
        print encode_json({ error => 'Database unavailable' });
        return;
    }

    my @cleaned = map {
        {
            name      => _trim($_->{name} // ''),
            code      => _trim($_->{code} // ''),
            sending_id => _trim($_->{sendingId} // $_->{sending_id} // ''),
        }
    } @$facilities;

    @cleaned = grep { $_->{name} ne '' || $_->{code} ne '' || $_->{sending_id} ne '' } @cleaned;

    eval {
        $dbh->begin_work;
        $dbh->do('DELETE FROM facilities');
        my $sth = $dbh->prepare('INSERT INTO facilities (name, code, sending_id) VALUES (?, ?, ?)');
        for my $facility (@cleaned) {
            $sth->execute($facility->{name}, $facility->{code}, $facility->{sending_id});
        }
        $dbh->commit;
    } or do {
        eval { $dbh->rollback };
        print $q->header(-status => 500, -type => 'application/json', -charset => 'UTF-8');
        print encode_json({ error => 'Failed to save facilities' });
        return;
    };

    print $q->header(-type => 'application/json', -charset => 'UTF-8');
    print encode_json({ success => JSON::PP::true });
}

sub _connect_db {
    my $dsn = 'dbi:Pg:dbname=mirth_db';
    my $user = 'src';
    return DBI->connect($dsn, $user, undef, { RaiseError => 0, PrintError => 0, AutoCommit => 1 });
}

sub _trim {
    my ($value) = @_;
    $value //= '';
    $value =~ s/^\s+//;
    $value =~ s/\s+$//;
    return $value;
}

sub _default_facilities {
    return [
        { name => 'Seattle Grace Hospital',     code => 'SGH', sending_id => 'SPAAPP' },
        { name => 'St. Eligius Elsewhare',      code => 'SEL', sending_id => 'SPAAPP' },
        { name => 'Princeton Plainsboro House', code => 'PPH', sending_id => 'SPAAPP' },
    ];
}
