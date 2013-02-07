package WR::Process;
use Moose;
use namespace::autoclean;
use boolean;
use WR::Parser;
use WR::Constants qw/nation_id_to_name/;
use WR::Util::TypeComp qw/parse_int_compact_descr/;

use Try::Tiny qw/try catch/;

has 'file' => (is => 'ro', isa => 'Str');
has 'data' => (is => 'ro', isa => 'Str');

has 'db' => (is => 'ro', isa => 'MongoDB::Database', required => 1);

# this oughta come from a config file ;) 
has 'bf_key' => (is => 'ro', isa => 'Str');

has '_error' => (is => 'ro', isa => 'Maybe[Str]', required => 1, default => undef, writer => '_set_error', init_arg => undef);
has '_parser' => (is => 'ro', isa => 'WR::Parser', writer => '_set_parser', init_arg => undef, handles => [qw/is_complete/]);
has '_result' => (is => 'ro', isa => 'HashRef', writer => '_set_result', required => 1, default => sub { {} }, init_arg => undef);
has 'pickledata' => (is => 'ro', isa => 'HashRef', writer => '_set_pickledata', init_arg => undef);

has 'banner' => (is => 'ro', isa => 'Bool', required => 1, default => 1);

# load order here is important, the roles are applied left to right, first role applied is the first level in the 'around' chain

with (
        'WR::Role::Process::PickleData',     # must be first, it inflates the pickle data for complete replays
        'WR::Role::Process::ExpandResult',   # must be second, it inflates some result values 
        'WR::Role::Process::ResolveServer',  # get player server
        'WR::Role::Process::Mastery',        # resolve heroes 
        'WR::Role::Process::Fittings',       # process vehicle fittings
        'WR::Role::Process::Platoon',        # process platoons
        'WR::Role::Process::Chat',           # chat messages
        'WR::Role::Process::Digest',         # MD5 digest for the replay itself
        'WR::Role::Process::WPA',            # Phalynx' stuff
        'WR::Role::Process::Efficiency',     # XVM/VBA efficiencies
        'WR::Role::Process::Banner',         # create banner
        'WR::Role::Process::InteractionDetails',   # vehicle interaction details
    );

sub model {
    my $self = shift;
    my $m    = shift;

    my ($db, $coll) = split(/\./, $m, 2);
    return $self->db->get_collection($coll);
}

sub error {
    my $self = shift;
    my $message = join(' ', @_);

    $self->_set_error($message);
    die '[process]: ', $message, "\n";
}

sub process {
    my $self = shift;
    my $lltrait = 'LL::File';

    my %args = (
        bf_key  => $self->bf_key,
    );

    if(defined($self->data)) {
        $args{data} = $self->data;
        $lltrait = 'LL::Memory';
    } elsif(defined($self->file)) {
        $args{file} = $self->file;
        $lltrait = 'LL::File';
    } else {
        die 'you must pass either a "file" or "data" parameter', "\n";
    }
    $args{traits} = [$lltrait, qw/Data::Decrypt Data::Reader Data::Attributes Data::Chat/];

    $args{cb_gun_shot_count} = sub {
        my $country = shift;
        my $gid     = shift;

        if(my $gun = $self->db->get_collection('data.components')->find_one({ component => 'guns', country => $country, component_id => $gid })) {
            return scalar(@{$gun->{shots}});
        } else {
            return 3; # fail-safe-ish
        }
    };

    $self->_set_parser(try {
        return WR::Parser->new(%args);
    } catch {
        $self->error('unable to parse replay: ', $_);
    });

    $self->error('incomplete') unless($self->_parser->is_complete);
    return {};
}

sub fuck_booleans {
    my $self = shift;
    my $obj = shift;

    return $obj unless(ref($obj));

    if(ref($obj) eq 'ARRAY') {
        return [ map { $self->fuck_booleans($_) } @$obj ];
    } elsif(ref($obj) eq 'HASH') {
        foreach my $field (keys(%$obj)) {
            next unless(ref($obj->{$field}));
            if(ref($obj->{$field}) eq 'HASH') {
                $obj->{$field} = $self->fuck_booleans($obj->{$field});
            } elsif(ref($obj->{$field}) eq 'ARRAY') {
                my $t = [];
                push(@$t, $self->fuck_booleans($_)) for(@{$obj->{$field}});
                $obj->{$field} = $t;
            } elsif(ref($obj->{$field}) eq 'JSON::XS::Boolean') {
                $obj->{$field} = ($obj->{$field}) ? true : false;
            }
        }
        return $obj;
    }
}

__PACKAGE__->meta->make_immutable;
