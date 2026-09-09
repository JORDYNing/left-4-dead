/* Companion navigation: leads to supplies, waits for the player, returns if separated. */
window.createGuide = function ({T, scene, player, ally, state, blocked, floorAt, move, radio, toast}) {
  const stops=[
    {x:-28.5,z:-12,y:0,name:'西侧医疗诊所',short:'诊所',line:'先去西侧诊所。跟着我的蓝色臂章，我带路。'},
    {x:21,z:-20,y:2.7,name:'东侧弹药平台',short:'弹药平台',line:'诊所到了，医疗箱在里面，按 E 使用。接下来绕街口，走坡道去弹药平台。'},
    {x:0,z:-41,y:0,name:'北侧泵站',short:'泵站',line:'弹药平台到了，按 E 补充弹药。最后去北侧泵站，我在前面掩护。'},
  ];
  const NX=49,NZ=65,S=1.5,count=NX*NZ;
  const cell=(x,z)=>T.MathUtils.clamp(Math.round((z+55)/S),0,NZ-1)*NX+T.MathUtils.clamp(Math.round((x+36)/S),0,NX-1);
  const point=i=>({x:i%NX*S-36,z:Math.floor(i/NX)*S-55});
  const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const guide={stage:0,complete:false,status:'准备出发',path:[],timer:0,announced:false,waiting:false,stops};
  const marker=new T.Mesh(new T.TorusGeometry(1,.035,5,40),new T.MeshBasicMaterial({color:'#7ccabb',transparent:true,opacity:.65,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;scene.add(marker);marker.visible=false;
  const walkable=new Uint8Array(count),cost=new Int32Array(count),queue=new Int32Array(count);
  function routeTo(target) {
    for(let i=0;i<count;i++){const p=point(i);walkable[i]=!blocked(p.x,p.z,floorAt(p.x,p.z),.48,false);}
    const nearest=p=>{let best=-1,d=Infinity;for(let i=0;i<count;i++){if(!walkable[i])continue;const q=point(i),n=(q.x-p.x)**2+(q.z-p.z)**2;if(n<d){best=i;d=n;}}return best;};
    let root=cell(target.x,target.z);if(!walkable[root])root=nearest(target);
    cost.fill(-1);if(root<0)return [];
    let head=0,tail=0;queue[tail++]=root;cost[root]=0;
    function neighbors(i,fn){const x=i%NX,z=Math.floor(i/NX),p=point(i),h=floorAt(p.x,p.z);for(const [dx,dz] of dirs){const xx=x+dx,zz=z+dz;if(xx<0||xx>=NX||zz<0||zz>=NZ)continue;const n=zz*NX+xx;if(!walkable[n]||(dx&&dz&&(!walkable[z*NX+xx]||!walkable[zz*NX+x])))continue;const q=point(n);if(Math.abs(floorAt(q.x,q.z)-h)>.51)continue;fn(n);}}
    while(head<tail){const i=queue[head++];neighbors(i,n=>{if(cost[n]<0){cost[n]=cost[i]+1;queue[tail++]=n;}});}
    let at=cell(ally.x,ally.z);if(!walkable[at])at=nearest(ally);
    const path=[];if(at<0||cost[at]<0)return path;
    // Include the source cell center: this keeps a new route from cutting a wall corner.
    path.push(point(at));
    for(let j=0;j<count&&cost[at]>0;j++){let next=at;neighbors(at,n=>{if(cost[n]>=0&&cost[n]<cost[next])next=n;});if(next===at)break;at=next;path.push(point(at));}
    return path;
  }
  guide.target=()=>guide.complete?null:stops[guide.stage];
  guide.reset=()=>{Object.assign(guide,{stage:0,complete:false,status:'准备出发',path:[],timer:0,announced:false,waiting:false});marker.visible=false;};
  guide.update=function(dt) {
    if(ally.hp<=0){guide.status='倒地待救援';marker.visible=false;return false;}
    const d=Math.hypot(player.x-ally.x,player.z-ally.z),stop=guide.target();
    marker.visible=state.gate&&!guide.complete;
    if(stop){marker.position.set(stop.x,stop.y+.09,stop.z);marker.scale.setScalar(1+Math.sin(state.time*2)*.07);}
    if(!state.gate){guide.status='在出口等你';return walk({x:1,z:31,y:0},dt,2.2);}
    if(!guide.announced){guide.announced=true;radio(stops[0].line,6);}
    if(stop&&Math.hypot(ally.x-stop.x,ally.z-stop.z)<2.3&&Math.hypot(player.x-stop.x,player.z-stop.z)<4.7&&Math.abs(player.y-stop.y)<1.1){
      guide.stage++;guide.path=[];guide.timer=0;
      if(guide.stage===stops.length){guide.complete=true;guide.status='区域到达 · 跟随掩护';radio('泵站到了。路线已打通，我会跟着你，守住这里。',6);toast('抵达泵站','诊所、弹药平台和泵站路线已完成。继续抵御尸潮。',5);}
      else{radio(stops[guide.stage].line,7);toast('抵达'+stop.name,'下一站：'+stops[guide.stage].name,4);}
    }
    // Return to a straying player instead of waiting indefinitely on another side of a building.
    if(d>17||guide.returning&&d>5){guide.returning=true;guide.status='返回接应';guide.waiting=false;return walk(player,dt,4.5);}
    if(guide.returning){guide.returning=false;guide.timer=0;}
    if(guide.complete){guide.status='跟随掩护';return d>4?walk(player,dt,3.7):false;}
    if(d>8.5){
      guide.status='等你跟上';
      if(!guide.waiting){radio('我在前面等你。跟上蓝色臂章，小心两边。',3);guide.waiting=true;}
      ally.g.rotation.y=Math.atan2(player.x-ally.x,player.z-ally.z)+Math.PI;return false;
    }
    guide.waiting=false;guide.status='带路 → '+guide.target().short;
    if(Math.hypot(ally.x-guide.target().x,ally.z-guide.target().z)<1.6){guide.status='抵达 · 等你靠近';return false;}
    return walk(guide.target(),dt,2.8);
  };
  function walk(target,dt,speed){
    guide.timer-=dt;const key=target===player?'player':target.x+','+target.z;
    if(guide.timer<=0||guide.key!==key||!guide.path.length){guide.path=routeTo(target);guide.key=key;guide.timer=1.1;}
    while(guide.path.length&&Math.hypot(ally.x-guide.path[0].x,ally.z-guide.path[0].z)<.16)guide.path.shift();
    const p=guide.path[0];if(!p)return false;
    const dx=p.x-ally.x,dz=p.z-ally.z,len=Math.hypot(dx,dz),step=Math.min(speed*dt,len),before=[ally.x,ally.z];
    move(ally,dx/len*step,dz/len*step,false);ally.y=floorAt(ally.x,ally.z);ally.g.rotation.y=Math.atan2(dx,dz)+Math.PI;
    return Math.hypot(ally.x-before[0],ally.z-before[1])>.0001;
  }
  guide.routeTo=routeTo;
  return guide;
};
