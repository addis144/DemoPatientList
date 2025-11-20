package HL7Generator;
use strict;
use warnings;
use POSIX qw(strftime);

our $VERSION = '0.1';

my %facility_map = (
    'Seattle Grace Hospital'      => { sending => 'SPAAPP', receiving => 'Seattle Grace Hospital' },
    'St. Eligius Elsewhare'       => { sending => 'SPAAPP', receiving => 'St. Eligius Elsewhare' },
    'Princeton Plainsboro House'  => { sending => 'SPAAPP', receiving => 'Princeton Plainsboro House' },
);

sub build_message {
    my ($params) = @_;
    my $patient  = $params->{patient}  || {};
    my $action   = $params->{action}   || 'A01';
    my $hospital = $params->{hospital} || 'Seattle Grace Hospital';

    my $facility = $facility_map{$hospital} || { sending => 'SPAAPP', receiving => $hospital };
    my $timestamp = strftime('%Y%m%d%H%M%S', gmtime());
    my $message_control_id = sprintf('MSG%05d', $patient->{id} || 1);

    my $msh = join '|', (
        'MSH', '^~\\&',
        $facility->{sending},
        $hospital,
        'HIS',
        $facility->{receiving},
        $timestamp,
        '',
        'ADT^' . $action,
        $message_control_id,
        'P',
        '2.5.1'
    );

    my $evn = join '|', ('EVN', $action, $timestamp);

    my $pid = join '|', (
        'PID', 1, '',
        $patient->{mrn} || '', '',
        _format_name($patient), '',
        _format_date($patient->{dob}),
        $patient->{sex} || '', '',
        _format_address($patient)
    );

    my $pv1 = join '|', (
        'PV1', 1,
        ($action eq 'A03' ? 'O' : 'I'),
        'ER^^^' . $hospital,
        (('') x 19)
    );

    return join("\n", ($msh, $evn, $pid, $pv1)) . "\n";
}

sub _format_name {
    my ($patient) = @_;
    my $last  = $patient->{last_name}  || '';
    my $first = $patient->{first_name} || '';
    my $mid   = $patient->{middle_name} || '';
    return join('^', $last, $first, $mid);
}

sub _format_address {
    my ($patient) = @_;
    my $addr = $patient->{address} || '';
    my $city = $patient->{city}    || '';
    my $st   = $patient->{state}   || '';
    my $zip  = $patient->{zip}     || '';
    return join('^', $addr . '^^' . $city, $st, $zip);
}

sub _format_date {
    my ($date) = @_;
    return '' unless $date;
    $date =~ s/[^0-9]//g;
    return $date;
}

1;
