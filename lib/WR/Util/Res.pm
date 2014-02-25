package WR::Util::Res;
use Mojo::Base '-base';

use WR::Util::Res::Achievements;

has 'path' => undef;
has 'achievements'  =>  sub { WR::Util::Res::Achievements->new(path => shift->path) };

1;
