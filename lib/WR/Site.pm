package WR::Site;
use Mojo::Base 'Mojolicious';
use Mojo::JSON;
use Mango;
use Time::HiRes qw/gettimeofday/;

use WR;
use WR::Util::Res;
use WR::Util::Query;
use WR::Util::QuickDB;
use WR::Common::Helpers;
use WR::Site::Helpers;
use WR::Site::Routes;

sub startup {
    my $self = shift;
    my $config = $self->plugin('Config', { file => 'wr.conf' });

    $self->secrets([ $config->{secrets}->{app} ]);
    $config->{wot}->{bf_key} = join('', map { chr(hex($_)) } (split(/\s/, $config->{wot}->{bf_key})));

    $self->sessions->default_expiration(86400 * 365); 
    $self->sessions->cookie_name('wrsession');
    $self->sessions->cookie_domain($config->{urls}->{app_c}) if(!defined($config->{mode}) || $config->{mode} ne 'dev');

    $self->plugin('WR::Plugin::Mango', $config->{mongodb});

    for(qw/Auth I18N Timing Notify/) {
        $self->plugin(sprintf('WR::Plugin::%s', $_));
    }

    $self->plugin('WR::Plugin::Thunderpush', $config->{thunderpush});

    $self->renderer->paths([]); # clear this out
    $self->plugin('Mojolicious::Plugin::TtRenderer', {
        template_options => {
            PRE_CHOMP    => 0,
            POST_CHOMP   => 1,
            TRIM => 1,
            FILTERS => {
                'js' =>  sub {
                    my $text = shift;
                    $text =~ s/\'/\\\'/gi;
                    return $text;
                },
                'tabtospan' =>  sub {
                    my $text = shift;
                    $text =~ s/\\t/<br\/><span style="margin-left: 20px"><\/span>/g;
                    return $text;
                },
                'ucfirste' => sub {
                    my $text = shift;

                    return join(' ', map { ucfirst($_) } (split(/\s/, $text)));
                },
            },
            RELATIVE => 1,
            ABSOLUTE => 1, # otherwise hypnotoad gets a bit cranky, for some reason
            INCLUDE_PATH => [ $self->app->home->rel_dir('templates') ],
            COMPILE_DIR  => undef,
            COMPILE_EXT  => undef,
        },
    });
    $self->types->type(csv => 'text/csv; charset=utf-8');
    $self->renderer->default_handler('tt');

    $self->routes->namespaces([qw/WR::App::Controller/]);
    my $r = $self->routes->bridge('/')->to(cb => sub {
        my $self = shift;
        return $self->init_auth();
    });

    WR::App::Routes->install($self => $r);
    WR::App::Helpers->install($self);

    has 'wr_res' => sub { return WR::Res->new() };


    my $preload = [ 'components', 'consumables', 'customization', 'equipment', 'maps', 'vehicles' ];
    foreach my $type (@$preload) {
        my $aname = sprintf('data_%s', $type);
        $self->attr($aname => sub {
            my $self = shift;
            return WR::QuickDB->new(data => $self->mango->db('wot-replays')->collection(sprintf('data.%s', $type))->find()->all());
        });
        $self->helper($aname => sub {
            return shift->app->$aname();
        });
        $self->$aname();
    }


    # eeeevil shenanigans here to check the hostname to see if we're locked into a specific context, currently it's only
    # supported for server clusters, and sets a default filter 
    $self->hook(before_routes => sub {
        my $c = shift;

        if(my $host = $c->req->url->to_abs->host) {
            # we can get this from config
            if(defined($c->config('context')) && defined($c->config('context')->{$host})) {
                # later we need to figure something out so that any options set in context filter 
                # are locked on the filter sidebar (or flat out removed, if need be)
                $c->stash('context.filter' => $c->config('context')->{$host}->{browse_filter});
                $c->stash('frontpage.filter' => $c->config('context')->{$host}->{frontpage_filter});
            }
            $c->stash('request.host' => $host);
            $c->debug('request to host: ', $host);
        }
    });
}

1;
