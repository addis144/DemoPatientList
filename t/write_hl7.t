use strict;
use warnings;
use Test::More;
use IPC::Open3;
use Symbol 'gensym';
use File::Temp qw(tempdir);
use JSON::PP;
use File::Spec;
use Cwd qw(abs_path);

my $perl = $^X;

sub run_script {
    my (%opts) = @_;
    my $input = $opts{input} // '';
    my %env = (
        REQUEST_METHOD => $opts{method} // 'POST',
        CONTENT_LENGTH => length($input),
        CONTENT_TYPE   => $opts{content_type} || 'application/json',
    );

    $env{OB_HL7_OUTPUT_DIR} = $opts{output_dir} if $opts{output_dir};

    local %ENV = (%ENV, %env);

    my ($wtr, $rdr, $err) = (undef, undef, gensym);
    my $pid = open3($wtr, $rdr, $err, $perl, abs_path('write_hl7.cgi'));
    print {$wtr} $input;
    close $wtr;

    local $/;
    my $stdout = <$rdr> // '';
    my $stderr = <$err> // '';
    waitpid($pid, 0);

    return { stdout => $stdout, stderr => $stderr };
}

sub parse_response {
    my ($raw) = @_;
    my ($header_str, $body) = split(/\r?\n\r?\n/, $raw, 2);
    my %headers;
    for my $line (split(/\r?\n/, $header_str || '')) {
        my ($k, $v) = split(/:\s*/, $line, 2);
        $headers{$k} = $v if defined $k && defined $v;
    }
    return { headers => \%headers, body => $body };
}

sub decode_body {
    my ($body) = @_;
    return eval { decode_json($body) } || {};
}

# Test 1: reject non-POST
my $resp = run_script(method => 'GET', input => '');
my $parsed = parse_response($resp->{stdout});
my $json = decode_body($parsed->{body});
like($parsed->{headers}->{Status} || '', qr/405/, 'GET request returns 405');
is($json->{status}, 'error', 'GET request body indicates error');

# Test 2: missing hl7_message
$resp = run_script(input => encode_json({}));
$parsed = parse_response($resp->{stdout});
$json = decode_body($parsed->{body});
like($parsed->{headers}->{Status} || '', qr/400/, 'Missing message returns 400');
like($json->{message} || '', qr/Missing required field/, 'Error message mentions missing field');

# Test 3: successful write
my $dir = tempdir(CLEANUP => 1);
my $hl7_text = "MSH|^~\\&|SPAAPP|SGH|HIS|SGH|202511201530||ADT^A01|MSG00001|P|2.5.1\nPID|1||MRN12345||Doe^Jane";
$resp = run_script(
    input      => encode_json({ hl7_message => $hl7_text, mrn => 'MRN12345', action => 'A01', hospital => 'Test Hospital' }),
    output_dir => $dir,
);
$parsed = parse_response($resp->{stdout});
$json = decode_body($parsed->{body});

is($json->{status}, 'success', 'Write returns success status');
like($json->{filename} || '', qr/^OB_\d{17}_MRN12345_A01\.hl7$/, 'Filename follows pattern');
my $expected_path = File::Spec->catfile($dir, $json->{filename} || '');
ok(-e $expected_path, 'File exists on disk');
if (-e $expected_path) {
    open my $fh, '<', $expected_path or die $!;
    local $/;
    my $content = <$fh>;
    close $fh;
    is($content, $hl7_text, 'File content matches payload');
}

# Test 4: unwritable or missing directory
my $readonly_dir = tempdir(CLEANUP => 1);
my $missing_dir = File::Spec->catdir($readonly_dir, 'missing');
$resp = run_script(
    input      => encode_json({ hl7_message => $hl7_text, mrn => 'MRN5678', action => 'A03' }),
    output_dir => $missing_dir,
);
$parsed = parse_response($resp->{stdout});
$json = decode_body($parsed->{body});
like($parsed->{headers}->{Status} || '', qr/500/, 'Unavailable directory returns 500');
like($json->{message} || '', qr/unavailable or not writable/i, 'Error message mentions directory issue');




done_testing();
