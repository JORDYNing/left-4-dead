const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const suite=function(){
  const g=window.__game,results=[];
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const test=(name,fn)=>{try{const evidence=fn();results.push({name,pass:true,evidence});}catch(e){results.push({name,pass:false,error:e.message});}};
  const reset=()=>{g.setLocked(false);g.reset();g.state.help=false;document.querySelector('#help').hidden=true;document.querySelector('#sound').checked=false;};
  const step=s=>{for(let i=0;i<Math.ceil(s*60);i++)g.simulate(1/60);};
  test('night lighting and actual F key tutorial',()=>{
    reset();g.updateUI();assert(!g.flashlight.visible&&!document.querySelector('#flashlight-tip').hidden,'Initial flashlight prompt missing');
    const lights=[];g.scene.traverse(x=>{if(x.isLight)lights.push(x);});
    assert(lights.length===1&&lights[0]===g.flashlight,'An additional scene light remains');
    g.scene.traverse(x=>{for(const material of (Array.isArray(x.material)?x.material:[x.material]))
      assert(!material?.emissive||material.emissive.getHex()===0||material.emissiveIntensity===0,'A scene material still glows without the flashlight');});
    g.setLocked(true);document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF'}));g.setLocked(false);g.keys.clear();
    assert(g.flashlight.visible&&g.state.flashlightUsed&&document.querySelector('#flashlight-tip').hidden,'F did not turn on flashlight/dismiss hint');
    g.toggleFlashlight();assert(!g.flashlight.visible&&!document.querySelector('#flashlight-tip').hidden,'Turning light off lost guidance');
    return {sceneLights:lights.length,flashlightRange:g.flashlight.distance};
  });
  test('first enemy appears in one second, all six within 3.5 seconds',()=>{
    reset();g.ally.hp=0;g.player.z=30.5;step(1);assert(g.enemies.length>=1,'First enemy late');step(2.5);assert(g.enemies.length===6&&g.state.pending===0,'First wave too slow');return {time:g.state.time,enemies:g.enemies.length};
  });
  test('guide leads, waits, then resumes without advancing objectives early',()=>{
    reset();g.openGate();g.state.between=999;Object.assign(g.player,{x:0,z:25,y:0});Object.assign(g.ally,{x:1,z:24,y:0});
    step(8);assert(g.guide.status==='等你跟上','Guide did not wait: '+g.guide.status);const p={x:g.ally.x,z:g.ally.z};step(3);
    assert(Math.hypot(g.ally.x-p.x,g.ally.z-p.z)<.05,'Guide ran away while waiting');assert(g.guide.stage===0,'Player never reached clinic');
    Object.assign(g.player,{x:g.ally.x,z:g.ally.z+1,y:g.ally.y});step(.5);assert(Math.hypot(g.ally.x-p.x,g.ally.z-p.z)>.4,'Guide failed to resume');return {waitDistance:Math.hypot(p.x,p.z-25)};
  });
  test('player can walk the complete clinic, raised ammunition, pump route behind ally',()=>{
    reset();g.openGate();g.state.between=999;const visited=[],trail=[];let maxGap=0,climbed=false;
    // Follow a recorded trail using the real collision/movement function, without teleporting.
    for(let i=0;i<60*220&&!g.guide.complete;i++){
      if(i%6===0)trail.push({x:g.ally.x,z:g.ally.z});
      while(trail.length>1&&Math.hypot(trail[0].x-g.player.x,trail[0].z-g.player.z)<.25)trail.shift();
      const p=trail[0],gap=Math.hypot(g.ally.x-g.player.x,g.ally.z-g.player.z);
      if(p&&gap>2){const dx=p.x-g.player.x,dz=p.z-g.player.z,len=Math.hypot(dx,dz);if(len>.001)g.move(g.player,dx/len*Math.min(len,3.7/60),dz/len*Math.min(len,3.7/60));g.player.y=g.floorAt(g.player.x,g.player.z);}
      const before=g.guide.stage;g.simulate(1/60);maxGap=Math.max(maxGap,gap);climbed ||= g.player.y>2.6;
      if(g.guide.stage!==before)visited.push({stage:g.guide.stage,player:[g.player.x,g.player.y,g.player.z],ally:[g.ally.x,g.ally.y,g.ally.z]});
      assert(!g.blocked(g.ally.x,g.ally.z,g.ally.y,.3,false),'Ally walked into a wall');
    }
    assert(g.guide.complete&&visited.length===3,'Route stalled: '+JSON.stringify({stage:g.guide.stage,status:g.guide.status,ally:[g.ally.x,g.ally.y,g.ally.z],player:[g.player.x,g.player.y,g.player.z],path:g.guide.path.slice(0,3)}));
    assert(climbed,'Player never climbed ammunition ramp');return {visited,maxGap,seconds:g.state.time};
  });
  test('visible held shotgun fires from muzzle toward an enemy with a tracer and recoil',()=>{
    reset();g.openGate();g.state.between=999;Object.assign(g.player,{x:0,z:20,y:0});Object.assign(g.ally,{x:2,z:20,y:0});
    const e=g.spawnEnemy('brute',{x:2,z:12});const hp=e.hp;step(.017);
    assert(e.hp<hp&&g.ally.flash.visible&&g.ally.shot>0,'Ally did not visibly fire');assert(g.ally.rifle.isMesh&&g.ally.rifle.material.map&&g.ally.rifle.geometry.attributes.position.count>200,'Imported textured shotgun missing');
    g.ally.g.updateMatrixWorld(true);const p=g.ally.muzzle.getWorldPosition(new THREE.Vector3()),a=g.allyTracer.geometry.attributes.position;
    assert(g.allyTracer.visible&&p.distanceTo(new THREE.Vector3(a.getX(0),a.getY(0),a.getZ(0)))<.03,'Tracer does not begin at muzzle');
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(g.ally.muzzle.getWorldQuaternion(new THREE.Quaternion()));
    const toward=new THREE.Vector3(a.getX(1),a.getY(1),a.getZ(1)).sub(p).normalize();assert(forward.dot(toward)>.985,'Gun points away from target');
    step(.04);assert(g.ally.upper.position.z>0,'Missing recoil');return {muzzleAlignment:forward.dot(toward),damage:hp-e.hp};
  });
  test('three infected rigs retain distinct morphology after pool reuse',()=>{
    reset();const infected=['walker','runner','brute'].map((t,i)=>g.spawnEnemy(t,{x:i*3,z:15}));
    assert(infected.every(e=>e.head.isBone&&e.meshes.some(m=>m.isSkinnedMesh&&m.material.map)&&e.actions.walk&&e.actions.attack&&e.actions.dead),'Imported textured/animated rig missing');
    const a=infected[0],b=infected[1],before=b.head.quaternion.clone();a.animate(0,true);a.animate(.1,true);assert(a.head.quaternion.angleTo(b.head.quaternion)>.01&&b.head.quaternion.angleTo(before)<.001,'Cloned skeletons share animation state');
    infected.forEach(e=>g.hurtEnemy(e,999,new THREE.Vector3(e.x,1,e.z)));
    const brute=g.spawnEnemy('brute',{x:0,z:15}),r=g.spawnEnemy('runner',{x:3,z:15});assert(brute.kind==='brute'&&r.kind==='runner'&&brute.g.scale.x>r.g.scale.x,'Pool changed enemy model type');
    g.reset();assert(g.guide.stage===0&&!g.guide.complete&&!g.flashlight.visible&&!g.state.flashlightUsed&&!g.allyTracer.visible,'Restart leaked route/light/shot state');
  });
  test('authored death animation plays, corpse pool is bounded and resets',()=>{
    reset();g.openGate();g.state.between=999;g.ally.hp=0;
    const e=g.spawnEnemy('walker',{x:0,z:15});e.g.updateMatrixWorld(true);const headY=e.head.getWorldPosition(new THREE.Vector3()).y;
    g.hurtEnemy(e,999,new THREE.Vector3(0,1,15));assert(!g.enemies.includes(e)&&g.corpses.includes(e)&&e.g.visible&&e.activeAction==='dead','Death animation was skipped');
    step(3.5);e.g.updateMatrixWorld(true);const fallenY=e.head.getWorldPosition(new THREE.Vector3()).y;assert(fallenY<headY-.5,'Death pose did not fall');
    for(let i=0;i<10;i++){const z=g.spawnEnemy('walker',{x:i,z:15});g.hurtEnemy(z,999,new THREE.Vector3(i,1,15));}
    assert(g.corpses.length<=8,'Corpses exceed cap');step(5.1);assert(g.corpses.length===0,'Corpses never released');g.reset();assert(g.corpses.length===0,'Restart left corpses');return {headY,fallenY};
  });
  reset();g.state.help=true;document.querySelector('#help').hidden=false;g.updateUI();
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
};
const out=execFileSync('agent-browser',['--session',process.argv[2]||'afterlight-night','eval','-b',Buffer.from(`(${suite})()`).toString('base64')],{encoding:'utf8',timeout:120000});
fs.mkdirSync('logs',{recursive:true});fs.writeFileSync('logs/night-verification.json',out);console.log(out);const data=JSON.parse(out);if(data.passed!==data.total)process.exitCode=1;
