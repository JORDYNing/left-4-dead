/* Radius-aware navigation. Every graph edge is swept through the same world collision
   used by movement, including low cover and ramp height changes. */
window.createNavigation = function ({blocked, floorAt}) {
  const NX=73,NZ=97,N=NX*NZ,dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const graphs=new Map();let revision=0;
  const point=i=>({x:i%NX-36,z:Math.floor(i/NX)-55});
  const cell=(x,z)=>Math.max(0,Math.min(NZ-1,Math.round(z+55)))*NX+Math.max(0,Math.min(NX-1,Math.round(x+36)));
  function supported(x,z,r) {
    const h=floorAt(x,z);
    return [[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dz])=>Math.abs(floorAt(x+dx,z+dz)-h)<=.25);
  }
  function clear(a,b,r=.52) {
    const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.18));
    let y=floorAt(a.x,a.z);
    for(let i=0;i<=steps;i++) {
      const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,h=floorAt(x,z);
      if(Math.abs(h-y)>.25||!supported(x,z,r)||blocked(x,z,h,r,true))return false;
      y=h;
    }
    return true;
  }
  function graph(radius=.52) {
    const r=radius>.6?.78:.52;
    if(graphs.has(r))return graphs.get(r);
    const walk=new Uint8Array(N),edges=new Uint8Array(N),heights=new Float32Array(N);
    for(let i=0;i<N;i++){const p=point(i);heights[i]=floorAt(p.x,p.z);walk[i]=supported(p.x,p.z,r)&&!blocked(p.x,p.z,heights[i],r,true);}
    for(let i=0;i<N;i++) {
      if(!walk[i])continue;
      const x=i%NX,z=Math.floor(i/NX),p=point(i);
      dirs.forEach(([dx,dz],d)=>{
        const xx=x+dx,zz=z+dz,n=zz*NX+xx;
        if(xx<0||xx>=NX||zz<0||zz>=NZ||!walk[n])return;
        if(dx&&dz&&(!walk[z*NX+xx]||!walk[zz*NX+x]))return;
        if(n<i?(edges[n]&(1<<[1,0,3,2,7,6,5,4][d])):clear(p,point(n),r))edges[i]|=1<<d;
      });
    }
    const g={r,walk,edges,fields:new Map(),revision};graphs.set(r,g);return g;
  }
  function nearest(p,g,connect=false) {
    let best=-1,score=Infinity;
    for(let i=0;i<N;i++) {
      if(!g.walk[i])continue;
      const q=point(i),d=(q.x-p.x)**2+(q.z-p.z)**2;
      if(d>=score||connect&&!clear(p,q,g.r))continue;
      best=i;score=d;
      if(d<.01)break;
    }
    return best;
  }
  function fieldTo(target,r=.52) {
    const g=graph(r);let root=cell(target.x,target.z);
    if(!g.walk[root]||!clear(target,point(root),g.r))root=nearest(target,g);
    if(g.fields.has(root))return g.fields.get(root);
    const cost=new Int32Array(N),queue=new Int32Array(N);cost.fill(-1);
    if(root>=0){let head=0,tail=1;queue[0]=root;cost[root]=0;
      while(head<tail){const i=queue[head++];dirs.forEach(([dx,dz],d)=>{if(!(g.edges[i]&(1<<d)))return;const n=i+dz*NX+dx;if(cost[n]>=0)return;cost[n]=cost[i]+1;queue[tail++]=n;});}}
    const f={cost,g,root,target:{x:target.x,z:target.z}};
    // Bounded cache; moving targets and flanking slots cannot grow memory indefinitely.
    if(g.fields.size>=24)g.fields.delete(g.fields.keys().next().value);
    g.fields.set(root,f);return f;
  }
  function direction(a,target,r=.52) {
    const distance=Math.hypot(target.x-a.x,target.z-a.z);
    if(distance<.05)return {x:0,z:0};
    let p=target;
    if(!clear(a,target,r)) {
      const f=fieldTo(target,r);let at=cell(a.x,a.z);
      if(!f.g.walk[at]||!clear(a,point(at),r))at=nearest(a,f.g,true);
      if(at<0||f.cost[at]<0)return {x:0,z:0};
      let next=at,best=f.cost[at];
      dirs.forEach(([dx,dz],d)=>{if(!(f.g.edges[at]&(1<<d)))return;const n=at+dz*NX+dx;if(f.cost[n]>=0&&f.cost[n]<best&&clear(a,point(n),r)){next=n;best=f.cost[n];}});
      p=point(next);
    }
    const dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz);
    return len<.025?{x:0,z:0}:{x:dx/len,z:dz/len,distance:len};
  }
  function route(a,target,r=.52) {
    const f=fieldTo(target,r);let at=cell(a.x,a.z);
    if(!f.g.walk[at]||!clear(a,point(at),r))at=nearest(a,f.g,true);
    if(at<0||f.cost[at]<0)return [];
    const path=[point(at)];
    for(let j=0;j<N&&f.cost[at]>0;j++) {
      let next=at;dirs.forEach(([dx,dz],d)=>{if(!(f.g.edges[at]&(1<<d)))return;const n=at+dz*NX+dx;if(f.cost[n]>=0&&f.cost[n]<f.cost[next])next=n;});
      if(next===at)break;at=next;path.push(point(at));
    }
    // Avoid walking backward to a cell center when replanning between centers.
    for(let i=0;i<3&&path.length>1&&clear(a,path[1],r);i++)path.shift();
    return path;
  }
  return {point,cell,graph,clear,nearest,fieldTo,direction,route,invalidate(){revision++;graphs.clear();},get revision(){return revision;}};
};
