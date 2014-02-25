package WR::Util::ServerFinder;
use Mojo::Base '-base';

use constant SERVERS => {
    'na'        => 'worldoftanks.com/community/accounts/%d-%s/',
    'eu'        => 'worldoftanks.eu/community/accounts/%d-%s/',
    'sea'       => 'worldoftanks.asia/community/accounts/%d-%s/',
};

use constant SERVER_INDICES => {
    0           => 'eu',
    1           => 'na',
    2           => 'asia',
};

use constant SERVER_ID_MAPPING => {
    'eu'        => [ 500000000,    999999999 ],
    'na'        => [ 1000000000,  1499999999 ],
    'asia'      => [ 2000000000,  2499999999 ], 
};

# 1500000000-1999999999  may be china server
#'sea'   => [ 2500000000,  2999999999 ],  # ex vn, not sure if merged on asia or not

sub get_server_by_id {
    my $self = shift;
    my $id   = shift;

    foreach my $server (keys(%{__PACKAGE__->SERVER_ID_MAPPING})) {
        my $v = __PACKAGE__->SERVER_ID_MAPPING->{$server};
        return $server if($id >= $v->[0] && $id <= $v->[1]);
    }
    return sprintf('u:%d', $id);
}

1;
