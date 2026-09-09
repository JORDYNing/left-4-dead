/* Quick-use equipment: shared action lock, physical projectiles and AI sight smoke. */
window.createEquipment = function ({T, state, player, scene, weaponScene, gun, camera, colliders,
  floorAt, obstruction, visible, enemies, targets, barriers, hurtEnemy, damageBarrier, combat, burst,
  updateCamera, toast, sound, onEvent, onNoise}) {
  const inventory={knife:0, medkit:0, smoke:0, grenade:0};
  const projectiles=[], clouds=[], explosions=[];
  const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), radius=.12;
  let busy=0, action='', duration=0;
  const hand=new T.Group();weaponScene.add(hand);hand.visible=false;
  const blade=new T.Mesh(new T.ConeGeometry(.045,.34,4),new T.MeshBasicMaterial({color:'#bec9c6'}));
  blade.rotation.x=-Math.PI/2;blade.position.z=-.24;hand.add(blade);
  const grip=new T.Mesh(new T.BoxGeometry(.065,.075,.18),new T.MeshBasicMaterial({color:'#48544c'}));hand.add(grip);
  const palm=new T.Mesh(new T.BoxGeometry(.1,.11,.12),new T.MeshBasicMaterial({color:'#a68d77'}));palm.position.z=.04;hand.add(palm);
  const held=new T.Mesh(new T.SphereGeometry(.07,8,6),new T.MeshBasicMaterial({color:'#8b9672'}));hand.add(held);
  const geometry=new T.SphereGeometry(radius,10,8);
  const materials={smoke:new T.MeshBasicMaterial({color:'#aab9ac'}),grenade:new T.MeshBasicMaterial({color:'#b59459'})};
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=cloudCanvas.height=64;
  const ctx=cloudCanvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#ffffffff');gradient.addColorStop(.45,'#ffffffdd');gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const smokeTexture=new T.CanvasTexture(cloudCanvas);
  const explosionGeometry=new T.SphereGeometry(1,12,8);
  const overlay=document.getElementById('smoke-screen');
  function available(item) {
    if(state.mode!=='playing'||state.help||player.hp<=0||busy>0||player.reload>0||player.fire>0||player.sprinting)return false;
    if(!inventory[item]){toast(item==='knife'?'完成首个任务获得匕首':'道具不足');return false;}
    return true;
  }
  function begin(kind,seconds) {action=kind;busy=duration=seconds;}
  function melee() {
    if(!available('knife'))return false;
    begin('knife',.65);updateCamera(0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
    const origin=camera.position.clone(), dir=camera.getWorldDirection(v());
    // A narrow frontal cone is forgiving at arm's length; choose only the nearest target.
    const candidates=enemies.filter(e=>e.hp>0).map(e=>({enemy:e,point:v(e.x,e.y+1.25,e.z)}));
    targets.filter(t=>t.userData.target).forEach(t=>candidates.push({target:t,point:t.getWorldPosition(v())}));
    const hit=candidates.map(h=>({...h,distance:h.point.distanceTo(origin)}))
      .filter(h=>h.distance<=2&&h.point.clone().sub(origin).normalize().dot(dir)>.7&&visible(origin,h.point))
      .sort((a,b)=>a.distance-b.distance)[0];
    if(hit?.enemy)hurtEnemy(hit.enemy,50,hit.point,false,false,dir);
    if(hit?.target){hit.target.material.color.set('#acd693');hit.target.userData.reset=.7;state.training++;combat.targetHit();burst(hit.point,4);onEvent('hit');}
    sound('swish');return true;
  }
  function heal() {
    if(!available('medkit'))return false;
    if(player.hp>=100){toast('生命已满');return false;}
    inventory.medkit--;player.hp=Math.min(100,player.hp+60);begin('medkit',.65);
    sound('pickup');toast('医疗包 · 生命恢复');return true;
  }
  function throwItem(kind) {
    if(!['smoke','grenade'].includes(kind)||!available(kind))return false;
    updateCamera(0);camera.updateMatrixWorld(true);
    const dir=camera.getWorldDirection(v()),p=camera.position.clone();
    const mesh=new T.Mesh(geometry,materials[kind]);mesh.position.copy(p);scene.add(mesh);
    projectiles.push({kind,p,velocity:dir.multiplyScalar(12).add(v(0,3,0)),fuse:kind==='smoke'?1:2,mesh});
    inventory[kind]--;begin(kind,.5);if(kind==='smoke')onEvent('smoke');sound('step');return true;
  }
  function solid(p) {
    if(p.x-radius<-36.4||p.x+radius>36.4||p.z-radius<-55.4||p.z+radius>41.4)return true;
    if(p.y-radius<floorAt(p.x,p.z))return true;
    return colliders.some(c=>c.active&&p.x+radius>c.x-c.w/2&&p.x-radius<c.x+c.w/2&&
      p.z+radius>c.z-c.d/2&&p.z-radius<c.z+c.d/2&&p.y+radius>(c.b??0)&&p.y-radius<c.h);
  }
  function smoke(p) {
    const group=new T.Group();group.position.copy(p);scene.add(group);
    const material=new T.SpriteMaterial({map:smokeTexture,color:'#606b67',transparent:true,opacity:.8,depthWrite:false});
    for(let i=0;i<24;i++) {
      const sprite=new T.Sprite(material),angle=i*2.399,ring=4*Math.sqrt(i/24);
      sprite.position.set(Math.cos(angle)*ring,Math.sin(i*7)*1.1,Math.sin(angle)*ring);
      sprite.scale.set(4,3.5,1);group.add(sprite);
    }
    clouds.push({p:p.clone(),life:8,group,material});
  }
  function smokeBetween(a,b) {
    if(a.distanceTo(b)<=2.5)return false;
    // Ellipsoid intersection also works when either observer is inside the cloud.
    return clouds.some(c=>{
      const start=a.clone().sub(c.p).divide(v(5,2.5,5)),delta=b.clone().sub(a).divide(v(5,2.5,5));
      const t=T.MathUtils.clamp(-start.dot(delta)/(delta.lengthSq()||1),0,1);
      return start.addScaledVector(delta,t).lengthSq()<1;
    });
  }
  function explode(p) {
    scene.updateMatrixWorld(true);onNoise(p);sound('explosion');burst(p,36);
    // Snapshot all occlusion before breaking barriers so one blast cannot tunnel through cover.
    const victims=enemies.filter(e=>e.hp>0).map(e=>({e,point:v(e.x,e.y+1,e.z)}))
      .map(h=>({...h,d:h.point.distanceTo(p)})).filter(h=>h.d<5&&visible(p,h.point));
    const breaks=barriers.filter(b=>b.hp>0).map(b=>{
      const q=v(T.MathUtils.clamp(p.x,b.c.x-b.c.w/2,b.c.x+b.c.w/2),T.MathUtils.clamp(p.y,.1,b.c.h),T.MathUtils.clamp(p.z,b.c.z-b.c.d/2,b.c.z+b.c.d/2));
      const d=q.distanceTo(p),block=obstruction(p,q.clone().sub(p).normalize(),Math.max(0,d-.08));
      return {b,d,clear:!block||block.object.userData.barrier===b};
    }).filter(h=>h.d<5&&h.clear);
    for(const h of victims)hurtEnemy(h.e,150*(1-h.d/5),h.point,false,false,h.point.clone().sub(p).normalize(),'explosive');
    for(const h of breaks)damageBarrier(h.b,150*(1-h.d/5));
    const material=new T.MeshBasicMaterial({color:'#ffbb72',transparent:true,opacity:.6,depthWrite:false});
    const mesh=new T.Mesh(explosionGeometry,material);mesh.position.copy(p);scene.add(mesh);explosions.push({mesh,life:.3});
  }
  function pose() {
    hand.visible=busy>0&&state.mode==='playing';gun.visible=!hand.visible;
    if(!hand.visible)return;
    const progress=1-busy/duration,swing=Math.sin(progress*Math.PI);
    blade.visible=grip.visible=action==='knife';held.visible=action!=='knife';
    held.material.color.set(action==='medkit'?'#cfddd0':action==='smoke'?'#aab9ac':'#b59459');
    hand.position.set(.2-swing*.12,-.22,-.48-swing*(action==='knife'?.26:.08));
    hand.rotation.set(swing*-.3,swing*.25,action==='knife'?-.4+swing*.9:0);
  }
  function update(dt) {
    if(state.mode!=='playing'||state.help)return;
    busy=Math.max(0,busy-dt);
    for(let i=clouds.length-1;i>=0;i--) {
      const c=clouds[i];c.life-=dt;c.material.opacity=.85*Math.min(1,c.life);
      c.group.rotation.y+=dt*.045;
      if(c.life<=0){scene.remove(c.group);c.material.dispose();clouds.splice(i,1);}
    }
    for(let i=projectiles.length-1;i>=0;i--) {
      const q=projectiles[i];
      const elapsed=Math.min(dt,q.fuse),n=Math.max(1,Math.ceil(elapsed*Math.max(1,q.velocity.length())/.08)),step=elapsed/n;
      for(let j=0;j<n;j++) {
        q.velocity.y-=9.8*step;
        for(const axis of ['x','z','y']) {
          const next=q.p.clone();next[axis]+=q.velocity[axis]*step;
          if(solid(next)){q.velocity[axis]*=-.35;if(axis==='y'){q.velocity.x*=.85;q.velocity.z*=.85;}}
          else q.p.copy(next);
        }
      }
      q.mesh.position.copy(q.p);q.mesh.rotation.x+=elapsed*7;q.fuse-=dt;
      if(q.fuse<=0){scene.remove(q.mesh);projectiles.splice(i,1);if(q.kind==='smoke')smoke(q.p);else explode(q.p);}
    }
    for(let i=explosions.length-1;i>=0;i--) {
      const e=explosions[i];e.life-=dt;e.mesh.scale.setScalar(.5+(1-e.life/.3)*4.5);e.mesh.material.opacity=Math.max(0,e.life*2);
      if(e.life<=0){scene.remove(e.mesh);e.mesh.material.dispose();explosions.splice(i,1);}
    }
    pose();
  }
  function render() {
    const active=state.mode==='playing'&&!state.help, inventoryUI=document.getElementById('equipment');inventoryUI.hidden=!active;
    for(const [key,value]of Object.entries(inventory)) {
      const node=document.getElementById('count-'+key);node.textContent=key==='knife'?(value?'已获得':'未获得'):value;
      node.parentElement.dataset.empty=String(!value);
    }
    overlay.style.opacity=active&&clouds.some(c=>camera.position.clone().sub(c.p).divide(v(5,2.5,5)).lengthSq()<1)?'.78':'0';
  }
  function reset() {
    Object.keys(inventory).forEach(k=>inventory[k]=0);busy=duration=0;action='';
    projectiles.forEach(q=>scene.remove(q.mesh));clouds.forEach(c=>{scene.remove(c.group);c.material.dispose();});
    explosions.forEach(e=>{scene.remove(e.mesh);e.mesh.material.dispose();});
    projectiles.length=clouds.length=explosions.length=0;overlay.style.opacity='0';hand.visible=false;gun.visible=true;
  }
  return {inventory,projectiles,clouds,explosions,melee,heal,throwItem,smokeBetween,update,render,pose,reset,get busy(){return busy;}};
};
