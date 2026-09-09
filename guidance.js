/* Player-facing route cues and contextual companion subtitles. */
window.createGuidance = function ({T, player, ally, state, guide, navigation, floorAt, visible, supplies, flashlight, camera, tutorial}) {
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['objective', 'objective-step', 'objective-title', 'objective-detail', 'objective-distance',
    'waypoint', 'waypoint-icon', 'waypoint-label', 'waypoint-distance', 'companion-dialogue', 'companion-line'].map(id => [id, $(id)]));
  const steps = [...document.querySelectorAll('#objective-progress span')];
  const v = (x,y,z) => new T.Vector3(x,y,z);
  let path = [], cue = null, destination = null, cacheKey = '', anchor = {x:Infinity,z:Infinity}, nextRoute = 0;
  let spoken = new Map(), history = [], subtitleUntil = 0, subtitlePriority = 0, subtitleStarted = 0;
  let previousSupport = '', rejoinedAt = -Infinity, rejoinedFrom = '';
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const angle = a => Math.atan2(Math.sin(a),Math.cos(a));

  function reset() {
    path=[];cue=null;destination=null;cacheKey='';anchor={x:Infinity,z:Infinity};nextRoute=0;
    spoken.clear();history.length=0;subtitleUntil=0;subtitlePriority=0;subtitleStarted=0;
    previousSupport='';rejoinedAt=-Infinity;rejoinedFrom='';
    ui['companion-dialogue'].hidden=true;ui.waypoint.hidden=true;
  }

  function dialogue() {
    const now=state.time, support=ally.hp<=0?'down':guide.returning?'return':guide.status==='等你跟上'?'wait':'';
    if(previousSupport&&!support){
      rejoinedAt=now;rejoinedFrom=previousSupport;
      if(history.at(-1)?.key===previousSupport)subtitleUntil=now-.8;
    }
    previousSupport=support;
    const offers=[];
    const offer=(condition,key,text,priority=40,cooldown=Infinity)=>{
      if(condition&&(!spoken.has(key)||now-spoken.get(key)>=cooldown))offers.push({key,text,priority});
    };
    offer(support==='down','down','我倒下了……靠近我，按 E 拉我一把！',100,25);
    offer(support==='return','return','别急，我回来接你。先在原地等我。',85,30);
    offer(support==='wait','wait','我在前面等你，沿着通道跟上来。',75,30);
    offer(!support&&now-rejoinedAt<5,rejoinedFrom==='down'?'revived':'rejoin',
      rejoinedFrom==='down'?'谢了，我没事。继续跟着我走。':'跟上了就好，我们继续走。',70,15);
    if(ally.hp>0&&!support) {
      offer(!state.gate,'start',flashlight.visible?'准备好就靠近出口。出门往左，跟着我。':'先打开手电。跟我出门，外面往左走。',40);
      offer(state.gate&&guide.stage===0&&player.z>23,'left','前面封死了，往左走。沿这条通道去诊所。',60);
      offer(state.gate&&guide.stage===0&&player.x<-18&&player.z>7&&player.z<27,'alley','顺着这条巷子往前，诊所就在尽头。',45);
      offer(guide.stage===0&&player.x<-20&&player.z<=7&&player.z>-8,'clinic-door','到了，进诊所。医疗箱在里面左手边。',55);
      offer(guide.stage===1,'clinic','医疗箱在左边，需要就按 E 治疗。接下来跟我去弹药平台。',65);
      offer(guide.stage===1&&player.x>12&&player.z>-13&&player.z<7,'ramp','从前面的坡道上去，平台上能补弹。',55);
      offer(guide.stage===2&&!guide.complete,'ammo','弹药箱就在这儿，按 E 补满。下一站是泵站。',65);
      offer(guide.complete,'pump','到泵站了。先补好弹药，我们一起守住这里。',65);
      offer(player.hp<55&&supplies.some(s=>s.type==='med'&&distance(s,player)<5&&Math.abs(s.y-player.y)<1),
        'heal','你受伤了。靠近医疗箱，按 E 处理一下。',80,35);
    }
    offers.sort((a,b)=>b.priority-a.priority);
    const line=offers[0];
    const canInterrupt=line&&(line.priority===100||line.priority>subtitlePriority&&line.priority>=75&&now-subtitleStarted>1.5);
    if(line&&(now>=subtitleUntil+.8||!history.length||canInterrupt)) {
      spoken.set(line.key,now);subtitleStarted=now;subtitlePriority=line.priority;
      subtitleUntil=now+Math.min(7.2,3.5+line.text.length*.065);
      ui['companion-line'].textContent=line.text;
      history.push({key:line.key,text:line.text,time:now});if(history.length>32)history.shift();
    }
    ui['companion-dialogue'].hidden=now>=subtitleUntil;
  }

  function update() {
    const active=state.mode==='playing'&&!state.help;
    ui.objective.hidden=!active;
    if(!active){ui.waypoint.hidden=true;ui['companion-dialogue'].hidden=true;return;}
    dialogue();
    const needsAmmo=tutorial?.stage===3&&guide.stage>=2&&!tutorial.facts.has('ammoBox');
    const rescuing=ally.hp<=0, finished=guide.complete&&!rescuing&&!needsAmmo;
    const target=rescuing?{x:ally.x,z:ally.z,y:ally.y,short:'林'}:
      needsAmmo?{x:20.2,z:-22,y:2.7,short:'弹药箱'}:!state.gate?{x:0,z:30.5,y:0,short:'出口'}:guide.target();
    destination=target;
    ui['objective-step'].textContent=rescuing?'队友救援':finished?'路线完成':!state.gate?'准备出发':`当前目标 · ${guide.stage+1} / 3`;
    ui['objective-title'].textContent=rescuing?'扶起林':finished?'守住泵站':!state.gate?'离开安全屋':`前往${target.short}`;
    if(needsAmmo&&!rescuing){ui['objective-step'].textContent='新手任务 · 补充装备';ui['objective-title'].textContent='检查平台弹药箱';}
    steps.forEach((step,i)=>{
      step.dataset.state=guide.complete||i<guide.stage?'done':i===guide.stage?'current':'pending';
      step.setAttribute('aria-current',!guide.complete&&i===guide.stage?'step':'false');
    });
    const key=(rescuing?'rescue':needsAmmo?'tutorial-ammo':!state.gate?'exit':guide.stage)+':'+navigation.revision;
    if(target&&(key!==cacheKey||state.time>=nextRoute||distance(anchor,player)>.9)) {
      path=navigation.route(player,target,.52);cacheKey=key;anchor={x:player.x,z:player.z};nextRoute=state.time+.5;
    } else if(!target)path=[];
    let length=0, last=player;
    for(const p of path){length+=Math.hypot(p.x-last.x,p.z-last.z,floorAt(p.x,p.z)-(last.y??floorAt(last.x,last.z)));last=p;}
    if(target)length+=distance(last,target);
    ui['objective-distance'].textContent=target&&path.length?`${Math.ceil(length)} m`:'';
    let detail=rescuing?'靠近林，按 E 扶起队友':finished?'留意来敌，与林一起守住这里':!state.gate?
      '向前靠近出口，出门后左转':guide.stage===0?
        player.z>23?'出门左转，沿唯一通道前往诊所':player.z>3?'沿巷子前进，从正门进入诊所':'进入诊所，左侧有医疗补给':
        guide.stage===1?'跟随林，经坡道登上弹药平台':'跟随林，进入北侧泵站';
    const usable=supplies.find(s=>distance(s,player)<2.7&&Math.abs(s.y-player.y)<1&&s.ready<=state.time&&
      (s.type==='med'?player.hp<100:player.ammo<30||player.reserve<240));
    if(usable&&!rescuing)detail=usable.type==='med'?'附近有医疗箱 · 按 E 治疗':'附近有弹药箱 · 按 E 补弹';
    if(needsAmmo&&!rescuing)detail='靠近平台弹药箱，按 E 检查并领取烟雾弹';
    ui['objective-detail'].textContent=detail;
    ui.objective.dataset.urgent=rescuing?'true':'false';
    ui.waypoint.hidden=!target;
    if(!target){cue=null;return;}

    // Look only as far ahead as the player can walk and see; the cue never points
    // through the closed street toward the destination on the other side of a wall.
    let next=null;
    for(const p of path) {
      if(distance(player,p)>7)break;
      if(!navigation.clear(player,p,.52))break;
      const y=floorAt(p.x,p.z)+.8;
      if(visible(v(player.x,player.y+1.6,player.z),v(p.x,y,p.z)))next={...p,y:y-.8};
    }
    const close=distance(player,target)<2.7&&Math.abs(player.y-target.y)<1;
    if(close&&navigation.clear(player,target,.52))next=target;
    if(!next){ui.waypoint.hidden=true;cue=null;return;}
    const dx=next.x-player.x,dz=next.z-player.z,bearing=angle(Math.atan2(-dx,-dz)-player.yaw);
    const turning=Math.abs(bearing)>.55, behind=Math.abs(bearing)>2.35;
    const instruction=rescuing&&close?'按 E 扶起林':!state.gate?'靠近出口':behind?'转身沿通道前进':
      turning?(bearing>0?'向左转':'向右转'):close?`抵达${target.short}`:'沿通道前进';
    cue={...next,bearing,instruction,distance:length,target:target.short};
    ui['waypoint-icon'].textContent=rescuing&&close?'E':behind?'↶':turning?(bearing>0?'←':'→'):'◇';
    ui['waypoint-label'].textContent=instruction;
    ui['waypoint-distance'].textContent=`${target.short} · ${Math.ceil(length)} m`;
    camera.updateMatrixWorld(true);
    const point=v(next.x,next.y+.85,next.z), projected=point.clone().project(camera);
    const ahead=point.clone().sub(camera.position).dot(camera.getWorldDirection(v(0,0,0)))>0;
    const marginX=Math.min(120,innerWidth*.2),top=Math.min(195,innerHeight*.38);
    const prompts=document.getElementById('player-prompts'),promptTop=prompts?.getBoundingClientRect().top??innerHeight;
    const bottom=Math.min(innerHeight-Math.min(205,innerHeight*.33),promptTop-44);
    let x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
    if(!ahead){x=bearing>0?marginX:innerWidth-marginX;y=innerHeight*.48;}
    x=T.MathUtils.clamp(x,marginX,innerWidth-marginX);y=T.MathUtils.clamp(y,top,Math.max(top,bottom));
    ui.waypoint.style.left=x+'px';ui.waypoint.style.top=y+'px';
  }
  return {update,reset,get path(){return path;},get cue(){return cue;},get destination(){return destination;},get history(){return history;}};
};
