/* Original Los Angeles quarantine district. All artwork is generated locally. */
window.createDistrict = function ({T, world, scene, box, cylinder, mesh, mat, staticParts}) {
  let seed = 1046;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stone = '#84766a', rust = '#704536', dark = '#292c2b';
  const texture = (kind) => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const p = c.getContext('2d');
    p.fillStyle = kind === 'asphalt' ? '#44433f' : '#b1a090'; p.fillRect(0,0,512,512);
    for (let i=0;i<18000;i++) {
      p.fillStyle = random()>.5 ? 'rgba(20,15,10,.12)' : 'rgba(235,225,200,.13)';
      p.fillRect(random()*512,random()*512,1+random()*3,1+random()*3);
    }
    for (let i=0;i<22;i++) {
      let x=random()*512,y=random()*512;
      p.strokeStyle=kind==='asphalt'?'#242624':'#6c625955';p.lineWidth=random()*2+1;p.beginPath();p.moveTo(x,y);
      for(let j=0;j<9;j++){x+=random()*45-22;y+=random()*28;p.lineTo(x,y);}p.stroke();
    }
    if(kind==='plaster') for(let i=0;i<40;i++) {
      const x=random()*512; const g=p.createLinearGradient(x,0,x,250);
      g.addColorStop(0,'#40382f40');g.addColorStop(1,'#40382f00');p.fillStyle=g;p.fillRect(x,0,random()*18,250);
    }
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;
    t.repeat.set(kind==='asphalt'?3:2,kind==='asphalt'?14:2);t.anisotropy=4;return t;
  };
  const asphalt=new T.MeshStandardMaterial({map:texture('asphalt'),roughness:1});
  const plaster=new T.MeshStandardMaterial({map:texture('plaster'),color:'#ac9480',roughness:1});
  box(0,.042,-7,19.3,.018,86,asphalt);
  // Double yellow lanes, red curbs, a crosswalk and patched road surface.
  for(const x of [-.18,.18])box(x,.056,-7,.085,.012,74,'#bb9854');
  for(const x of [-10.2,10.2]) {
    box(x,.06,-6,.8,.12,74,'#958b7d');
    for(let z=-43;z<28;z+=6)box(x,.13,z,.19,.14,2.9,'#873f32');
  }
  for(let x=-8.7;x<9;x+=1.7)box(x,.067,1,1.05,.012,4.1,'#c0b5a0');
  for(let i=0;i<12;i++) {
    const m=mesh(new T.CircleGeometry(.5+random()*.8,9),'#292d2a');
    m.rotation.x=-Math.PI/2;m.position.set(random()*16-8,.069,random()*66-42);m.scale.y=.6;staticParts.push(m);
  }
  const addBeam = (a,b,r,color) => {
    const v=new T.Vector3(...b).sub(new T.Vector3(...a));
    const m=cylinder((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r,v.length(),color);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;
  };
  function palm(x,z,h,lean=1) {
    const top=[x+lean,h,z+.45];
    for(let i=0;i<10;i++) {
      const t=i/10,t2=(i+1)/10;
      addBeam([x+lean*t*t,h*t,z+.45*t],[x+lean*t2*t2,h*t2,z+.45*t2],.19-i*.008,'#70604a');
      cylinder(x+lean*t*t,h*t,z+.45*t,.21-i*.009,.07,'#413f30');
    }
    const crown=mesh(new T.IcosahedronGeometry(.43,1),'#444934');crown.position.set(...top);staticParts.push(crown);
    for(let k=0;k<9;k++) {
      const a=k*Math.PI*2/9, len=2.7+random()*1.7, positions=[];
      for(let j=0;j<6;j++) {
        const s=j/6,t=(j+1)/6;
        const center=q=>[top[0]+Math.cos(a)*len*q,top[1]+Math.sin(q*Math.PI)*.7-q*q*1.7,top[2]+Math.sin(a)*len*q];
        const A=center(s),B=center(t),w=.48*Math.sin((s+.08)*Math.PI);
        const l=[A[0]+Math.sin(a)*w,A[1],A[2]-Math.cos(a)*w],r=[A[0]-Math.sin(a)*w,A[1],A[2]+Math.cos(a)*w];
        positions.push(...A,...l,...B,...A,...B,...r);
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();
      const m=mesh(g,mat(k%3?'#4d5535':'#6b6841'));m.material.side=T.DoubleSide;staticParts.push(m);
    }
  }
  for(const [x,z,h,l] of [[-11,18,11,-.9],[11,12,13,1],[-11,-20,12,-.6],[11,-33,14,1.6],[-30,28,13,-2],[32,-34,14,1],[-40,-5,17,-1],[40,2,16,2]])palm(x,z,h,l);
  // Low-rise stucco storefronts mask the old perimeter; taller damaged blocks remain behind them.
  for(let i=0;i<6;i++) {
    const side=i%2?-1:1,x=side*34.7,z=24-Math.floor(i/2)*24,h=6.3+(i%3)*1.3;
    box(x,h/2,z,3.2,h,18,plaster);
    box(x-side*1.7,h+.12,z,.38,.3,18.5,'#b4a08c');
    box(x-side*1.69,3.5,z,.28,.35,18,'#66534a');
    for(let j=-1;j<=1;j++) {
      const wz=z+j*5;
      box(x-side*1.63,1.65,wz,.08,2.8,3.9,dark);
      box(x-side*1.73,3.05,wz,.22,.23,4.2,'#756856');
      for(const y of [.75,1.4,2.05]) {
        const b=box(x-side*1.8,y,wz,.1,.3,3.9,'#78634e');b.rotation.x=(j%2?.08:-.06);
      }
      if(i%2===0)box(x-side*1.7,4.9,wz,.1,1.55,2,'#323b3a');
    }
    box(x,h+.8,z+3,2,1.25,2,'#5d635e');
    if(i%2) {
      for(let b=0;b<3;b++)box(x,h+1+b*.55,z-5+b*.4,2.9,.4,2.3-b*.5,stone).rotation.z=b*.11;
      addBeam([x,h,z-6],[x-.6,h+3,z-6.4],.032,rust);
    }
  }
  // A detailed storefront on the central divider is visible immediately after leaving the safehouse.
  for(const [x,z,c] of [[-15,22.56,'#823f35'],[14,21.55,'#3f6662']]) {
    box(x,2,z,3.8,3.5,.1,plaster);
    box(x,1.45,z+.07,2.4,2.7,.08,'#292c29');
    for(let y=.3;y<2.8;y+=.23)box(x,y,z+.13,2.3,.06,.05,'#62635b');
    const awning=box(x,3.25,z+.65,4.7,.17,1.4,c);awning.rotation.x=.14;
    box(x,3.08,z+1.28,4.7,.25,.08,c);
  }
  // Street-facing shop windows, boarded doors and broken upper floors replace blank block walls.
  for(const [x,z,side,tint] of [[-12.43,15,1,'#754534'],[-12.43,3,1,'#504734'],[-12.43,-7,1,'#3f6558'],[11.94,14,-1,'#47605b']]) {
    for(let j=-1;j<=1;j++) {
      const zz=z+j*2.8;
      box(x,1.9,zz,.08,2.3,2.35,'#1c292a');
      box(x+side*.03,3.15,zz,.14,.18,2.55,'#918473');
      for(const y of [1.2,2.05])box(x+side*.09,y,zz,.08,.26,2.3,'#746047').rotation.x=j*.09;
      box(x+side*.08,2,zz-1.2,.1,2.5,.1,'#6c7569');
    }
    box(x+side*.5,3.35,z,1,.14,8.5,tint).rotation.z=side*-.12;
    box(x+side*.96,3.17,z,.09,.24,8.5,tint);
  }
  // Partially collapsed apartments: exposed floor plates and jagged concrete, no intact solid roof.
  for(const [x,z] of [[-15,1],[14,12]]) {
    for(const y of [4.9,7.4]) {
      box(x-.9,y,z,3.3,.28,8,'#7a776c');
      box(x+1.4,y-.12,z-2,1.7,.25,3.5,'#686b62').rotation.z=.14;
    }
    for(const dx of [-2,2])for(const dz of [-3.5,3.5]) {
      box(x+dx,6.15,z+dz,.29,3,.29,'#838377');
      addBeam([x+dx,7.4,z+dz],[x+dx+.11,8.4+random(),z+dz-.08],.025,rust);
    }
    box(x-1,6.1,z-3.6,3,2.2,.24,plaster);
    for(let i=0;i<9;i++) {
      const m=box(x+(random()-.5)*4,7.6+random()*.25,z+(random()-.5)*7,.3+random()*.7,.2+random()*.35,.5,stone);
      m.rotation.set(random()*.3,random()*3,random()*.3);
    }
    addBeam([x-2,7.5,z-2],[x+2,5,z+2],.085,'#4a4c45');
  }
  // Weathering belongs to the large existing concrete structures too.
  const weather=texture('plaster');
  for(const color of ['#7d887c','#87907f','#8c927c','#839380','#90998b','#768077']) {
    const m=mat(color);m.map=weather;m.color.set('#837f71');m.needsUpdate=true;
  }
  cylinder(-10.5,2.8,5.5,.08,5.6,'#494b44');
  addBeam([-10.5,5.5,5.5],[5.3,5.5,5.5],.075,'#454b45');
  for(const x of [-4,4]) {
    box(x,4.75,5.5,.42,1.35,.4,'#33342e');
    for(let j=0;j<3;j++) {
      const lamp=mesh(new T.SphereGeometry(.12,8,6),mat(j===0?'#bc5230':'#333f32'));lamp.position.set(x,5.15-j*.35,5.72);lamp.scale.z=.3;staticParts.push(lamp);
    }
  }
  // Burned-out vehicles have recognizable wheels, windows, hoods and doors, with proper collision.
  function car(x,z,rotation,color,police=false) {
    const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rotation;world.add(g);
    const b=(px,y,pz,w,h,d,c)=>box(px,y,pz,w,h,d,c,false,g);
    b(0,.65,0,1.9,.55,4.4,color);b(0,1.13,.1,1.65,.53,2.2,'#333b38');
    b(0,1.48,.25,1.69,.12,2,color);b(0,.95,-1.6,1.87,.17,1.14,rust);
    b(0,.95,1.72,1.88,.13,.91,color);
    for(const side of [-1,1]) {
      b(side*.86,1.18,.16,.08,.62,.1,color);b(side*.82,1.19,-.86,.08,.62,.1,color).rotation.x=-.2;
      b(side*.82,1.19,1.16,.08,.62,.1,color).rotation.x=.2;
      b(side*.95,.77,0,.055,.12,1.9,police?'#cecbc0':'#756251');
      for(const zz of [-1.35,1.37]){
        const w=mesh(new T.CylinderGeometry(.42,.42,.24,12),mat('#222522'),g);w.rotation.z=Math.PI/2;w.position.set(side*.95,.42,zz);
        const hub=mesh(new T.CylinderGeometry(.22,.22,.25,8),mat('#66665d'),g);hub.rotation.z=Math.PI/2;hub.position.copy(w.position);
      }
      b(side*.64,.78,-2.22,.4,.2,.04,'#aa9970');b(side*.64,.75,2.22,.34,.17,.04,'#742f24');
    }
    b(0,.52,-2.26,1.93,.12,.12,'#50534d');b(0,.73,-2.225,.7,.15,.03,dark);
    if(police){b(0,1.59,.2,1.1,.12,.3,'#282c2c');b(-.35,1.68,.2,.36,.13,.24,'#6d3632');b(.35,1.68,.2,.36,.13,.24,'#394e60');}
    // Bake local transforms into the static batch.
    g.updateMatrixWorld(true);for(const m of [...g.children]){world.attach(m);staticParts.push(m);}world.remove(g);
  }
  // Placed outside the critical combat lanes and all supply entrances.
  car(28,29,-.16,'#5d5548',true);car(-30,-39,.14,'#776f56');car(29,-3,-.3,'#454c48');
  // Matching colliders use conservative footprints and are supplied to the game below.
  const vehicleColliders=[{x:28,z:29,w:2.5,d:4.7},{x:-30,z:-39,w:2.5,d:4.7},{x:29,z:-3,w:3,d:4.8}];
  for(const [x,z] of [[-9,11],[10,-17],[-29,22],[29,21]]) {
    cylinder(x,.44,z,.17,.82,'#8d4c35');cylinder(x,.9,z,.24,.15,'#964f35');
    box(x,.54,z,.65,.15,.18,'#8d4c35');
  }
  // Crumbled concrete, exposed rebar, garbage bags and broken masonry beside buildings.
  for(let i=0;i<100;i++) {
    const side=i%2?-1:1,x=side*(31.6+random()*1.9),z=random()*78-50;
    const m=mesh(new T.DodecahedronGeometry(.16+random()*.42,0),i%4?stone:'#44473e');
    m.position.set(x,.1+random()*.18,z);m.scale.set(1,.35+random()*.4,1);m.rotation.set(random(),random(),random());staticParts.push(m);
  }
  for(const [x,z] of [[-16,-15],[15,5],[-35,-27],[35,-40]]) {
    for(let i=0;i<7;i++) {
      const m=box(x+(random()-.5)*2,.12+random()*.65,z+(random()-.5)*3,.7+random(),.28+random()*.45,.8,stone);
      m.rotation.set(random()*.5,random()*3,random()*.6);
    }
    addBeam([x,.3,z],[x+.7,2.8,z-.5],.025,rust);addBeam([x+.4,.1,z],[x-.2,2.1,z+.7],.025,rust);
  }
  // Utility wires and downtown silhouette against the smoky night.
  for(const side of [-1,1]) {
    for(let i=0;i<4;i++) {
      const x=side*29,z=24-i*23;cylinder(x,4.8,z,.11,9.6,'#5b4938');box(x,9,z,2.7,.14,.16,'#4a4034');
      if(i<3)for(const offset of [-.8,.8])for(let j=0;j<8;j++){
        const t=j/8,u=(j+1)/8;
        addBeam([x+offset,9-Math.sin(t*Math.PI)*1.1,z-t*23],[x+offset,9-Math.sin(u*Math.PI)*1.1,z-u*23],.016,'#34362f');
      }
    }
  }
  for(let i=0;i<13;i++) {
    const x=-47+i*7,h=16+random()*35,z=-86-random()*12;
    box(x,h/2,z,5+random()*4,h,8,'#8a8275');
    if(i%3===0){box(x,h+2,z,3,4,4,'#857d71');cylinder(x,h+6,z,.1,7,'#716e65');}
    for(let y=5;y<h-2;y+=3)box(x,y,z+4.02,4.3,.65,.03,'#656b63');
  }
  // No moon, sky glow, lit streetlamps or burning wrecks during the blackout.
  const puff=document.createElement('canvas');puff.width=puff.height=128;const pc=puff.getContext('2d'),pg=pc.createRadialGradient(64,64,1,64,64,62);
  pg.addColorStop(0,'#c4b9a6aa');pg.addColorStop(.45,'#88867c77');pg.addColorStop(1,'#55574e00');pc.fillStyle=pg;pc.fillRect(0,0,128,128);
  const smokeTexture=new T.CanvasTexture(puff),smokeGeometry=new T.PlaneGeometry(1,1),smoke=[];
  for(const [x,z] of [[28,29],[-30,-39],[29,-3],[-40,-39]]) {
    for(let i=0;i<8;i++) {
      const s=new T.Mesh(smokeGeometry,new T.MeshStandardMaterial({map:smokeTexture,color:'#454541',transparent:true,opacity:.38,depthWrite:false,roughness:1,side:T.DoubleSide}));s.receiveShadow=true;scene.add(s);
      smoke.push({s,x,z,phase:i/8});
    }
  }
  const ash=new T.InstancedMesh(new T.IcosahedronGeometry(.018,0),new T.MeshStandardMaterial({color:'#dbc6a1',roughness:1}),180);
  const particle=new T.Object3D();
  for(let i=0;i<180;i++){particle.position.set(random()*70-35,random()*16,random()*95-53);particle.updateMatrix();ash.setMatrixAt(i,particle.matrix);}
  ash.receiveShadow=true;scene.add(ash);
  return {vehicleColliders,update(time,camera){
    for(const p of smoke){const t=(time*.09+p.phase)%1;p.s.position.set(p.x+t*2.4,1+t*10,p.z+Math.sin(t*3)*.6);p.s.scale.setScalar(1.3+t*5);p.s.material.opacity=.48*Math.sin(t*Math.PI);if(camera)p.s.quaternion.copy(camera.quaternion);p.s.rotateZ(t*.5);}
    ash.position.x=Math.sin(time*.09)*2;ash.position.y=-time*.13%4;
  }};
};
