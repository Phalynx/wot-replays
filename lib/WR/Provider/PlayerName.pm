package WR::Provider::PlayerName;
use Mojo::Base '-base';

has 'coll'          =>  undef;
has 'ua'            =>  undef;
has 'token'         =>  undef;

sub resolve {
    my $self        = shift;
    my $server      = shift;
    my $account_id  = shift;
    my $cb          = shift;
    my $url         = 'http://api.statterbox.com/wot/account/info';

    $server = 'asia' if($server eq 'sea');
    my $form = {
        application_id  => $self->stash('config')->{statterbox}->{server},
        account_id      => $account_id,
        fields          => 'nickname',
    };
    $self->ua->post($url => form => $form, sub {
        my ($ua, $tx) = (@_);
        if(my $res = $tx->success) {
            if($res->json('/status') eq 'ok') {
                # the original name of the player comes out in nickname
                $cb->($self, undef, $res->json->{data}->{$account_id}->{nickname});
            } else {
                $cb->($self, 1, undef);
            }
        } else {
            $cb->($self, 0, undef);
        }
    });
}

1;
