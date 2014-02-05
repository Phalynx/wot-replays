package WR::App::Controller::Admin::Site;
use Mojo::Base 'WR::App::Controller';
use Mango::BSON;

sub replays {
    my $self = shift;
    my $page = $self->stash('page');
    my $query = {};

    $self->render_later;

    my $cursor = $self->model('wot-replays.replays')->find($query);
    $cursor->count(sub {
        my ($cursor, $e, $count) = (@_);
        my $maxp   = int($count/50);
        $maxp++ if($maxp * 50 < $count);

        $cursor->skip( ($page - 1) * 50 );
        $cursor->limit(50);
        $cursor->sort({ 'site.uploaded_at' => -1 });
        $cursor->fields({ panel => 1, site => 1, file => 1, game => 1 });

        $cursor->all(sub {
            my ($c, $e, $docs) = (@_);

            $self->respond(template => 'admin/site/replays', stash => {
                page => { title => 'Site - Replays' },
                maxp => $maxp,
                p    => $page,
                replays => $docs,
                total_replays => $count,
            });
        });
    });
}

1;
