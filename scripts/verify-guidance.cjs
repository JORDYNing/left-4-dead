const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
function setup(){
  const g=window.__game;g.setLocked(false);g.reset();g.state.help=false;
  document.querySelector('#help').hidden=true;document.querySelector('#sound').checked=false;
  window.qa={g,assert:(v,m)=>{if(!v)throw Error(m);},place:(x,z,y=0,yaw=0)=>{
    Object.assign(g.player,{x,z,y,yaw,pitch:0,grounded:true});g.updateCamera(0);g.updateUI();
  },arena:()=>{g.openGate();g.state.between=999;}};
}

test('exit forces a left turn, including attempts to jump or circle behind the safehouse',()=>{
  const {g,assert,arena}=qa;arena();const report=[];
  for(const b of g.barriers)g.damageBarrier(b,9999);
  for(const y of [0,1.35,2.5]){
    const forward={x:0,z:25,y},right={x:0,z:25,y},left={x:0,z:25,y},back={x:-22,z:25,y};
    g.move(forward,0,-10);g.move(right,12,0);g.move(left,-22,0);g.move(back,0,20);
    assert(forward.z>=23.85,'Forward bypass at height '+y);
    assert(right.x<=2.75,'Right bypass at height '+y);
    assert(left.x<-21.9,'Left passage blocked at height '+y);
    assert(back.z<26.4,'Can circle behind the safehouse');
    report.push({y,frontZ:forward.z,rightX:right.x,leftX:left.x,backZ:back.z});
  }
  assert(!g.visible(new THREE.Vector3(0,1.65,25),new THREE.Vector3(0,1.65,20)),'Closing wall does not block sight/shots');
  return report;
});

test('clinic south door is mandatory and later supply areas remain reachable for every body size',()=>{
  const {g,assert,arena}=qa;arena();const report=[];
  for(const b of g.barriers)g.damageBarrier(b,9999);
  for(const radius of [.36,.52,.78]) {
    // Flood real collision samples at half-meter spacing, independently of the AI route.
    // Seal only the clinic threshold: no other exit may remain from the starting corridor.
    const nx=145,nz=193,walk=new Uint8Array(nx*nz),seen=new Uint8Array(nx*nz),queue=new Int32Array(nx*nz);
    const point=i=>({x:i%nx*.5-36,z:Math.floor(i/nx)*.5-55});
    const cell=(x,z)=>Math.round((z+55)*2)*nx+Math.round((x+36)*2);
    for(let i=0;i<walk.length;i++){
      const p=point(i);walk[i]=!(p.z>=2.5&&p.z<=3.5&&p.x<-18)&&!g.blocked(p.x,p.z,g.floorAt(p.x,p.z),radius,true);
    }
    let head=0,tail=1;queue[0]=cell(0,36);seen[queue[0]]=1;
    while(head<tail){const i=queue[head++],p=point(i);for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const x=i%nx+dx,z=Math.floor(i/nx)+dz,j=z*nx+x;
      if(x<0||x>=nx||z<0||z>=nz||!walk[j]||seen[j])continue;
      const q=point(j);if(Math.abs(g.floorAt(q.x,q.z)-g.floorAt(p.x,p.z))>.25)continue;
      seen[j]=1;queue[tail++]=j;
    }}
    assert(seen[cell(-24,5)]&&seen[cell(-22,25)],'Approach disconnected');
    for(const [x,z]of [[0,20],[24,12],[-28,-12],[20,-20],[0,-43],[-34,15]])
      assert(!seen[cell(x,z)],'Clinic can be bypassed toward '+[x,z]+' at radius '+radius);
    const field=g.navigation.fieldTo(g.player,radius);
    for(const [x,z]of [[-28,-12],[24,12],[20,-20],[0,-43]])assert(field.cost[g.cell(x,z)]>=0,'Later area disconnected '+[x,z]);
    const route=g.navigation.route(g.player,g.guide.stops[0],radius);
    assert(route.some(p=>p.x<-19&&p.z>=24),'Route never turns left');
    assert(route.some(p=>p.z===3&&p.x>-26&&p.x<-23),'Route misses the clinic doorway');
    report.push({radius,startAreaCells:tail,routeCells:route.length});
  }
  return report;
});

test('route cue follows the actual corridor and keeps turns visible when offscreen or behind',()=>{
  const {g,assert,arena,place}=qa;arena();place(0,25);
  const cue=g.guidance.cue;assert(cue&&cue.x<0&&cue.z>23.5&&cue.instruction==='向左转','Cue points through the closed street');
  assert(g.navigation.clear(g.player,cue,.52),'Cue is not walkable');
  const direct=Math.hypot(g.guide.stops[0].x,g.guide.stops[0].z-25);
  assert(cue.distance>direct+8,'Distance ignores the route detour');
  for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]){
    place(0,25,0,yaw);const el=document.querySelector('#waypoint'),r=el.getBoundingClientRect();
    assert(!el.hidden&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'Cue leaves viewport at yaw '+yaw);
  }
  place(0,25,0,Math.PI/2);assert(g.guidance.cue.instruction==='沿通道前进','Turn does not update with camera direction');
  return {cue,straightDistance:direct};
});

test('objective stages, nearby supply action, rescue, completion and restart stay synchronized',()=>{
  const {g,assert,arena,place}=qa;g.updateUI();
  const title=()=>document.querySelector('#objective-title').textContent;
  assert(title()==='离开安全屋','Starting instruction absent');arena();place(0,25);
  assert(title()==='前往诊所'&&document.querySelector('#objective-step').textContent.includes('1 / 3'),'Clinic objective absent');
  g.guide.stage=1;g.player.hp=30;place(-29,-13);
  assert(title()==='前往弹药平台'&&document.querySelector('#objective-detail').textContent.includes('按 E 治疗'),'Supply action absent');
  const prompts=[...document.querySelectorAll('#player-prompts > div')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());
  assert(prompts.every((r,i)=>i===0||r.top>=prompts[i-1].bottom+8),'Dialogue overlaps an interaction/tutorial prompt');
  g.interact();g.updateUI();assert(g.player.hp===90&&!document.querySelector('#objective-detail').textContent.includes('按 E 治疗'),'Cooling supply retains action');
  g.guide.stage=2;place(20,-20,2.7);assert(title()==='前往泵站','Pump objective absent');
  g.guide.complete=true;g.updateUI();assert(title()==='守住泵站'&&document.querySelector('#waypoint').hidden,'Completed route keeps old cue');
  g.ally.hp=0;Object.assign(g.ally,{x:21,z:-20,y:2.7});g.updateUI();
  assert(title()==='扶起林'&&g.guidance.cue?.instruction==='按 E 扶起林','Rescue does not override objective');
  g.reset();g.state.help=false;document.querySelector('#help').hidden=true;g.updateUI();
  assert(title()==='离开安全屋'&&g.guide.stage===0&&g.guidance.history.length===1,'Restart leaks progress');
  g.state.help=true;g.updateUI();assert(document.querySelector('#companion-dialogue').hidden&&document.querySelector('#waypoint').hidden,'Guidance overlaps help');
  return {stages:3,rescue:true,restart:true};
});

test('companion gives contextual route lines once, with readable spacing',()=>{
  const {g,assert,arena,place}=qa;g.updateUI();arena();g.state.time=9;place(0,25);
  g.state.time=18;place(-23,18);g.state.time=27;place(-24,5);
  g.state.time=36;g.guide.stage=1;place(-28,-12);
  g.state.time=45;place(20,-1);g.state.time=54;g.guide.stage=2;place(20,-20,2.7);
  g.state.time=63;g.guide.complete=true;place(0,-41);
  const keys=g.guidance.history.map(l=>l.key);
  for(const key of ['start','left','alley','clinic-door','clinic','ramp','ammo','pump'])assert(keys.includes(key),'Missing contextual line '+key);
  for(let i=0;i<180;i++){g.state.time+=.1;g.guidance.update();}
  assert(g.guidance.history.length===keys.length,'Route dialogue repeats while standing still');
  assert(g.guidance.history.every((l,i)=>i===0||l.time-g.guidance.history[i-1].time>=5),'Route lines flash too rapidly');
  return g.guidance.history;
});

test('companion wait, return, rejoin and downed dialogue react without subtitle spam',()=>{
  const {g,assert,arena,place}=qa;arena();place(0,25);
  g.state.time=10;g.guide.status='等你跟上';g.updateUI();
  g.state.time=20;g.guide.returning=true;g.updateUI();
  g.state.time=30;g.guide.returning=false;g.guide.status='带路 → 诊所';g.updateUI();
  g.state.time=31;g.ally.hp=0;g.updateUI();
  assert(g.guidance.history.at(-1).key==='down','Urgent rescue line failed to interrupt');
  for(let i=0;i<100;i++){g.state.time+=.1;g.updateUI();}
  const keys=g.guidance.history.map(l=>l.key);
  for(const key of ['wait','return','rejoin','down'])assert(keys.includes(key),'Missing support line '+key);
  assert(keys.filter(k=>k==='down').length===1,'Downed call repeats too frequently');
  g.ally.hp=65;g.updateUI();assert(g.guidance.history.at(-1).key==='revived','Revived teammate keeps asking for rescue');
  return g.guidance.history;
});

test('all six supplies retain their signs and interactions after the entrance rebuild',()=>{
  const {g,assert,arena,place}=qa;arena();const signs=[];
  g.scene.traverse(o=>{if(o.name.startsWith('Sign: ')&&o.parent!==g.ally.g)signs.push(o);});
  assert(signs.length===9&&!signs.some(s=>/[←→↑↓]|出口/.test(s.name)),'Directional street signs returned');
  for(const s of g.supplies){
    assert(signs.some(o=>Math.abs(o.position.x-s.x)<.01&&Math.abs(o.position.z-s.z+.45)<.01),'Supply sign missing');
    Object.assign(g.player,{hp:30,ammo:2,reserve:0});place(s.x,s.z+1.5,s.y);g.interact();
    assert(s.type==='med'?g.player.hp===90:g.player.ammo===30&&g.player.reserve===240,'Supply interaction failed');
  }
  return {supplies:g.supplies.length,signs:signs.length};
});

const results=[],session=process.argv[2]||'afterlight-route';
for(const {name,fn}of tests){
  const code=`(${setup})(); (()=>{try{return {pass:true,evidence:(${fn})()}}catch(e){return {pass:false,error:e.message}}})()`;
  const out=execFileSync('agent-browser',['--session',session,'eval','-b',Buffer.from(code).toString('base64')],{encoding:'utf8',timeout:120000});
  const result={name,...JSON.parse(out)};results.push(result);console.log(JSON.stringify(result));
}
fs.mkdirSync('logs',{recursive:true});fs.writeFileSync('logs/guidance-verification.json',JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
if(results.some(r=>!r.pass))process.exitCode=1;
