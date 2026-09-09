/* Companion navigation: leads to supplies, waits for the player, returns if separated. */
window.createGuide = function ({T, scene, player, ally, state, blocked, floorAt, move, toast, navigation}) {
  const stops=[
    {x:-28.5,z:-12,y:0,name:'西侧医疗诊所',short:'诊所'},
    {x:21,z:-20,y:2.7,name:'东侧弹药平台',short:'弹药平台'},
    {x:0,z:-41,y:0,name:'北侧泵站',short:'泵站'},
  ];
  const guide={stage:0,complete:false,status:'准备出发',path:[],timer:0,stops};
  const marker=new T.Mesh(new T.TorusGeometry(1,.035,5,40),new T.MeshStandardMaterial({color:'#7ccabb',roughness:1,transparent:true,opacity:.65,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;scene.add(marker);marker.visible=false;
  const distances={follow:8,wait:17,return:34,rejoin:10};
  guide.distances=distances;
  const routeTo=target=>navigation.route(ally,target,.52);
  guide.target=()=>guide.complete?null:stops[guide.stage];
  guide.reset=()=>{Object.assign(guide,{stage:0,complete:false,status:'准备出发',path:[],timer:0,returning:false,key:null});marker.visible=false;};
  guide.update=function(dt) {
    if(ally.hp<=0){guide.status='倒地待救援';marker.visible=false;return false;}
    const d=Math.hypot(player.x-ally.x,player.z-ally.z),stop=guide.target();
    marker.visible=state.gate&&!guide.complete;
    if(stop){marker.position.set(stop.x,stop.y+.09,stop.z);marker.scale.setScalar(1+Math.sin(state.time*2)*.07);}
    if(!state.gate){guide.status='在出口等你';return walk({x:1,z:31,y:0},dt,2.2);}
    if(stop&&Math.hypot(ally.x-stop.x,ally.z-stop.z)<2.3&&Math.hypot(player.x-stop.x,player.z-stop.z)<4.7&&Math.abs(player.y-stop.y)<1.1){
      guide.stage++;guide.path=[];guide.timer=0;
      if(guide.stage===stops.length){guide.complete=true;guide.status='区域到达 · 跟随掩护';toast('抵达泵站');}
      else toast('抵达'+stop.short);
    }
    // Return to a straying player instead of waiting indefinitely on another side of a building.
    if(d>distances.return||guide.returning&&d>distances.rejoin){guide.returning=true;guide.status='返回接应';return walk(player,dt,4.5);}
    if(guide.returning){guide.returning=false;guide.timer=0;}
    if(guide.complete){guide.status='跟随掩护';return d>distances.follow?walk(player,dt,3.7):false;}
    if(d>distances.wait){
      guide.status='等你跟上';
      ally.g.rotation.y=Math.atan2(player.x-ally.x,player.z-ally.z)+Math.PI;return false;
    }
    guide.status='带路 → '+guide.target().short;
    if(Math.hypot(ally.x-guide.target().x,ally.z-guide.target().z)<1.6){guide.status='抵达 · 等你靠近';return false;}
    return walk(guide.target(),dt,2.8);
  };
  function walk(target,dt,speed){
    guide.timer-=dt;const key=target===player?'player':target.x+','+target.z;
    if(guide.timer<=0||guide.key!==key||!guide.path.length){guide.path=routeTo(target);guide.key=key;guide.timer=1.1;}
    while(guide.path.length&&Math.hypot(ally.x-guide.path[0].x,ally.z-guide.path[0].z)<.16&&Math.abs(floorAt(guide.path[0].x,guide.path[0].z)-ally.y)<.08)guide.path.shift();
    const p=guide.path[0];if(!p)return false;
    const dx=p.x-ally.x,dz=p.z-ally.z,len=Math.hypot(dx,dz),step=Math.min(speed*dt,len),before=[ally.x,ally.z];
    move(ally,dx/len*step,dz/len*step,false);ally.y=floorAt(ally.x,ally.z);ally.g.rotation.y=Math.atan2(dx,dz)+Math.PI;
    return Math.hypot(ally.x-before[0],ally.z-before[1])>.0001;
  }
  guide.routeTo=routeTo;
  return guide;
};
