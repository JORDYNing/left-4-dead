/* Squad memory, independent attack slots, suppression and reserved cover positions. */
window.createEnemyTactics=function({T,player,ally,enemies,colliders,navigation,floorAt,visible,state,toast,audio}) {
  const squads=new Map(),claims=new Map(),spawnHistory=[];
  const roles=['assault','flank-left','flank-right','assault'];
  const names={assault:'压进', 'flank-left':'左侧包抄','flank-right':'右侧包抄',defend:'退守',cover:'借掩体接近',search:'搜索'};
  let serial=0,callCooldown=0;
  const stats={reports:0,flankOrders:0,coverOrders:0};
  const covers=colliders.filter(c=>c.cover);
  const vector=(a,h=1.4)=>new T.Vector3(a.x,(a.y??floorAt(a.x,a.z))+h,a.z);
  function report(e,location,kind='sighting') {
    const squad=squads.get(e.squad);if(!squad)return;
    squad.lastKnown={x:location.x,z:location.z};squad.seenAt=state.time;squad.kind=kind;
    if(state.time-squad.lastCall>3) {
      squad.lastCall=state.time;stats.reports++;
      // Nearby groups hear the call, so a flanker can act without seeing through a wall.
      for(const other of squads.values())if(other!==squad&&Math.hypot(other.origin.x-e.x,other.origin.z-e.z)<30){other.lastKnown={...squad.lastKnown};other.seenAt=state.time;}
      if(callCooldown<=0&&Math.hypot(e.x-player.x,e.z-player.z)<28){audio.play('enemyCall',{pan:Math.sin(Math.atan2(e.x-player.x,e.z-player.z)+player.yaw),distance:Math.hypot(e.x-player.x,e.z-player.z)});callCooldown=5;}
    }
  }
  function release(e){if(e.coverKey)claims.delete(e.coverKey);e.coverKey=null;e.coverPoint=null;e.crouching=false;}
  function assign(e,where) {
    e.id=serial++;e.squad=where.squad??Math.floor(e.id/4);e.role=e.type==='guard'?'cover':e.type==='stalker'?(e.id%2?'flank-left':'flank-right'):roles[e.id%4];
    if(!squads.has(e.squad))squads.set(e.squad,{lastKnown:{x:player.x,z:player.z},seenAt:state.time,lastCall:-10,origin:{x:e.x,z:e.z}});
    Object.assign(e,{behavior:e.role,decision:Math.random()*.4,routeTimer:0,path:[],suppressed:0,stagger:0,coverTime:0,coverCooldown:0,coverKey:null,coverPoint:null,flankDone:false,blockedTime:0});
    if(e.role.startsWith('flank'))stats.flankOrders++;
  }
  function coverFor(e,target,retreat) {
    let best=null,score=Infinity;
    const current=Math.hypot(e.x-target.x,e.z-target.z);
    for(let ci=0;ci<covers.length;ci++) {
      const c=covers[ci];if(!c.active)continue;
      const cx=c.x-target.x,cz=c.z-target.z,len=Math.hypot(cx,cz)||1;
      // The far face shields the body; side faces offer distinct occupied slots.
      const candidates=Math.abs(cx/c.w)>Math.abs(cz/c.d)?[
        {x:c.x+Math.sign(cx)*(c.w/2+e.radius+.24),z:c.z},
        {x:c.x+Math.sign(cx)*(c.w/2+e.radius+.24),z:c.z+c.d*.32},
      ]:[
        {x:c.x,z:c.z+Math.sign(cz)*(c.d/2+e.radius+.24)},
        {x:c.x+c.w*.32,z:c.z+Math.sign(cz)*(c.d/2+e.radius+.24)},
      ];
      for(let j=0;j<candidates.length;j++) {
        const p=candidates[j],key=String(ci),d=Math.hypot(p.x-e.x,p.z-e.z),range=Math.hypot(p.x-target.x,p.z-target.z);
        if(d>12||d<.1||range<3||range>current+(retreat?9:1)||claims.has(key)&&claims.get(key)!==e.id)continue;
        if(!navigation.clear(p,p,e.radius))continue;
        if(visible(vector(target,1.5),vector(p,c.cover==='low'?.65:1.4)))continue;
        const f=navigation.fieldTo(p,e.radius),at=navigation.cell(e.x,e.z);if(f.cost[at]<0)continue;
        const value=d+range*.15+(c.cover==='high'?0:2)+(retreat?-range*.3:0);
        if(value<score){score=value;best={...p,key,type:c.cover,collider:c};}
      }
    }
    if(best){release(e);claims.set(best.key,e.id);e.coverKey=best.key;e.coverPoint=best;e.coverTime=0;stats.coverOrders++;}
    return best;
  }
  function decide(e,dt) {
    e.decision-=dt;
    if(e.decision>0)return;
    e.decision=.65+((e.id*17)%11)*.037;
    const squad=squads.get(e.squad),d=Math.hypot(e.x-player.x,e.z-player.z);
    if(d<34&&visible(vector(e),vector(player)))report(e,player);
    const target=squad.lastKnown;
    if(e.coverPoint&&(!e.coverPoint.collider.active||e.coverTime> (e.behavior==='defend'?2.1:1.2)||d<3)) {
      release(e);e.coverCooldown=5;e.suppressed=0;
    }
    if(!e.coverPoint&&e.coverCooldown<=0&&d>4&&(e.suppressed>0||e.type==='guard'&&d<23)) {
      const point=coverFor(e,target,e.suppressed>0);
      if(point)e.behavior=e.suppressed>0?'defend':'cover';
    }
    if(e.coverPoint){e.goal=e.coverPoint;return;}
    if(state.time-squad.seenAt>10){
      e.behavior='search';const angle=e.id*2.399+Math.floor(state.time/5)*1.7;
      e.goal={x:target.x+Math.sin(angle)*5,z:target.z+Math.cos(angle)*5};return;
    }
    e.behavior=e.role==='cover'?'assault':e.role;
    if(e.role.startsWith('flank')&&!e.flankDone&&d>4) {
      const sign=e.role==='flank-left'?-1:1;
      // Fixed world-side staging points rotate with the player's facing at first assignment,
      // rather than chasing a moving perpendicular and endlessly orbiting the player.
      if(!e.flankGoal||Math.hypot(target.x-e.flankAnchor.x,target.z-e.flankAnchor.z)>9) {
        const forward={x:-Math.sin(player.yaw),z:-Math.cos(player.yaw)},right={x:Math.cos(player.yaw),z:-Math.sin(player.yaw)};
        e.flankAnchor={...target};e.flankGoal={x:target.x+right.x*sign*(7+e.id%3)-forward.x*2,z:target.z+right.z*sign*(7+e.id%3)-forward.z*2};
        const graph=navigation.graph(e.radius),n=navigation.nearest(e.flankGoal,graph);if(n>=0)e.flankGoal=navigation.point(n);
      }
      e.goal=e.flankGoal;
      if(Math.hypot(e.x-e.goal.x,e.z-e.goal.z)<1.4)e.flankDone=true;
    } else {
      e.behavior='assault';
      // Persistent, different approach angles stop the flow field from forming one queue.
      const angle=e.id*2.39996323,radius=d<4?.75:2.7;
      e.goal={x:target.x+Math.sin(angle)*radius,z:target.z+Math.cos(angle)*radius};
    }
    if(d<2.4)e.goal={x:player.x,z:player.z};
  }
  function steering(e,dt,target=null) {
    decide(e,dt);
    const goal=target||e.goal||player;
    e.routeTimer-=dt;
    if(e.routeTimer<=0||!e.routeGoal||Math.hypot(goal.x-e.routeGoal.x,goal.z-e.routeGoal.z)>2||e.navRevision!==navigation.revision) {
      e.path=navigation.clear(e,goal,e.radius)?[{x:goal.x,z:goal.z}]:navigation.route(e,goal,e.radius);
      e.routeGoal={...goal};e.routeTimer=.8+(e.id%5)*.09;e.navRevision=navigation.revision;
    }
    while(e.path.length&&Math.hypot(e.x-e.path[0].x,e.z-e.path[0].z)<.14&&Math.abs(floorAt(e.path[0].x,e.path[0].z)-e.y)<.08)e.path.shift();
    const p=e.path[0];let x=0,z=0;
    if(p){const d=Math.hypot(p.x-e.x,p.z-e.z);if(d>.02){x=(p.x-e.x)/d;z=(p.z-e.z)/d;}}
    const inCover=e.coverPoint&&Math.hypot(e.x-e.coverPoint.x,e.z-e.coverPoint.z)<.5;
    if(inCover){e.coverTime+=dt;x=0;z=0;}
    e.crouching=!!(inCover&&e.coverPoint.type==='low');
    const speed=e.stagger>0?.15:e.behavior==='defend'?1.15:e.type==='guard'&&e.suppressed>0?.65:1;
    return {x,z,speed,distance:p?Math.hypot(p.x-e.x,p.z-e.z):0};
  }
  function hurt(e,source,damage){report(e,source,'hit');e.suppressed=damage>15?3.5:e.suppressed;e.stagger=e.type==='brute'?.055:.16;e.decision=0;e.flankDone=false;}
  function hearShot(source){for(const e of enemies)if(Math.hypot(e.x-source.x,e.z-source.z)<42)report(e,source,'sound');}
  function chooseSpawn(radius=.52) {
    const g=navigation.graph(radius),f=navigation.fieldTo(player,radius);let best=null,bestScore=-Infinity;
    const recent=spawnHistory.filter(p=>state.time-p.time<9);
    for(let k=0;k<160;k++) {
      const i=Math.floor(Math.random()*g.walk.length);if(!g.walk[i]||f.cost[i]<0)continue;
      const center=navigation.point(i),p={x:center.x+(Math.random()-.5)*.7,z:center.z+(Math.random()-.5)*.7};
      if(p.z>26&&Math.abs(p.x)<11)continue;
      const d=Math.hypot(p.x-player.x,p.z-player.z),da=Math.hypot(p.x-ally.x,p.z-ally.z);
      if(d< (state.wave===1?18:13)||d>43||ally.hp>0&&da<10||!navigation.clear(center,p,radius))continue;
      if(enemies.some(e=>Math.hypot(e.x-p.x,e.z-p.z)<3.2)||recent.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<5))continue;
      const angle=Math.atan2(p.x-player.x,p.z-player.z),dot=(p.x-player.x)/d*-Math.sin(player.yaw)+(p.z-player.z)/d*-Math.cos(player.yaw);
      const seen=visible(vector(player,1.65),vector(p,1.6));
      // Reject the entire visible camera cone, with margin for widescreen and turning.
      if(seen&&dot>-.15)continue;
      const separation=recent.length?Math.min(...recent.map(q=>Math.abs(Math.atan2(Math.sin(angle-q.angle),Math.cos(angle-q.angle))))):Math.PI;
      const score=(seen?0:10)+separation*18-Math.abs(d-27)*.3+Math.random()*8;
      if(score>bestScore){bestScore=score;best={...p,angle};}
    }
    if(best){spawnHistory.push({...best,time:state.time});if(spawnHistory.length>32)spawnHistory.shift();}
    return best;
  }
  return {assign,steering,hurt,hearShot,chooseSpawn,release,covers,claims,squads,stats,names,spawnHistory,
    update(dt){callCooldown-=dt;for(const e of enemies){e.suppressed=Math.max(0,e.suppressed-dt);e.stagger=Math.max(0,e.stagger-dt);e.coverCooldown=Math.max(0,e.coverCooldown-dt);}for(const [id]of squads)if(!enemies.some(e=>e.squad===id))squads.delete(id);},
    reset(){serial=0;callCooldown=0;squads.clear();claims.clear();spawnHistory.length=0;Object.keys(stats).forEach(k=>stats[k]=0);}};
};
