

var last_uid = 0;
function uobj(me){ 
    var uid = ++last_uid; 
    me.get_uid = function(){return uid}; 
    return me
}

function init_reg(me){
    var reg = {};
    me.reg = function(obj){ reg[obj.get_uid()] = obj };
    me.unreg = function(obj){ delete reg[obj.get_uid()] };
    me.each_until = function(f){
        var res;
        for(var k in reg) if(k) if(res=f(reg[k])) return res;
    };
    return me;
}

/******************************************************************************/

function add_intersecting_control(me){
    var fields = [];
    function unitpos2idx(x,y){ 
        return Math.round(x) + Math.round(y) * me.fields_in_row;
    }
    me.rereg_intersecting_obj = function(obj){
        if(obj.intersecting_unreg) obj.intersecting_unreg();
        var i = unitpos2idx(obj.x,obj.y);
        var field = fields[i] || (fields[i]=init_reg({}));
        field.reg(obj);
        obj.intersecting_unreg = function(){ field.unreg(obj) };
    }
    me.move_obj = function(subj,x,y,f){
        var mx = x+1, my = y+1;
        var i = unitpos2idx(x,y);
        for(var dy=-1;dy<=1;dy++){
            for(var dx=-1;dx<=1;dx++){
                var field = fields[i+dy*me.fields_in_row+dx];
                if(!field) continue;
                var conflicting_obj = field.each_until(function(obj){
                    if(obj==subj) return;
                    if(obj.x>mx || x>obj.x+1 || obj.y>my || y>obj.y+1) return;
                    return f(obj);
                });
                if(conflicting_obj) return conflicting_obj;
            }
        }
        subj.x = x;
        subj.y = y;
        me.rereg_intersecting_obj(subj);
    }
    return me;
}

function add_random_wood(me){
    me.wood_reg = init_reg({});
    function random_int(l){ return Math.floor(Math.random()*l) }
    function repeat(l,f){ for(var j=0;j<l;j++) f(j) }
    function put_random_tree(obj,x,y){
        obj.x = x;
        obj.y = y;
        me.rereg_intersecting_obj(obj);
        var nr = random_int(100);
        obj.get_tile = function(){ 
            return me.tree_tiles[nr % me.tree_tiles.length] 
        };
        me.wood_reg.reg(obj);
    }
    repeat(me.fields_in_row,function(j){
        put_random_tree(uobj({}), j,0);
        put_random_tree(uobj({}), j,me.fields_in_col-1);
    });
    repeat(me.fields_in_col-2,function(j){
        put_random_tree(uobj({}), 0,j+1);
        put_random_tree(uobj({}), me.fields_in_row-1,j+1);
    });
    me.put_to_random_place = function(obj){
        var conflicting_obj = me.move_obj(
            obj,
            1+random_int(me.fields_in_row-2),
            1+random_int(me.fields_in_col-2),
            function(conflicting_obj){ return conflicting_obj}
        );
        //console.log(obj);
        if(conflicting_obj) me.put_to_random_place(obj);
    };
}

function init_images(me,cmd_list){
    var init_images_list = [];
    me.image_count = 0;
    function reg_seen_image(nm){
        me.image_count++;
        cmd_list.push({ op:'load_image', layer:nm, src:"/"+nm+".png" });
    }
    reg_seen_image('trees');
    reg_seen_image('hero_ani');
    me.tree_tiles = [];
    me.tree_tiles[0] = { layer:'trees', x:0,  y:0,  width:32, height:32 };
    me.tree_tiles[1] = { layer:'trees', x:33, y:0,  width:32, height:32 };
    me.tree_tiles[2] = { layer:'trees', x:0,  y:33, width:32, height:32 };
    me.tree_tiles[3] = { layer:'trees', x:33, y:33, width:32, height:32 };
    me.hero_tiles = [];
    me.hero_tiles[0] = { layer:'hero_ani', x:0,  y:0,  width:32, height:32 };
    me.hero_tiles[1] = { layer:'hero_ani', x:0,  y:32,  width:32, height:32 };
    me.hero_tiles[2] = { layer:'hero_ani', x:0,  y:64,  width:32, height:32 };
}


function game_init(me){
    function msg_str(list){ return JSON.stringify({ list:list }) }
    me.frame_receiver_reg = init_reg({});
    
    me.fields_in_row = 20;
    me.fields_in_col = 20;
    add_intersecting_control(me);
    add_random_wood(me);
    me.moving_reg = init_reg({});
        
    var cmd_list = [], wood_cmd_list = [];
    init_images(me,cmd_list);
    var wood_layer = init_layer( uobj({}), me, cmd_list );
    var variable_layer = init_layer( uobj({}), me, cmd_list );
    cmd_list.push({ op:'subscribe_event', tp:'keydown' });
    cmd_list.push({ op:'subscribe_event', tp:'keyup' });
    me.images_msg_str = msg_str(cmd_list);
    wood_layer.redraw(me.wood_reg,wood_cmd_list);
    me.wood_msg_str = msg_str(wood_cmd_list);
    
    setInterval(function(){
        var cur_time = (new Date).getTime() / 1000; //sec
        me.moving_reg.each_until(function(o){ o.update_position(cur_time) });
        var variable_cmd_list = [];
        variable_layer.redraw( me.moving_reg, variable_cmd_list );
        var msg = msg_str(variable_cmd_list);
        me.frame_receiver_reg.each_until(function(obj){ obj.send(msg) });
    },30);
}

/******************************************************************************/

function init_layer(me,game,cmd_list){
    function unit2px(v){ return Math.floor(v*32) };
    var uid = me.get_uid();
    me.redraw = function(reg,cmd_list){
        cmd_list.push({ op:'clear', layer:uid });
        reg.each_until(function(obj){
            var cmd = { op:'draw_image', layer:uid };
            cmd.x = unit2px(obj.x);
            cmd.y = unit2px(obj.y);
            cmd.source = obj.get_tile();
            cmd_list.push(cmd);
        });
        return cmd_list;
    };
    cmd_list.push({ 
        op:'create_canvas', 
        width:unit2px(game.fields_in_row),
        height:unit2px(game.fields_in_col),
        layer:uid
    });
    return me;
}

/******************************************************************************/

function init_conn(me,game){
    me.send(game.images_msg_str);
    var images_left = game.image_count;
    
    var hero = uobj({});
    game.put_to_random_place(hero);
    game.moving_reg.reg(hero);
    var tiles = game.hero_tiles;
    
    var dx = 0, dy = 0, speed = 3, frame_rate = 5;
    var moving_start, last_time;
    hero.get_tile = function(){
        var is_moving = dx || dy;
        moving_start = is_moving && moving_start || last_time;
        var i = !is_moving ? 2 :
            Math.floor((last_time-moving_start)*frame_rate) % tiles.length;
        return tiles[i];
    };
    hero.update_position = function(cur_time){
        var dt = last_time ? cur_time-last_time : 0;
        //console.log([dt,dx * dt]);
        var conflicting_obj = game.move_obj(
            hero, hero.x + dx * dt, hero.y + dy * dt,
            function(ob){ return ob }
        );
        last_time = cur_time;
    }
    
    me.close = function(){
        game.frame_receiver_reg.unreg(me);
        game.moving_reg.unreg(hero);
        hero.intersecting_unreg()
    };
    
    me.onmsg.loaded = function(opt){
        if((--images_left)>0) return;
        me.send(game.wood_msg_str);
        game.frame_receiver_reg.reg(me);
    };
    me.onmsg.keydown = function(opt){
        if(opt.code==37) dx = -speed;
        if(opt.code==38) dy = -speed;
        if(opt.code==39) dx = speed;
        if(opt.code==40) dy = speed;
    };
    me.onmsg.keyup = function(opt){
        if(opt.code==37) dx = 0;
        if(opt.code==38) dy = 0;
        if(opt.code==39) dx = 0;
        if(opt.code==40) dy = 0;
    };
    
}

/******************************************************************************/

var http = require('http');
var sockjs = require('sockjs');
var fs = require("fs");

var allow_dl = {'/netwood.html':1,'/trees.png':1,'/hero_ani.png':1};

var server = http.createServer(function(req,res){
    console.log('conn0');
    if(!allow_dl[req.url]){
        res.writeHead(500);
        res.end();
        return;
    }
    fs.readFile('.'+req.url,"binary",function(err,file){
        if(err){
            res.writeHead(500);
        }else{
            res.setHeader('content-type', 'text/html');
            res.writeHead(200);
            res.write(file,"binary");
        }
        res.end();
    });
});
var sockjs_server = sockjs.createServer();

var game = {};
game_init(game);

sockjs_server.on('connection', function(conn) {
    console.log('conn1');
    var oconn = uobj({ onmsg:{}, game:game });
    oconn.send = function(msg){ conn.write(msg) };
    conn.on('data', function(message){
        var msg = JSON.parse(message);
        oconn.onmsg[msg.op](msg);
    });
    init_conn(oconn,game);
    conn.on('close', function(){ oconn.close() });
});


sockjs_server.installHandlers(server, {prefix:'/sock'});
console.log(11);
server.listen(process.env.PORT||9999, '0.0.0.0');
console.log([23,process.env.PORT]);

