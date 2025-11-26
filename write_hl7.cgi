#!/usr/bin/env perl
use strict;
use warnings;
use JSON::PP;
use File::Spec;
use Time::HiRes qw(gettimeofday);
use POSIX qw(strftime);
use FindBin;

binmode STDOUT, ':utf8';

my $request_method = $ENV{REQUEST_METHOD} || '';
if ($request_method ne 'POST') {
    _respond(405, { status => 'error', message => 'Method not allowed' });
    exit;
}

my $content = do { local $/; <STDIN> } // '';
my $data;
if (!length $content) {
    _respond(400, { status => 'error', message => 'Empty request body' });
    exit;
}

$data = eval { decode_json($content) };
if ($@ || ref $data ne 'HASH') {
    _respond(400, { status => 'error', message => 'Invalid JSON payload' });
    exit;
}

my $hl7_message = defined $data->{hl7_message} ? $data->{hl7_message} : '';
if ($hl7_message eq '') {
    _respond(400, { status => 'error', message => 'Missing required field: hl7_message' });
    exit;
}

my $mrn     = _sanitize($data->{mrn} // $data->{patient_id} // 'UNKNOWNMRN');
$mrn        = $mrn eq '' ? 'UNKNOWNMRN' : $mrn;
my $action  = _sanitize($data->{action} // 'UNK');
$action     = $action eq '' ? 'UNK' : $action;
my $hospital = $data->{hospital} // '';

my $output_dir = $ENV{OB_HL7_OUTPUT_DIR} || File::Spec->catdir($FindBin::Bin, 'OB-HL7');

if (!-d $output_dir || !-w $output_dir) {
    _log_event({ level => 'error', message => 'Output directory unavailable or not writable', dir => $output_dir });
    _respond(500, { status => 'error', message => 'Output directory unavailable or not writable' });
    exit;
}

my ($timestamp) = _timestamp();
my $base_name = sprintf('OB_%s_%s_%s', $timestamp, $mrn, $action);
my $filename = $base_name . '.hl7';
my $filepath = File::Spec->catfile($output_dir, $filename);
my $counter  = 1;

while (-e $filepath) {
    $filename = sprintf('%s_%d.hl7', $base_name, $counter++);
    $filepath = File::Spec->catfile($output_dir, $filename);
}

my $temp_name = $filename;
$temp_name =~ s/\.hl7$/.tmp/;
my $temp_path = File::Spec->catfile($output_dir, $temp_name);

my $write_ok = eval {
    open my $fh, '>', $temp_path or die "Unable to open temp file: $!";
    binmode $fh, ':utf8';
    print {$fh} $hl7_message;
    close $fh or die "Unable to close temp file: $!";
    rename $temp_path, $filepath or die "Unable to finalize file: $!";
    1;
};

if (!$write_ok) {
    my $error = $@ || 'Unknown error';
    unlink $temp_path if -e $temp_path;
    _log_event({ level => 'error', message => $error, filename => $filename, mrn => $mrn, action => $action, hospital => $hospital });
    _respond(500, { status => 'error', message => 'Failed to write HL7 message' });
    exit;
}

_log_event({ level => 'info', message => 'HL7 message written', filename => $filename, mrn => $mrn, action => $action, hospital => $hospital });
_respond(200, { status => 'success', message => 'HL7 message written to file', filename => $filename });

sub _respond {
    my ($status, $payload) = @_;
    my $status_line = _status_line($status);
    print "Status: $status_line\r\n";
    print "Content-Type: application/json\r\n\r\n";
    print encode_json($payload);
}

sub _status_line {
    my ($status) = @_;
    my %map = (
        200 => '200 OK',
        400 => '400 Bad Request',
        405 => '405 Method Not Allowed',
        500 => '500 Internal Server Error',
    );
    return $map{$status} || $status;
}

sub _timestamp {
    my ($sec, $micro) = gettimeofday();
    my $ms = int($micro / 1000);
    my $stamp = strftime('%Y%m%d%H%M%S', localtime($sec));
    $stamp .= sprintf('%03d', $ms);
    return $stamp;
}

sub _sanitize {
    my ($value) = @_;
    $value //= '';
    $value =~ s/[^A-Za-z0-9_-]+//g;
    return $value;
}

sub _log_event {
    my ($params) = @_;
    my $level   = $params->{level} || 'info';
    my $message = $params->{message} || '';
    my $log_line = join(' ',
        '[' . scalar localtime() . ']',
        uc($level) . ':',
        ($params->{filename} ? 'file=' . $params->{filename} : ()),
        ($params->{mrn}      ? 'mrn=' . $params->{mrn}         : ()),
        ($params->{action}   ? 'action=' . $params->{action}   : ()),
        ($params->{hospital} ? 'hospital=' . $params->{hospital} : ()),
        $message,
    );

    my $log_path = '/var/log/ob_hl7_send.log';
    if (open my $log_fh, '>>', $log_path) {
        print {$log_fh} $log_line . "\n";
        close $log_fh;
    } else {
        warn $log_line . "\n";
    }
}
