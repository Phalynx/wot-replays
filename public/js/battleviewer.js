/*
    wotreplays.org battle viewer 2.0 20131208 0500
    requires the mapgrid

    Based on work done by Evido (http://github.com/evido)
   
    Alterations by Scrambled:
    - Use HTML5 instead of canvas
    - Modified to use the different packet format that wotreplays.org writes out

    Feel free to copy and use for your own purposes
*/
var Player = function(id, options) {
	this.id 		    = id;
    this.name           = options.name;
    this.type           = options.type;
    this.enemy          = options.enemy;
    this.team           = options.team;
    this.hp             = options.hp;
    this.recorder       = options.recorder;
    this.container      = options.container;
	this.health         = options.hp;
	this.position 	    = null;
	this.alive		    = null;
	this.clock		    = null;
    this.hull_dir       = null;
    this.age            = 0;
    this.alive          = true;
    this.seen           = false;

    var element = $('<div/>').attr('id', 'player-' + this.id).addClass('player');
    if(this.recorder) {
        element.addClass('recorder');
    } else {
        element.addClass( (this.enemy) ? 'enemy' : 'friendly' );
        element.addClass('type_' + this.type);
    }
    element.attr('playerName', this.name);

    var playerIcon      = $('<div/>').addClass('player-icon');
    var playerHealth    = $('<div/>').addClass('playerhealth').attr('id', 'player-health-' + this.id);
    var playerBar    = $('<div/>').addClass('player-healthbar').append(playerHealth);

    element.append(playerIcon, playerBar);

    this.element    = element;
    this.healthbar  = playerHealth;
    this.playerbar  = playerBar;
    this.icon       = playerIcon;

    $(this.container).append(element);
    this.hide(); // because we'll show the second we get our first position update
}
Player.prototype = {
    hide: function() {
        $(this.element).hide();
    },
    setAge: function(newAge) {
        this.age = newAge;
        if(this.seen && this.alive) $(this.element).css({ opacity: 1 - this.age });
    },
    show: function() {
        if(this.seen) $(this.element).show();
    },
    move: function(coords) {
        if(!this.seen) {
            this.seen = true;
            this.show();
        }
        $(this.element).css({ top: coords.y - (17/2), left: coords.x - (17/2) });
        this.position = coords;
    },
    getPosition: function() {
        return this.position;
    },
    rotate: function(hull_dir) {
        // the hull direction is in fact in radians, so convert to degrees first
        this.hull_dir = hull_dir;
        var degrees = hull_dir * (180 / Math.PI);
        var c = {
            '-moz-transform': 'rotate(' + Math.round(degrees) + 'deg)',
            '-ms-transform': 'rotate(' + Math.round(degrees) + 'deg)',
            '-webkit-transform': 'rotate(' + Math.round(degrees) + 'deg)',
            '-o-transform': 'rotate(' + Math.round(degrees) + 'deg)',
            'transform': 'rotate(' + Math.round(degrees) + 'deg)'
        };
        // we don't use our element but we use #recorder-icon instead
        if(this.recorder) this.icon.css(c);
    },
    updateHealth: function(newhealth) {
        if(newhealth < 0) newhealth = 0;
        var oldHealth = this.health;
        if(this.hp > 0) {
            if(newhealth > 0) {
                var percentage_of = Math.floor(100/(this.hp/newhealth));
                if(percentage_of > 100) percentage_of = 0; // for some reason ammo rackings cause this to go really badly wrong
                this.healthbar.css({ width: percentage_of + '%' });
            } else {
                this.healthbar.css({ width: '0%' });
            }
        } 
        this.health = newhealth;
        var diff = oldHealth - newhealth;
        return diff;
    },
    death: function() {
        this.alive = false; 
        this.updateHealth(0);
        $(this.element).addClass('dead'); // meh
        $(this.element).css({ opacity: 0.8 });
        this.playerbar.hide();
    }
};
var Arena = function(options) {
    this.container          = options.container;
    this.players            = {};
    this.clock              = 0;
    this.period             = 0;
    this.period_length      = -1;
    this.clock_at_period    = 0;
    this.handlers           = { 'chat': [], 'period': [], 'attention': [] };
    this.playerTeam         = -1;
    this.coordinateConvert  = options.coordinateConvert;
    this.tracerCount        = 0;
    this.deathLocations     = new Array();
    this.bases              = new Array();
    this.controlPoint       = null;
    this.arenaID            = 0;
};
Arena.prototype = {
    addControlPoint: function(control) {
        this.controlPoint = control;
    },
    addBasePoint: function(team, baseNumber, base) {
        if(!this.bases[team]) this.bases[team] = new Array();
        this.bases[team][baseNumber] = base;
    },
    onChat: function(handler) {
        this.handlers.chat.push(handler);
    },
    onPeriodChange: function(handler) {
        this.handlers.period.push(handler);
    },
    onAttention: function(handler) {
        this.handlers.attention.push(handler);
    },
    setPlayerTeam: function(team) {
        this.playerTeam = team;
    },
    hideAllPlayers: function() {
        this.getAllPlayers().forEach(function(player) {
            player.hide();
        });
    },
    getDeathLocations: function() {
        return this.deathLocations;
    },
    addDeathLocation: function(destroyed) {
        var dpos = destroyed.getPosition();
        if(dpos == null) return;
        dpos.x = Math.round(dpos.x);
        dpos.y = Math.round(dpos.y);
        if(!this.deathLocations[dpos.x]) this.deathLocations[dpos.x] = new Array();
        if(!this.deathLocations[dpos.x][dpos.y]) {
            this.deathLocations[dpos.x][dpos.y] = 1;
        } else {
            this.deathLocations[dpos.x][dpos.y]++;
        }
    },
    addPlayer: function(player) {
        this.players[player.id] = new Player(player.id, {
            container   : this.container, 
            name        : player.name,
            hp          : player.hp,
            enemy       : this.isEnemyTeam(player.team),
            team        : player.team,
            type        : player.type,
            recorder    : player.recorder,
        });
    },
    convertGamePosition: function(arrayPos) {
        return this.coordinateConvert(arrayPos);
    },
    convertArrayPosition: function(arrayPos) {
        return this.coordinateConvert([ arrayPos[0], 0, arrayPos[1] ]);
    },
    getPlayer: function(id) {
        return this.players[id];
    },
    getAllPlayers: function() {
        var o = [];
        for(k in this.players) {
            o.push(this.players[k]);
        }
        return o;
    },
    updateChatRaw: function(message) {
        $(message).addClass('clearfix');
        this.dispatch('chat', message);
    },
    updateChat: function(message) {
        var m = $('<div>').addClass('clearfix').html(message);
        this.dispatch('chat', m);
    },
    dispatch: function(type, e) {
        this.handlers[type].forEach(function(handler) {
            handler.bind(this)(e);
        });
    },
    isEnemyTeam: function(number) {
        return (number == this.playerTeam) ? false : true;
    },
    isEnemy: function(player) {
        return player.enemy;
    },
    teamColorName: function(player) {
        var s = $('<span>');
        if(this.isEnemy(player)) {
            $(s).addClass('enemy');
        } else {
            $(s).addClass('friendly');
        }
        $(s).text(player.name);
        return s;
    },
    frameIsArena: function(frame) {
        return (frame.id == this.arenaID) ? true : false;
    },
    update: function(frame) {
		if(frame.clock != null && frame.clock >= this.clock) this.clock = frame.clock;
        if(frame.arena_unique_id) {
            this.arenaID = frame.player_id;
            return;
        } else if (frame.period) {
            this.period = frame.period;
            this.dispatch('period', { period: frame.period });
            this.period_length = frame.period_length;
            this.clock_at_period = this.clock;$
            return;
        } else if (typeof(frame.text) != 'undefined') {
            this.updateChat(frame.text);
            return;
        } else if(typeof(frame.cell_id) != 'undefined') {
            this.dispatch('attention', frame.cell_id);
            return;
        }

        // all frames SHOULD have an id property after the above two
        if(typeof(frame.id) != 'undefined') {
            if(!this.frameIsArena(frame)) {
			    var player = this.getPlayer(frame.id);
                if(player) {
                    player.clock = this.clock;
                    if(typeof(frame.position) != 'undefined') {
                        player.move(this.convertGamePosition(frame.position));
                    }
                    if(typeof(frame.orientation) != 'undefined' && player.recorder) {
                        player.rotate(frame.orientation[0]);
                    } 
                    if(typeof(frame.health) != 'undefined') {
                        if(player.alive) {
                            player.updateHealth(frame.health);
                            if (typeof(frame.source) != 'undefined') {
                                var source = this.getPlayer(frame.source);
                                if(source && source.position) {
                                    this.drawTracer(source.position, player.position);
                                }
                            }
                        }
                    }  
                } else {
                    //console.log('[NON_ARENA_INVALID_PLAYER]: A non-arena frame refers to a player ID that does not exist. Arena ID: ', this.arenaID, ' frame: ', frame);
                }
            } else {
                // arena-keyed packets
                if(typeof(frame.destroyer) != 'undefined' && typeof(frame.destroyed) != 'undefined') {
                    var destroyed = this.getPlayer(frame.destroyed);
                    var destroyer = this.getPlayer(frame.destroyer);
                    if(destroyer && destroyed) {
                        this.updateChatRaw( 
                            $('<div>').append(
                                this.teamColorName(destroyer),
                                $('<b>').css({ 'margin-left': '5px', 'margin-right': '5px' }).text('destroyed'),
                                this.teamColorName(destroyed) 
                            )
                        );
                        destroyed.death();
                        this.addDeathLocation(destroyed);
                    }
                } else if(typeof(frame.ident) != 'undefined') {
                    //console.log('[FRAME_WITH_IDENT]: got frame with identifier: ', frame);
                    if(frame.ident == 'arena.base_points') {
                        if(this.bases && this.bases[frame.team - 1]) {
                            var base = this.bases[frame.team - 1][frame.baseID - 1];
                            if(!base) return;
                            if(!base.stateInit) {
                                base.stateInit = true;
                            } else {
                                if(frame.capturingStopped == 1) {
                                    base.stopCapturing();
                                    //console.log('[STOP_CAPTURING]: ', base);
                                } else {
                                    base.captureProgress(frame.points, this.isEnemyTeam(frame.team));
                                    //console.log('[CAPTURE_PROGRESS]: ', base);
                                }
                            }
                        }
                    } else if(frame.ident == 'arena.base_captured') {
                        if(this.bases && this.bases[frame.team - 1]) {
                            var base = this.bases[frame.team - 1][frame.baseID - 1];
                            if(!base) return;
                            if(!base.stateInit) {
                                base.stateInit = true;
                            } else {
                                base.hasBeenCaptured(this.isEnemyTeam(frame.team));
                            }
                        }
                    }
                }
            }
        }
        var me = this;
        this.getAllPlayers().forEach(function(player) {
            var age = (me.clock - player.clock) / 20;
            age = age > 0.66 ? 0.66 : age;
            player.setAge(age);
        });
	},
    delta: function(a, b) {
        if(a < b) {
            return b - a;
        } else {
            return a - b;
        }
    },
    difference: function(a, b) {
        return a - b;
    },
    distance: function(p1, p2) {
        // distance = sqrt(a^2 + b^2) 
        var a = this.delta(p1.x, p2.x);
        var b = this.delta(p1.y, p2.y);
        var d = Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));
        return d;
    },
    min: function(a, b) {
        if(a < b) {
            return a;
        } else {
            return b;
        }
    },
    max: function(a, b) {
        if(a > b) {
            return a;
        } else {
            return b;
        }
    },
    drawTracer: function(s, t) {
        s.x = Math.round(s.x);
        s.y = Math.round(s.y);
        t.x = Math.round(t.x);
        t.y = Math.round(t.y);

        var length = this.distance(s, t);

        // if(length < 50) return; // no need to jump through the hoops for a tiny-dicked tracer

        var tracer = $('<div>').attr('id', 'tracer-' + this.tracercount).addClass('tracer');
        $(tracer).css({ 
            'top': s.y + 'px',
            'left': s.x + 'px',
            'position': 'absolute',
            '-moz-transform-origin': '0% 0%',
            '-webkit-transform-origin': '0% 0%',
            '-o-transform-origin': '0% 0%',
            '-ms-transform-origin': '0% 0%',
            'transform-origin': '0% 0%',
            'width': length + 'px',
            'z-index': 5,
        });

        // figure out which quad we need
        var quad = 1;
        if(s.y >= t.y) {
            if(s.x <= t.x) quad = 1;
            if(s.x > t.x) quad = 4;
        } else {
            // s.y < t.y
            if(s.x <= t.x) quad = 2;
            if(s.x > t.x) quad = 3;
        }

        // we need to add quad * 90 degrees to the end result, but since we're
        // dealing with CSS transforms, angle 0 is actually angle 90 so, quad - 1 * 90

        var x_delta = this.delta(s.x, t.x);
        var y_delta = this.delta(s.y, t.y);
        var atan = Math.atan2(y_delta, x_delta);
        if(atan < 0) atan = atan * -1; 

        var atan_angle = atan * 180 / Math.PI;

        var angle = 0;
        if(quad == 1) {
            angle = 360 - atan_angle; // because we need to flip it around
        } else if(quad == 2) {
            angle = atan_angle; // because this works
        } else if(quad == 3) {
            // 90 + atan_angle
            angle = 180 - atan_angle;
        } else {
            // quad 4, 180 + atan_angle 
            angle = 180 + atan_angle;
        }

        angle = Math.round(angle);
        
        $(tracer).css({
            'transform': 'rotate(' + angle + 'deg)',
            '-ms-transform': 'rotate(' + angle + 'deg)',
            '-o-transform': 'rotate(' + angle + 'deg)',
            '-webkit-transform': 'rotate(' + angle + 'deg)',
            '-moz-transform': 'rotate(' + angle + 'deg)'
        });

        $(tracer).attr('source', s.x + ',' + s.y);
        $(tracer).attr('target', t.x + ',' + t.y);

        $(this.container).append($(tracer));
        $(tracer).hide().fadeIn(this.updateSpeed, function() {
            $(tracer).fadeOut(400, function() {
                $(tracer).remove();
            });
        });
        this.tracercount++;
    },
};

var BattleViewer = function(options) {
    this.mapGrid = new MapGrid({
        container: options.container,
        ident: options.map.ident,
        map: {
            bounds: options.map.bounds,
            width: options.map.width,
            height: options.map.height,
        }
    });
    this.positions      = options.map.positions;
    this.gameType       = options.gametype;
    this.tracercount    = 1;
    this.packet_url     = options.packets;
    this.onError        = options.onError;
    this.onLoaded       = options.onLoaded;
    this.stopping       = false;
    this.updateSpeed    = 100; // realtime?
    this.container      = options.container;
    this.arena          = new Arena({ container: this.mapGrid.getOverlay('viewer'), coordinateConvert: this.mapGrid.game_to_map_coord.bind(this.mapGrid) });
    this.handlers       = {
        loaded: [],
        error: [],
        progress: [],
        start: [],
        stop: [],
    };

    this.arena.setPlayerTeam(options.playerTeam);
    this.initializeItems();
};

BattleViewer.prototype = {
    _handle: function(what, handler) {
        this.handlers[what].push(handler);
    },
    onStart: function(handler) {
        this._handle('start', handler);
    },
    onPacketsProgress: function(handler) {
        this._handle('progress', handler);
    },
    onPacketsError: function(handler) {
        this._handle('error', handler);
    },
    onPacketsLoaded: function(handler) {
        this._handle('loaded', handler);
    },
    onStop: function(handler) {
        this._handle('stop', handler);
    },
    initializeItems: function() {
        var bv = this;
        this.mapGrid.addItem('clock', $('<div/>').attr('id', 'battleviewer-clock').html('--:--'));
        if(this.gameType == 'ctf') {
            for(i = 0; i < this.positions.base.length; i++) {
                this.positions.base[i].forEach(function(basedata) {
                    var isEnemy = bv.getArena().isEnemyTeam(i + 1);
                    var base = new BasePoint();
                    if(isEnemy) {
                        base.setEnemy();
                    } else {
                        base.setFriendly();
                    }
                    base.setPosition(bv.getArena().convertArrayPosition(basedata));
                    bv.mapGrid.addItem('base-' + i, base.render().el);
                    // we want the arena to get a copy too
                    bv.getArena().addBasePoint(i, 0, base); // 0 because it's 0-based >_<
                });
            }
            for(i = 0; i < this.positions.team.length; i++) {
                if(this.positions.team[i] != null) {
                    for(j = 0; j < this.positions.team[i].length; j++) {
                        var spawn = new SpawnPoint();
                        spawn.setPoint(j + 1);
                        if(bv.getArena().isEnemyTeam(i + 1)) {
                            spawn.setEnemy();
                        } else {
                            spawn.setFriendly();
                        }
                        spawn.setPosition(bv.getArena().convertArrayPosition(this.positions.team[i][j]));
                        bv.getMapGrid().addItem('spawn-' + i + '-' + j, spawn.render().el);
                    }
                }
            }
        } else if(this.gameType == 'assault') {
            // depending on who's owning the base...
            var control = new BasePoint();
            if(this.positions.base[0] == null) {
                control.setPosition(bv.getArena().convertArrayPosition(this.positions.base[1][0]));
                if(this.getArena().isEnemyTeam(2)) {
                    control.setEnemy();
                } else {
                    control.setFriendly();
                }
            } else {
                control.setPosition(bv.getArena().convertArrayPosition(this.positions.base[0][0]));
                if(this.getArena().isEnemyTeam(1)) {
                    control.setEnemy();
                } else {
                    control.setFriendly();
                }
            }

            bv.getMapGrid().addItem('base-control', control.render().el);

            // now iterate over the spawn points for both teams
            for(i = 0; i < this.positions.team.length; i++) {
                if(this.positions.team[i] != null) {
                    for(j = 0; j < this.positions.team[i].length; j++) {
                        var spawn = new SpawnPoint();
                        spawn.setPoint(j + 1);
                        if(bv.getArena().isEnemyTeam(i + 1)) {
                            spawn.setEnemy();
                        } else {
                            spawn.setFriendly();
                        }
                        spawn.setPosition(bv.getArena().convertArrayPosition(this.positions.team[i][j]));
                        bv.mapGrid.addItem('spawn-' + i + '-' + j, spawn.render().el);
                    }
                }
            }
        } else if(this.gameType == 'domination') {
            // set the control point
            var control = new BasePoint();
            control.setNeutral();
            control.setPosition(bv.getArena().convertArrayPosition(this.positions.control[0]));
            bv.mapGrid.addItem('base-control', control.render().el);

            // add the team spawns
            for(i = 0; i < this.positions.team.length; i++) {
                for(j = 0; j < this.positions.team[i].length; j++) {
                    var isEnemy = bv.getArena().isEnemyTeam(i + 1);
                    var spawn = new SpawnPoint();
                    spawn.setPoint(j + 1);
                    if(isEnemy) {
                        spawn.setEnemy();
                    } else {
                        spawn.setFriendly();
                    }
                    spawn.setPosition(bv.getArena().convertArrayPosition(this.positions.team[i][j]));
                    bv.mapGrid.addItem('spawn-' + i + '-' + j, spawn.render().el);
                }
            }
        }
    },
    getMapGrid: function() {
        return this.mapGrid;
    },
    getArena: function() {
        return this.arena;
    },
	start: function() {
        var bv = this;
        this.mapGrid.render();
        $.ajax({
            url: this.packet_url,
            type: 'GET',
            dataType: 'json',
            crossDomain: true,
            timeout: 60000,
            success: function(d, t, x) {
                bv.packets = d;
                bv.dispatch('loaded'); 
            },
            error: function(j, t, e) {
                bv.dispatch('error', { error: t + ", " + e });
            },
            xhr: function() {
                var xhr = jQuery.ajaxSettings.xhr();
                xhr.addEventListener('progress', function(evt) {
                    var percent = 0;
                    if (evt.lengthComputable) {
                        percent = Math.ceil(100/(evt.total / evt.loaded));
                    }
                    bv.dispatch('progress', percent);
                })
                return xhr;
            }
        });
        this.dispatch('start');
    },
    stop: function() {
        this.stopping = true;
    },
    setSpeed: function(newspeed) {
        this.updateSpeed = newspeed;
    },
    dispatch: function(type, e) {
        if(!this.handlers[type]) this.handlers[type] = [];
        this.handlers[type].forEach(function(handler) {
            handler.bind(this)(e);
        });
    },
    updateClock: function() {
        var clockHtml = '--:--';
        if(this.getArena().period_length > 0) {
	        var clockseconds = this.getArena().period_length - (this.getArena().clock - this.getArena().clock_at_period);
	        var minutes = Math.floor(clockseconds / 60);
	        var seconds = Math.floor(clockseconds - minutes * 60);
	        seconds = (seconds < 10 ? '0' + seconds : seconds);
	        minutes = (minutes < 10 ? '0' + minutes : minutes);
	        clockHtml = minutes + ":" + seconds;
        } 
        this.mapGrid.getItem('clock').html(clockHtml);
    },
    replay: function() {
        var me = this;
		var update = function(arena, packets, window_start, window_size, start_ix) {
			var window_end = window_start + window_size, ix;
			for (ix = start_ix; ix < packets.length; ix++) {
				var packet = packets[ix];
				if (typeof(packet.clock) == 'undefined' && (typeof(packet.period) == 'undefined')) continue; // chat has clock, period doesnt(?)
				if (packet.clock > window_end) break;
                arena.update(packet);
			}

            this.updateClock(); // should really, really be part of something else

            if(this.stopping) ix = packets.length;
			if (ix < packets.length) {
                setTimeout(update.bind(this, this.getArena(), packets, window_end, window_size, ix), this.updateSpeed);	
            } else {
                this.dispatch('stop');
            }
		}
		update.call(this, this.arena, this.packets, 0, 0.1, 0);
	},
};
