const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const suite = function () {
  const g = window.__game, results = [];
  const assert = (condition, detail) => { if (!condition) throw Error(detail); };
  const test = (name, fn) => { try { fn(); results.push({name, pass:true}); } catch (e) { results.push({name, pass:false, error:e.message}); } };
  const reset = () => { g.setLocked(false); g.reset(); g.state.help=false; document.querySelector('#help').hidden=true; g.ally.hp=0; };
  const advance = seconds => { for(let t=0;t<seconds;t+=1/60) g.simulate(1/60); };
  const place = (x,z,y=0) => { Object.assign(g.player,{x,z,y,pitch:0,yaw:0,grounded:true});g.updateCamera(0);g.buildField(); };
  test('safehouse confinement and no early enemies',()=>{reset();advance(7);assert(g.state.wave===0&&g.enemies.length===0,'Enemies appeared before exit');g.move(g.player,25,0);assert(g.player.x<9.5,'Walked through safehouse wall');});
  test('shootable training target and timed reset',()=>{reset();place(-5,34);g.player.yaw=Math.PI/2;g.updateCamera(0);g.shoot();assert(g.state.training===1&&g.player.ammo===29,'Training shot did not register');const t=g.targets.find(t=>t.userData.reset>0);assert(!!t,'No target feedback');advance(1);assert(t.userData.reset<=0,'Target did not reset');});
  test('reload transfers ammo and blocks firing',()=>{reset();g.player.ammo=7;g.player.reserve=50;g.reload();g.shoot();assert(g.player.ammo===7,'Fired while reloading');advance(2);assert(g.player.ammo===30&&g.player.reserve===27,'Incorrect reload conservation');g.player.ammo=0;g.player.reserve=5;g.reload();advance(2);assert(g.player.ammo===5&&g.player.reserve===0,'Partial reserve reload failed');});
  test('exit triggers first wave within one second and twelve distributed spawns',()=>{reset();place(0,30.5);g.simulate(1/60);assert(g.state.gate&&g.state.wave===0,'Gate not triggered');advance(.6);assert(g.state.wave===0,'Wave started early');advance(.3);assert(g.state.wave===1,'First wave did not start');advance(2.5);assert(g.enemies.length===12&&new Set(g.enemies.map(e=>e.type)).size===5,'First wave roster missing');assert(g.tactics.spawnHistory.every(e=>Math.hypot(e.x-g.player.x,e.z-g.player.z)>=18),'First wave spawned too close');});
  test('forward movement, sprint stamina, jump and landing',()=>{reset();g.keys.add('KeyW');advance(.5);g.keys.clear();assert(Math.abs(g.player.z-(36-3.4*31/60))<.08,'W movement failed');g.keys.add('KeyS');g.keys.add('ShiftLeft');advance(.4);g.keys.clear();assert(g.player.stamina<95,'Sprint did not consume stamina');g.player.vy=7;g.player.grounded=false;advance(.25);assert(g.player.y>.8,'Jump too low');advance(1);assert(g.player.grounded&&g.player.y===0,'Did not land');});
  test('low barrier blocks walking but can be jumped',()=>{reset();place(-25,9.5);g.move(g.player,0,-2);assert(g.player.z>8.5,'Walked through barricade');g.player.y=1.3;g.player.grounded=false;g.move(g.player,0,-2);assert(g.player.z<8,'Could not vault barricade');});
  test('medical, ammunition and cooldown interactions',()=>{reset();place(6.8,31);g.player.hp=30;g.updateUI();g.interact();assert(g.player.hp===90,'Medical did not heal 60');g.interact();assert(g.player.hp===90,'Medical cooldown bypass');place(6.8,36);g.player.ammo=2;g.player.reserve=0;g.updateUI();g.interact();assert(g.player.ammo===30&&g.player.reserve===240,'Ammo not replenished');assert(g.supplies[0].ready>0,'Ammo cooldown missing');});
  test('raycast hits, headshot and score, wall blocks shots',()=>{reset();place(0,20);const e=g.spawnEnemy('runner',{x:0,z:14});g.player.pitch=Math.atan2(1.81*.87-1.68,6);g.updateCamera(0);g.shoot();assert(e.hp<=0&&g.state.kills===1&&g.state.score===140,'Headshot or personal score failed');g.openGate();advance(2);g.scene.updateMatrixWorld(true);reset();place(0,36);const hidden=g.spawnEnemy('walker',{x:0,z:25});const hp=hidden.hp;g.player.fire=0;g.updateCamera(0);g.shoot();assert(hidden.hp===hp,'Shot passed through gate');});
  test('three enemy archetypes have distinct stats',()=>{reset();const a=g.spawnEnemy('walker',{x:0,z:10}),b=g.spawnEnemy('runner',{x:2,z:10}),c=g.spawnEnemy('brute',{x:-2,z:10});assert(b.speed>a.speed&&b.hp<a.hp&&c.hp>a.hp&&c.damage>a.damage,'Archetypes indistinguishable');});
  test('enemy melee causes player damage',()=>{reset();place(0,20);g.spawnEnemy('walker',{x:0,z:19});advance(1.3);assert(g.player.hp<100,'Enemy did not attack');});
  test('post-clinic side streets and ramp remain reachable',()=>{reset();g.openGate();place(0,25);g.buildField();for(const p of [[-26,-12],[24,12],[20,-20],[0,-43]])assert(g.field[g.cell(...p)]>=0,'Unreachable '+p);place(20,-2);g.keys.add('KeyW');advance(3);g.keys.clear();assert(g.player.y>2.6&&g.player.z<-12,'Ramp traversal failed: '+JSON.stringify(g.player));});
  test('enemy follows the clinic detour and reaches player',()=>{
    reset();g.openGate();g.state.between=999;place(-25,20);const e=g.spawnEnemy('runner',{x:-8,z:10});
    const route=g.navigation.route(e,g.player,e.radius);let distance=0,last=e;
    for(const p of route){distance+=Math.hypot(p.x-last.x,p.z-last.z);last=p;}
    // The sealed shortcut now requires crossing the clinic; allow travel time for that route.
    const seconds=Math.ceil(distance/e.speed*1.4+4);
    for(let i=0;i<60*seconds&&Math.hypot(e.x-g.player.x,e.z-g.player.z)>=3;i++){g.player.hp=100;g.simulate(1/60);}
    assert(Math.hypot(e.x-g.player.x,e.z-g.player.z)<3,'Enemy stuck after '+seconds+' s at '+e.x+','+e.z);
  });
  test('heavy enemies damage and break barricades',()=>{reset();g.openGate();g.state.between=999;place(-25,11);const e=g.spawnEnemy('brute',{x:-25,z:7.4});const b=g.barriers[0];advance(2);assert(b.hp<110,'Enemy ignored destructible barrier');g.player.fire=0;place(-25,10);g.player.pitch=-.37;g.updateCamera(0);for(let i=0;i<8&&b.hp>0;i++){g.player.fire=0;g.shoot()}assert(b.hp<=0&&!b.c.active&&!b.group.visible,'Barricade not removed');});
  test('wave completion and next-wave escalation',()=>{reset();g.openGate();g.state.between=0;advance(.05);advance(6);for(const e of [...g.enemies])g.hurtEnemy(e,999,new THREE.Vector3(e.x,1,e.z));advance(.1);assert(g.state.completed===1&&g.state.between>5,'Intermission missing');advance(6.1);assert(g.state.wave===2&&g.state.pending+g.enemies.length===20,'Second wave did not escalate');});
  test('AI covers, heals and can be revived',()=>{reset();g.ally.hp=100;place(0,35);g.player.hp=35;advance(.1);assert(g.player.hp===57&&g.ally.heal>0,'AI did not heal');const e=g.spawnEnemy('walker',{x:3,z:30});const hp=e.hp;advance(.5);assert(e.hp<hp,'AI did not shoot');g.ally.hp=0;place(g.ally.x,g.ally.z);g.updateUI();g.interact();assert(g.ally.hp===65,'Revive failed');});
  test('death summary and restart reset all gameplay state',()=>{reset();g.state.score=500;g.state.kills=3;g.damagePlayer(100);assert(g.state.mode==='dead'&&!document.querySelector('#gameover').hidden,'Game over not shown');g.reset();assert(g.state.mode==='playing'&&g.player.hp===100&&g.player.ammo===30&&g.state.score===0&&g.state.kills===0&&g.enemies.length===0&&!g.state.gate&&g.ally.hp===100,'Restart leaked state');assert(g.barriers.every(b=>b.hp===110&&b.c.active),'Barriers not restored');assert(g.supplies.every(s=>s.ready===0),'Supply cooldown leaked');});
  test('simultaneous enemies capped at 48',()=>{reset();g.openGate();g.state.wave=18;g.state.pending=52;g.state.between=-1;for(let i=0;i<60*40;i++){g.player.hp=100;g.simulate(1/60);assert(g.enemies.length<=48,'Enemy cap exceeded')}assert(g.enemies.length>0,'No stress enemies generated');});
  test('landing on cover does not sink into it',()=>{reset();place(-5,17,1.35);g.player.grounded=false;advance(1);assert(g.player.grounded&&Math.abs(g.player.y-1)<.02,'Fell inside crate');g.keys.add('KeyD');advance(1);g.keys.clear();advance(.7);assert(g.player.x>-2&&g.player.y===0,'Could not leave crate');});
  test('enemy can climb ramp and attack elevated player',()=>{reset();g.openGate();g.state.between=999;place(20,-20,2.7);const e=g.spawnEnemy('runner',{x:28,z:2});for(let i=0;i<60*35;i++){g.player.hp=100;g.simulate(1/60)}assert(Math.abs(e.y-2.7)<.05&&Math.hypot(e.x-20,e.z+20)<1.5,'Platform became an invincible position');advance(1.2);assert(g.player.hp<100,'Elevated melee failed');});
  reset();g.state.help=true;document.querySelector('#help').hidden=false;g.updateUI();
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
};
const expression = `(${suite.toString()})()`;
const output = execFileSync('agent-browser',['--session',process.argv[2]||'afterlight','eval','-b',Buffer.from(expression).toString('base64')],{encoding:'utf8',timeout:120000});
console.log(output);
fs.writeFileSync('logs/verification.json',output);
const data=JSON.parse(output);
if(data.passed!==data.total)process.exitCode=1;
