const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
function suite() {
  const g=window.__game,eq=g.equipment,t=g.tutorial,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),results=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const reset=()=>{g.setLocked(false);g.reset();g.state.help=false;document.querySelector('#help').hidden=true;document.querySelector('#sound').checked=false;g.ally.hp=0;};
  const place=(x,z,y=0)=>{Object.assign(g.player,{x,z,y,yaw:0,pitch:0,grounded:true});g.updateCamera(0);g.scene.updateMatrixWorld(true);};
  const advance=(seconds,fps=60)=>{for(let i=0;i<Math.ceil(seconds*fps);i++)g.simulate(1/fps);};
  const equipmentTime=(seconds,fps=60)=>{for(let i=0;i<Math.ceil(seconds*fps);i++)eq.update(1/fps);};
  const test=(name,fn)=>{try{reset();fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
  const training=()=>{place(-5,34);g.player.yaw=Math.PI/2;g.updateCamera(0);g.shoot();g.reload();advance(2);};
  const detonate=(kind,p)=>{eq.inventory[kind]++;g.player.fire=0;assert(eq.throwItem(kind),'Throw failed');const q=eq.projectiles.at(-1);q.p.copy(p);q.velocity.set(0,0,0);q.fuse=.001;eq.update(.002);};

  test('five rewards commit in order using actual light, hit, reload, stops and supply interaction',()=>{
    training();assert(t.stage===0,'Early actions granted out of order');g.toggleFlashlight();
    assert(t.stage===2&&eq.inventory.knife===1&&g.player.reserve===239,'Light / ammo rewards failed');
    g.ally.hp=100;g.openGate();g.state.between=999;
    for(const [i,stop] of g.guide.stops.entries()) {
      place(stop.x,stop.z,stop.y);Object.assign(g.ally,{x:stop.x,z:stop.z,y:stop.y});g.guide.update(.01);t.update();
      if(i===0)assert(t.stage===3&&eq.inventory.medkit===1,'Full-health clinic blocked');
      if(i===1){const s=g.supplies.find(s=>s.type==='ammo'&&s.y===2.7);place(s.x-1.8,s.z,s.y);g.player.ammo=30;g.player.reserve=240;g.updateUI();g.interact();assert(t.stage===4&&eq.inventory.smoke===1,'Full-ammo box blocked');}
    }
    assert(t.stage===4,'Pump bypassed smoke requirement');g.player.fire=0;eq.throwItem('smoke');t.update();
    assert(t.stage===5&&eq.inventory.grenade===1&&eq.inventory.smoke===0,'Final reward failed');
    assert(t.rewards.join(',')==='knife,ammo,medkit,smoke,grenade','Reward order incorrect');
    for(let i=0;i<5;i++)t.record('pump');assert(eq.inventory.grenade===1,'Duplicate reward');
    g.updateUI();assert(document.querySelector('#tutorial-label').textContent.includes('完成'),'Completion HUD missing');
  });
  test('ammo reward over cap is retained by supplies and drops',()=>{
    training();g.player.reserve=240;g.toggleFlashlight();assert(g.player.reserve===300,'Reward truncated');
    place(6.8,36);g.player.ammo=2;g.updateUI();g.interact();assert(g.player.reserve===300&&g.player.ammo===30,'Supply reduced reserve');
    const random=Math.random;Math.random=()=>0;
    try{const e=g.spawnEnemy('walker',{x:0,z:20});g.hurtEnemy(e,999,V(e.x,1,e.z));}finally{Math.random=random;}
    assert(g.player.reserve===300,'Random drop reduced reserve');
  });
  test('reward notifications survive wave toasts and rescue retains progress',()=>{
    g.toggleFlashlight();t.update();g.updateUI();const notice=document.querySelector('#reward-notice');
    assert(!notice.hidden&&notice.textContent.includes('匕首'),'Reward hidden');g.startWave();g.updateUI();
    assert(notice.textContent.includes('匕首'),'Wave overwrote reward');assert(document.querySelector('#tutorial-task').hidden,'Rescue did not take priority');
    g.ally.hp=100;g.updateUI();assert(!document.querySelector('#tutorial-task').hidden&&t.stage===1,'Progress lost during rescue');
    g.updateUI();const rewardRect=notice.getBoundingClientRect(),cueRect=document.querySelector('#waypoint').getBoundingClientRect();
    assert(cueRect.bottom+8<=rewardRect.top,'Waypoint overlaps the reward notice');
  });
  test('missed platform interaction gets a return waypoint even after reaching the pump',()=>{
    training();g.toggleFlashlight();g.openGate();g.guide.stage=3;g.guide.complete=true;g.ally.hp=100;t.update();
    place(0,-41);g.updateUI();assert(t.stage===3&&g.guidance.destination?.short==='弹药箱','Missed box has no return destination');
    assert(document.querySelector('#objective-title').textContent==='检查平台弹药箱','Return objective missing');
    const s=g.supplies.find(s=>s.type==='ammo'&&s.y===2.7);place(s.x-1.8,s.z,s.y);g.player.ammo=30;g.player.reserve=300;s.ready=g.state.time+10;
    g.updateUI();g.interact();assert(t.stage===4&&eq.inventory.smoke===1,'Cooling box blocked task');
  });
  test('knife hits only nearest frontal target with range and wall protection',()=>{
    eq.inventory.knife=1;place(0,20);const near=g.spawnEnemy('walker',{x:0,z:18.7}),far=g.spawnEnemy('walker',{x:.3,z:18.4});
    const hp=near.hp,farHp=far.hp;assert(eq.melee(),'Knife not usable');assert(near.hp===hp-50&&far.hp===farHp,'Knife target / damage incorrect');
    const ammo=g.player.ammo;g.shoot();g.reload();eq.throwItem('grenade');assert(g.player.ammo===ammo&&g.player.reload===0,'Action lock bypassed');
    equipmentTime(.7);place(0,36);const hidden=g.spawnEnemy('walker',{x:0,z:25});const hiddenHp=hidden.hp;eq.melee();assert(hidden.hp===hiddenHp,'Knife exceeded range');
    equipmentTime(.7);place(0,24.1);const behind=g.spawnEnemy('walker',{x:0,z:22.6});const behindHp=behind.hp;eq.melee();assert(behind.hp===behindHp,'Knife hit through wall');
  });
  test('knife can strike the training target without ammunition',()=>{
    eq.inventory.knife=1;const target=g.targets.find(x=>x.userData.target),p=target.getWorldPosition(V());
    place(p.x+1.3,p.z);g.player.yaw=Math.PI/2;g.player.pitch=Math.atan2(p.y-1.68,1.3);g.updateCamera(0);
    const ammo=g.player.ammo;eq.melee();assert(g.state.training===1&&g.player.ammo===ammo&&t.facts.has('hit'),'Knife target did not count');
  });
  test('medkit caps health and rejects full health, empty inventory and overlapping actions',()=>{
    eq.inventory.medkit=1;assert(!eq.heal()&&eq.inventory.medkit===1,'Full-health pack consumed');
    g.player.hp=70;assert(eq.heal()&&g.player.hp===100&&eq.inventory.medkit===0,'Heal cap failed');
    equipmentTime(.7);g.player.hp=20;assert(!eq.heal()&&g.player.hp===20,'Empty medkit healed');
    eq.inventory.medkit=1;g.player.ammo=29;g.reload();assert(!eq.heal()&&eq.inventory.medkit===1,'Used during reload');
  });
  test('projectiles collide with walls, ground and raised platform at 30 / 60 / 120 FPS',()=>{
    for(const fps of [30,60,120]){
      eq.reset();place(0,25);eq.inventory.grenade=1;eq.throwItem('grenade');equipmentTime(.8,fps);
      const q=eq.projectiles[0];assert(q&&q.p.z>23.4,'Grenade crossed closing wall at '+fps);assert(q.p.y>=.1,'Below ground');
      eq.reset();place(20,-20,2.7);eq.inventory.grenade=1;g.player.pitch=-1.3;eq.throwItem('grenade');equipmentTime(1.5,fps);
      const platform=eq.projectiles[0];assert(platform.p.y>=2.8,'Sank through platform at '+fps);
    }
  });
  test('smoke changes AI sight, retains physical bullet visibility and close contact',()=>{
    place(0,20);detonate('smoke',V(0,1.5,12));const a=V(0,1.5,18),b=V(0,1.5,6);
    assert(eq.clouds.length===1&&eq.smokeBetween(a,b)&&!g.canSee(a,b),'Smoke did not block sight');
    assert(g.visible(a,b),'Smoke blocked ballistic ray');assert(g.canSee(V(0,1.5,12),V(0,1.5,11)),'Close contact blocked');
    const e=g.spawnEnemy('walker',{x:0,z:6}),squad=g.tactics.squads.get(e.squad);
    place(0,18);squad.lastKnown={x:-10,z:6};e.decision=0;g.tactics.steering(e,.1);
    assert(squad.lastKnown.x===-10,'AI acquired player through smoke');g.tactics.hearShot(g.player);assert(squad.lastKnown.x===0,'Gunshot did not update memory');
    equipmentTime(.6);g.player.yaw=0;g.player.fire=0;g.updateCamera(0);g.scene.updateMatrixWorld(true);const hp=e.hp;g.shoot();assert(e.hp<hp,'Bullet failed through smoke');
    equipmentTime(8.1);assert(eq.clouds.length===0&&g.canSee(a,b),'Smoke did not expire');
  });
  test('ally stops aiming and shooting through smoke',()=>{
    place(0,20);g.ally.hp=100;Object.assign(g.ally,{x:0,z:18,y:0,cool:0});const e=g.spawnEnemy('walker',{x:0,z:6});g.ally.target=e;
    detonate('smoke',V(0,1.5,12));const hp=e.hp;g.simulate(.016);assert(g.ally.target===null&&e.hp===hp,'Ally tracked through smoke');
  });
  test('grenade damage falls off, grants player kills and spares allies',()=>{
    place(0,20);const close=g.spawnEnemy('walker',{x:0,z:12}),far=g.spawnEnemy('brute',{x:3,z:12}),outside=g.spawnEnemy('walker',{x:6,z:12});
    const farHp=far.hp,outsideHp=outside.hp,hp=g.player.hp,allyHp=g.ally.hp;
    detonate('grenade',V(0,1,12));assert(close.hp<=0&&g.state.kills===1,'Explosion kill missing');
    assert(Math.abs(far.hp-(farHp-60))<1,'Falloff wrong: '+far.hp);assert(outside.hp===outsideHp,'Outside blast damaged');
    assert(g.player.hp===hp&&g.ally.hp===allyHp,'Friendly blast damage');
  });
  test('grenades cannot damage through closing wall and can break a nearby barricade',()=>{
    place(0,25);const e=g.spawnEnemy('walker',{x:0,z:21});const hp=e.hp;detonate('grenade',V(0,1,24.5));assert(e.hp===hp,'Blast passed through wall');
    equipmentTime(.6);const b=g.barriers[0];place(-25,11);detonate('grenade',V(-25,.6,8.8));assert(b.hp<=0&&!b.c.active,'Barricade not destroyed');
  });
  test('pause / help / death freeze timers and reject equipment; restart clears all state',()=>{
    eq.inventory.smoke=1;eq.inventory.grenade=1;eq.inventory.medkit=1;eq.inventory.knife=1;eq.throwItem('smoke');equipmentTime(.6);eq.throwItem('grenade');
    const before=eq.projectiles.map(p=>p.fuse),time=g.state.time,busy=eq.busy;
    for(const mode of ['paused','dead']){g.state.mode=mode;g.simulate(1);eq.update(1);assert(!eq.melee()&&!eq.heal()&&!eq.throwItem('smoke'),'Input accepted '+mode);}
    g.state.mode='playing';g.state.help=true;g.simulate(1);eq.update(1);
    assert(eq.projectiles.every((p,i)=>p.fuse===before[i])&&g.state.time===time&&eq.busy===busy,'Pause leaked simulation');
    g.state.help=false;equipmentTime(.6);assert(eq.clouds.length===1,'Smoke setup missing');
    g.reset();assert(eq.clouds.length===0&&eq.projectiles.length===0&&eq.explosions.length===0&&eq.busy===0,'Effects leaked');
    assert(Object.values(eq.inventory).every(x=>x===0)&&t.stage===0&&t.facts.size===0&&t.rewards.length===0,'Run state leaked');
  });
  test('walk the complete companion route and finish all five tasks without teleporting between stops',()=>{
    g.ally.hp=100;training();g.toggleFlashlight();g.openGate();g.state.between=999;
    const walkTo=(target,done)=>{
      let path=[],timer=0;
      for(let tick=0;tick<60*180&&!done();tick++){
        if(timer--<=0){path=g.navigation.route(g.player,target,.36);timer=30;}
        while(path.length&&Math.hypot(path[0].x-g.player.x,path[0].z-g.player.z)<.2)path.shift();
        const next=path[0]||target;
        if(Math.hypot(next.x-g.player.x,next.z-g.player.z)>.18){g.player.yaw=Math.atan2(g.player.x-next.x,g.player.z-next.z);g.keys.add('KeyW');}
        else g.keys.clear();
        g.simulate(1/60);
      }
      g.keys.clear();assert(done(),'Route stalled near '+g.player.x+','+g.player.z+' toward '+target.x+','+target.z);
    };
    walkTo(g.guide.stops[0],()=>g.guide.stage>=1);assert(t.stage===3,'Clinic did not grant kit');
    walkTo(g.guide.stops[1],()=>g.guide.stage>=2);
    const box=g.supplies.find(s=>s.type==='ammo'&&s.y===2.7),approach={x:box.x-1.8,z:box.z};
    walkTo(approach,()=>Math.hypot(g.player.x-approach.x,g.player.z-approach.z)<.3);g.updateUI();g.interact();
    assert(t.stage===4,'Platform interaction did not grant smoke');eq.throwItem('smoke');
    walkTo(g.guide.stops[2],()=>g.guide.complete);assert(t.stage===5&&eq.inventory.grenade===1,'Walking route did not finish tutorial');
  });
  reset();g.ally.hp=100;g.toggleFlashlight();t.update();g.updateUI();
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
}
const result=execFileSync('agent-browser',['--session',process.argv[2]||'tutorial','eval','-b',Buffer.from(`(${suite.toString()})()`).toString('base64')],{encoding:'utf8',timeout:120000});
fs.writeFileSync('logs/tutorial-verification.json',result);console.log(result);const report=JSON.parse(result);if(report.passed!==report.total)process.exitCode=1;
