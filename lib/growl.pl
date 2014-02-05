#!/usr/bin/perl
use strict;
use warnings;
use WR::Thunderpush::Server;
use Data::Dumper;

my $p = WR::Thunderpush::Server->new(
    host => 'bacon.wotreplays.org:20001',
    key     => '52ecedef9c81a515f6010000',
    secret  => '52ecee0f9c81a5163c010000',
    );

print Dumper($p->send_to_channel('client-test' => { evt => 'growl', data => { type => 'info', allow_dismiss => Mojo::JSON->true, delay => 10000, text => join(' ', @ARGV) }})); 