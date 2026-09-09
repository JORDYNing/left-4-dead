const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const session=process.argv[2]||'afterlight-audit';
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
function setup(){
  const g=window.__game;g.setLocked(false);g.reset();g.state.help=false;g.ally.hp=0;document.querySelector('#help').hidden=true;document.querySelector('#sound').checked=false;
  window.qa={g,assert:(v,m)=>{if(!v)throw Error(m);},place:(x,z,y=0)=>{Object.assign(g.player,{x,z,y,yaw:0,pitch:0});g.updateCamera(0);},step:(seconds,check=()=>{})=>{for(let i=0;i<Math.ceil(seconds*60);i++){g.player.hp=100;g.simulate(1/60);check();}},arena:()=>{g.openGate();g.state.between=999;}};
}
test('walk 3.4 m/s, sprint 5.4 m/s and diagonal normalization',()=>{
  const {g,assert,step}=qa;g.keys.add('KeyW');step(.5);g.keys.clear();const walk=(36-g.player.z)*2;
  g.keys.add('KeyW');g.keys.add('ShiftLeft');const z=g.player.z;step(.5);g.keys.clear();const sprint=(z-g.player.z)*2;
  assert(Math.abs(walk-3.4)<.01&&Math.abs(sprint-5.4)<.01,JSON.stringify({walk,sprint}));
  const p={x:g.player.x,z:g.player.z};g.keys.add('KeyW');g.keys.add('KeyD');step(.5);g.keys.clear();const diagonal=Math.hypot(g.player.x-p.x,g.player.z-p.z)*2;assert(Math.abs(diagonal-3.4)<.01,'Faster diagonal');return {walk,sprint,diagonal};
});
test('first wave has 12 enemies, five models and separated simultaneous batches',()=>{
  const {g,assert,step,place}=qa;place(0,30.5);step(1);const first=g.enemies.length;assert(first>=3,'First group late');step(2.5);
  const points=g.tactics.spawnHistory;let min=Infinity;for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)min=Math.min(min,Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z));
  assert(g.enemies.length===12&&g.state.pending===0,'Wave count '+g.enemies.length);assert(new Set(g.enemies.map(e=>e.type)).size===5,'Missing regular-play models');assert(min>=5,'Repeated spawn pocket');assert(points.some(p=>p.x<-10)&&points.some(p=>p.x>10),'Only one flank used');
  for(const e of g.enemies)assert(!g.blocked(e.x,e.z,e.y,e.radius,true),'Spawn/movement overlaps obstacle');return {firstGroup:first,total:g.enemies.length,minSpawnSpacing:min,positions:points};
});
test('spawns stay connected, out of camera sight, and away from both characters across the map',()=>{
  const {g,assert,arena,place}=qa;arena();const areas=[];g.ally.hp=100;g.state.wave=5;
  for(const [x,z,y]of [[0,20,0],[-26,-12,0],[20,-20,2.7],[0,-43,0]]){
    place(x,z,y);Object.assign(g.ally,{x:x+2,z,y});g.tactics.spawnHistory.length=0;const points=[];
    for(let n=0;n<12;n++){const radius=n%3===0?.76:.5,p=g.chooseSpawn(radius);if(!p)continue;const d=Math.hypot(p.x-x,p.z-z),dot=(p.z-z)/d*-1,seen=g.visible(new THREE.Vector3(x,y+1.65,z),new THREE.Vector3(p.x,g.floorAt(p.x,p.z)+1.6,p.z));
      assert(d>=13&&Math.hypot(p.x-g.ally.x,p.z-g.ally.z)>=10,'Spawn too close');assert(!(seen&&dot>-.15),'Visible pop-in');assert(!g.blocked(p.x,p.z,g.floorAt(p.x,p.z),radius,true),'Blocked spawn');assert(g.navigation.fieldTo(g.player,radius).cost[g.cell(p.x,p.z)]>=0,'Disconnected spawn');points.push(p);}
    assert(points.length>=6,'Too few viable distributed positions at '+[x,z]);areas.push({player:[x,z],accepted:points.length});
  }return areas;
});
test('all five model kits have independent skeletons, different silhouettes and reset materials',()=>{
  const {g,assert}=qa;const list=Object.keys(g.types).map((type,i)=>g.spawnEnemy(type,{x:(i-2)*2.5,z:15}));
  assert(list.every(e=>e.head.isBone&&e.meshes.some(m=>m.isSkinnedMesh&&m.material.map)&&e.actions.walk&&e.actions.attack&&e.actions.dead),'Animated model absent');
  assert(new Set(list.map(e=>e.gear.map(m=>m.name).join(','))).size===5,'Models are only recolors');
  const original=list[1].head.quaternion.clone();list[0].animate(0,true);list[0].animate(.1,true);assert(list[1].head.quaternion.angleTo(original)<.001,'Shared skeleton');
  const croucher=list[0];croucher.animate(.2,false);croucher.g.updateMatrixWorld(true);const feet=['L','R'].map(side=>croucher.model.getObjectByName('Bip01_'+side+'_Foot'));const standing=feet.map(b=>b.getWorldPosition(new THREE.Vector3()).y);const head=croucher.head.getWorldPosition(new THREE.Vector3()).y;
  croucher.upper.position.y=-.4;croucher.animate(.3,false);croucher.g.updateMatrixWorld(true);const planted=feet.map(b=>b.getWorldPosition(new THREE.Vector3()).y);assert(planted.every((y,i)=>Math.abs(y-standing[i])<.03),'Crouching feet sink into ground '+JSON.stringify({standing,planted}));assert(croucher.head.getWorldPosition(new THREE.Vector3()).y<head-.3,'Crouching head stays exposed');croucher.resetPose();
  const guard=list[3];guard.setOpacity(.2);guard.resetPose();assert(guard.meshes.every(m=>m.material.opacity===1),'Pooled model fades on reuse');
  return list.map(e=>({type:e.type,gear:e.gear.map(m=>m.name),scale:e.g.scale.x}));
});
test('companion follow/wait/return/rejoin distances are doubled in behavior',()=>{
  const {g,assert,arena,place}=qa;arena();g.ally.hp=100;g.guide.complete=true;place(0,20);Object.assign(g.ally,{x:0,z:13,y:0});
  assert(!g.guide.update(.1),'Follows inside 8 m');g.ally.z=11;assert(g.guide.update(.1),'Does not follow outside 8 m');
  g.guide.complete=false;Object.assign(g.ally,{x:0,z:2,y:0});g.guide.path=[];g.guide.update(.1);assert(g.guide.status==='等你跟上','Does not wait beyond 17 m');
  Object.assign(g.ally,{x:24,z:-10,y:0});g.guide.update(.1);assert(g.guide.returning,'Does not return beyond 34 m');
  Object.assign(g.ally,{x:0,z:9,y:0});g.guide.update(.1);assert(g.guide.returning,'Stops return beyond 10 m');Object.assign(g.ally,{x:0,z:11,y:0});g.guide.update(.1);assert(!g.guide.returning,'Fails to rejoin within 10 m');return g.guide.distances;
});
test('low/high cover geometry offers different sightlines, short transfers and connected routes',()=>{
  const {g,assert,arena,place}=qa;arena();place(0,25);
  const authored=g.colliders.filter(c=>c.cover&&c.zone),report=[];
  for(const zone of ['entry','street','pump']){const covers=authored.filter(c=>c.zone===zone);assert(covers.some(c=>c.cover==='low')&&covers.some(c=>c.cover==='high'),'Missing cover type '+zone);report.push({zone,low:covers.filter(c=>c.cover==='low').length,high:covers.filter(c=>c.cover==='high').length});}
  const sight=(x,z,h,d)=>g.visible(new THREE.Vector3(x,h,z+d),new THREE.Vector3(x,h,z-d));
  assert(sight(-.5,4,1.65,2),'Low cover blocks head-level observation');assert(!sight(-.5,4,.65,2),'Low cover does not shield torso');assert(!sight(5,-2,1.65,2),'High cover fails to cut sightline');
  for(const r of [.52,.78]){const f=g.navigation.fieldTo(g.player,r);for(const p of [[-26,-12],[24,12],[20,-20],[0,-43]])assert(f.cost[g.cell(...p)]>=0,'Route sealed '+p+' radius '+r);}
  return report;
});
test('all enemy sizes collide with low crates, boards, vehicles and scenery',()=>{
  const {g,assert,arena}=qa;arena();const results=[];
  for(const type of Object.keys(g.types))for(const c of [g.colliders.find(c=>c.x===-5&&c.z===17),g.barriers[0].c,g.colliders.find(c=>c.x===29&&c.z===-3),g.colliders.find(c=>c.x===-9&&c.z===11)]){
    const e=g.spawnEnemy(type,{x:c.x,z:c.z+c.d/2+2});g.move(e,0,-4,true);assert(!g.blocked(e.x,e.z,e.y,e.radius,true),'Inside '+type+' '+[c.x,c.z]);assert(e.z>=c.z+c.d/2+e.radius-.02,'Crossed solid '+type);results.push(type+':'+[c.x,c.z]);g.hurtEnemy(e,9999,new THREE.Vector3(e.x,1,e.z));
  }return {sweeps:results.length};
});
test('runner rounds building and brute/runner climb the ramp without penetration',()=>{
  const {g,assert,arena,place,step}=qa;arena();const evidence=[];
  for(const [type,start,target,seconds]of [['runner',[-8,10],[-25,20,0],32],['runner',[28,2],[20,-20,2.7],40],['brute',[28,2],[20,-20,2.7],70]]){
    for(const e of [...g.enemies])g.hurtEnemy(e,99999,new THREE.Vector3(e.x,1,e.z));place(...target);const e=g.spawnEnemy(type,{x:start[0],z:start[1]});e.role='assault';
    const route=g.navigation.route(e,g.player,e.radius);let routeLength=0,last=e;
    for(const p of route){routeLength+=Math.hypot(p.x-last.x,p.z-last.z);last=p;}
    const travelTime=Math.max(seconds,Math.ceil(routeLength/e.speed*1.4+4));
    step(travelTime,()=>assert(!g.blocked(e.x,e.z,e.y,e.radius-.002,true),'Penetration '+JSON.stringify({x:e.x,z:e.z,type})));
    const d=Math.hypot(e.x-target[0],e.z-target[1]);assert(d<2&&Math.abs(e.y-target[2])<.1,'Stalled '+JSON.stringify({type,d,x:e.x,z:e.z,goal:e.goal,path:e.path.slice(0,3)}));evidence.push({type,d,y:e.y});
  }return evidence;
});
test('squads share sightings and pursue opposite flanking approaches',()=>{
  const {g,assert,arena,place,step}=qa;arena();place(0,20);
  const a=g.spawnEnemy('walker',{x:0,z:12,squad:9}),left=g.spawnEnemy('stalker',{x:-9,z:2,squad:9}),right=g.spawnEnemy('stalker',{x:9,z:2,squad:9});left.role='flank-left';right.role='flank-right';
  step(.8);assert(g.tactics.stats.reports>0&&g.tactics.squads.get(9).seenAt>0,'No communicated sighting');assert(left.goal.x<g.player.x-4&&right.goal.x>g.player.x+4,'Flanks do not split');
  const initial=[left.x,right.x];step(8);assert(Math.hypot(left.x-right.x,left.z-right.z)>8,'Flankers collapse into same queue');return {reports:g.tactics.stats.reports,goals:[left.goal,right.goal],positions:[[left.x,left.z],[right.x,right.z]],initial};
});
test('suppressed enemies reserve cover, crouch behind low cover, then resume assault',()=>{
  const {g,assert,arena,place,step}=qa;arena();place(-.5,14);
  const e=g.spawnEnemy('walker',{x:-.5,z:1});g.hurtEnemy(e,25,new THREE.Vector3(e.x,1,e.z));let defended=false,crouched=false,resumed=false,cover;
  step(8,()=>{defended ||= e.behavior==='defend';crouched ||= !!e.crouching;if(e.coverPoint)cover={...e.coverPoint};resumed ||= defended&&e.behavior==='assault'&&e.coverCooldown>0;});
  assert(defended&&crouched&&resumed,JSON.stringify({defended,crouched,resumed,behavior:e.behavior,goal:e.goal,cover}));assert(!g.tactics.claims.size,'Released cover is still reserved');return {defended,crouched,resumed,cover};
});
test('guard armor rewards head/rear hits and brutes smash blocking boards',()=>{
  const {g,assert,arena,place,step}=qa;arena();place(0,20);const e=g.spawnEnemy('guard',{x:0,z:14});e.g.rotation.y=Math.PI;
  const initial=e.hp;g.hurtEnemy(e,34,new THREE.Vector3(0,1,14));const front=initial-e.hp;e.g.rotation.y=0;const hp=e.hp;g.hurtEnemy(e,34,new THREE.Vector3(0,1,14));assert(front<34&&hp-e.hp===34,'Armor ignores direction');
  place(-25,11);const b=g.barriers[0],heavy=g.spawnEnemy('brute',{x:-25,z:7});heavy.role='assault';step(3);assert(b.hp<=0&&!b.c.active,'Brute did not breach');return {front,rear:hp-e.hp,barrierHP:b.hp};
});
test('directional deaths fall, land, leave blood, fade and fully reset at bounded capacity',()=>{
  const {g,assert,arena,place,step}=qa;arena();place(0,20);const e=g.spawnEnemy('runner',{x:0,z:15}),start={x:e.x,z:e.z},head=e.head.getWorldPosition(new THREE.Vector3()).y;
  g.hurtEnemy(e,999,new THREE.Vector3(0,1.6,15),false,true,new THREE.Vector3(1,0,0));step(.3);e.g.updateMatrixWorld(true);assert(e.landed&&e.head.getWorldPosition(new THREE.Vector3()).y<head-.5,'Death retained a standing delay or mistimed landing');assert(e.x>start.x+.08&&Math.abs(e.z-start.z)<.02,'No directional momentum');step(2.7);e.g.updateMatrixWorld(true);const fallen=e.head.getWorldPosition(new THREE.Vector3()).y;assert(fallen<head-.5&&e.landed,'No actual collapse/landing');assert(g.bloodPools.some(p=>p.life>0&&p.mesh.visible),'No blood mark');step(4);assert(e.bodyMat.opacity<1&&e.g.position.y===e.y,'Corpse sinks instead of fading');
  for(let i=0;i<22;i++){const z=g.spawnEnemy('walker',{x:(i%5)*2-4,z:14});g.hurtEnemy(z,999,new THREE.Vector3(z.x,1,z.z));}assert(g.corpses.length<=16,'Unbounded corpses');step(8.2);assert(g.corpses.length===0,'No corpse release');g.reset();assert(!g.bloodPools.some(p=>p.mesh.visible)&&!g.tactics.claims.size&&!g.tactics.squads.size,'Restart leaves combat state');return {head,fallen,maxCorpses:16};
});
test('48-enemy pressure keeps finite coordinates, collision safety and distributed roles',()=>{
  const {g,assert,arena,place,step}=qa;arena();place(0,20);g.state.wave=9;g.state.pending=72;g.state.between=-1;let peak=0;
  step(22,()=>{peak=Math.max(peak,g.enemies.length);assert(g.enemies.length<=48,'Enemy cap exceeded');for(const e of g.enemies)assert(Number.isFinite(e.x)&&!g.blocked(e.x,e.z,e.y,e.radius-.002,true),'Invalid enemy placement '+e.type);});
  assert(peak>=40,'Insufficient enemies under pressure '+peak);return {peak,remaining:g.state.pending,behaviors:[...new Set(g.enemies.map(e=>e.behavior))],communications:g.tactics.stats.reports};
});
test('body landing and directional communication render audible spatial waveforms',async()=>{
  const {assert}=qa;const {createCombatAudio}=await import('../combat-audio.js');const report=[];
  for(const kind of ['bodyFall','enemyCall']){
    const context=new OfflineAudioContext(2,48000,48000),audio=createCombatAudio({context});audio.play(kind,{heavy:true,pan:.8,distance:6});const pcm=await context.startRendering();
    const rms=channel=>{const data=pcm.getChannelData(channel);return Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);};const left=rms(0),right=rms(1);
    assert(left+right>.0001,'Silent '+kind);if(kind==='enemyCall')assert(right>left*2,'Communication lacks directional cue');assert(!audio.status.lastError,'Audio error');report.push({kind,left,right});
  }return report;
});
test('crouching enemies retain real raycast headshots',()=>{
  const {g,assert,arena,place}=qa;arena();place(0,20);const e=g.spawnEnemy('runner',{x:0,z:14});e.upper.position.y=-.4;e.animate(.1,false);e.g.updateMatrixWorld(true);
  const head=e.head.getWorldPosition(new THREE.Vector3());g.player.pitch=Math.atan2(head.y+.08-1.68,6);g.updateCamera(0);g.shoot();
  assert(e.hp<=0&&e.deathHeadshot,'Crouched head was counted as a body shot '+e.hp);return {headY:head.y,hp:e.hp,headshot:e.deathHeadshot};
});
const results=[];
for(const {name,fn}of tests){
  if(process.argv[3]&&!name.includes(process.argv[3]))continue;
  const code=`(${setup})() ; (async()=>{try{return {pass:true,evidence:await (${fn})()}}catch(e){return {pass:false,error:e.message}}})()`;
  const start=Date.now();
  try {const out=execFileSync('agent-browser',['--session',session,'eval','-b',Buffer.from(code).toString('base64')],{encoding:'utf8',timeout:120000});const result={name,...JSON.parse(out),ms:Date.now()-start};results.push(result);console.log(JSON.stringify(result));}
  catch(e){results.push({name,pass:false,error:e.message.slice(0,250)});console.log(JSON.stringify(results.at(-1)));break;}
  fs.writeFileSync(process.argv[3]?'logs/tactics-focused-verification.json':'logs/tactics-verification.json',JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
}
if(!results.length||results.some(r=>!r.pass))process.exitCode=1;
