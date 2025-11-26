package HL7Generator;
use strict;
use warnings;
use POSIX qw(strftime);
use Net::HL7::Message;
use Net::HL7::Segment;

our $VERSION = '0.1';

sub build_message {
    my ($params) = @_;
    my $patient  = $params->{patient}  || {};
    my $action   = $params->{action}   || 'A01';
    my $facility_name = $params->{facility_name} || $params->{hospital} || 'Seattle Grace Hospital';
    my $facility_code = $params->{facility_code};
    my $sending_id    = $params->{sending_id};

    my $defaults = _default_facility($facility_name);
    $facility_code ||= $defaults->{facility_code};
    $sending_id    ||= $defaults->{sending_id};
    my $timestamp = strftime('%Y%m%d%H%M%S', gmtime());
    my $message_control_id = sprintf('MSG%05d', $patient->{id} || 1);

    my $message = Net::HL7::Message->new();

    my $msh = Net::HL7::Segment->new('MSH');
    $msh->setField(1, '|');
    $msh->setField(2, '^~\\&');
    $msh->setField(3, $sending_id);
    $msh->setField(4, $facility_code);
    $msh->setField(5, 'HIS');
    $msh->setField(6, $facility_code);
    $msh->setField(7, $timestamp);
    $msh->setField(8, '');
    $msh->setField(9, 'ADT^' . $action);
    $msh->setField(10, $message_control_id);
    $msh->setField(11, 'P');
    $msh->setField(12, '2.5.1');

    my $evn = Net::HL7::Segment->new('EVN');
    $evn->setField(1, $action);
    $evn->setField(2, $timestamp);

    my $pid = Net::HL7::Segment->new('PID');
    $pid->setField(1, 1);
    $pid->setField(2, '');
    $pid->setField(3, $patient->{mrn} || '');
    $pid->setField(4, '');
    $pid->setField(5, _format_name($patient));
    $pid->setField(6, '');
    $pid->setField(7, _format_date($patient->{dob}));
    $pid->setField(8, $patient->{sex} || '');
    $pid->setField(9, '');
    $pid->setField(10, _format_address($patient));

    my $pv1 = Net::HL7::Segment->new('PV1');
    $pv1->setField(1, 1);
    $pv1->setField(2, ($action eq 'A03' ? 'O' : 'I'));
    $pv1->setField(3, 'ER^^^' . $facility_name);

    $message->addSegment($msh);
    $message->addSegment($evn);
    $message->addSegment($pid);
    $message->addSegment($pv1);

    return $message;
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

sub _default_facility {
    my ($name) = @_;
    my %defaults = (
        'Seattle Grace Hospital'      => { facility_code => 'SGH', sending_id => 'SPAAPP' },
        'St. Eligius Elsewhare'       => { facility_code => 'SEL', sending_id => 'SPAAPP' },
        'Princeton Plainsboro House'  => { facility_code => 'PPH', sending_id => 'SPAAPP' },
    );

    return $defaults{$name} || { facility_code => $name, sending_id => 'SPAAPP' };
}

1;
