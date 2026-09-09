/* Per-run tutorial. Facts may arrive early; rewards always commit in order. */
window.createTutorial = function ({state, player, ally, guide, equipment, sound}) {
  const steps = [
    {title:'照亮前路', detail:'按 F 打开手电', needs:['light'], reward:'匕首', item:'knife', amount:1, hint:'V 近战'},
    {title:'掌握射击', detail:'命中训练靶或感染者，再按 R 完成换弹', needs:['hit','reload'], reward:'弹药 ×60', item:'ammo', amount:60, hint:'备用弹药 +60'},
    {title:'寻找医疗', detail:'跟随林抵达西侧诊所', needs:['clinic'], reward:'医疗包 ×1', item:'medkit', amount:1, hint:'Q 治疗自己'},
    {title:'补充装备', detail:'登上东侧弹药平台，靠近弹药箱按 E', needs:['platform','ammoBox'], reward:'烟雾弹 ×1', item:'smoke', amount:1, hint:'G 投掷烟雾弹'},
    {title:'掩护推进', detail:'按 G 投出烟雾弹，跟随林抵达北侧泵站', needs:['smoke','pump'], reward:'手雷 ×1', item:'grenade', amount:1, hint:'T 投掷手雷'},
  ];
  const facts = new Set(), rewards = [], queue = [];
  const panel=document.getElementById('tutorial-task'), notice=document.getElementById('reward-notice');
  let stage=0, noticeUntil=0;
  function record(event) {
    if(state.mode!=='playing')return;
    facts.add(event);
    while(stage<steps.length&&steps[stage].needs.every(key=>facts.has(key))) {
      const step=steps[stage++];
      if(step.item==='ammo')player.reserve+=step.amount;
      else equipment.inventory[step.item]+=step.amount;
      rewards.push(step.item);queue.push(step);sound('pickup');
    }
  }
  function update() {
    if(state.mode!=='playing')return;
    // These stages advance only after the player and companion reach the stop.
    if(guide.stage>=1)record('clinic');
    if(guide.stage>=2)record('platform');
    if(guide.complete)record('pump');
    if(state.time>=noticeUntil&&queue.length) {
      const step=queue.shift();
      notice.textContent=`已获得 ${step.reward} · ${step.hint}`;
      noticeUntil=state.time+3.2;
    }
  }
  function render() {
    const active=state.mode==='playing'&&!state.help;
    panel.hidden=!active||ally.hp<=0;
    notice.hidden=!active||state.time>=noticeUntil;
    if(!active)return;
    const step=steps[stage];
    document.getElementById('tutorial-label').textContent=step?`新手任务 ${stage+1} / 5 · ${step.title}`:'新手引导完成 · 守住泵站';
    let detail=step?.detail||'与林并肩作战，按 T 使用手雷';
    if(stage===1&&facts.has('hit'))detail='已命中目标 · 按 R 完成换弹';
    if(stage===1&&facts.has('reload'))detail='已完成换弹 · 命中训练靶或感染者';
    if(stage===4&&facts.has('smoke'))detail='已投出烟雾弹 · 跟随林抵达泵站';
    if(stage===4&&facts.has('pump'))detail='已抵达泵站 · 按 G 投出烟雾弹';
    document.getElementById('tutorial-detail').textContent=detail;
    document.getElementById('tutorial-reward').textContent=step?`奖励：${step.reward}`:'五项奖励已领取';
    panel.dataset.complete=String(!step);
  }
  function reset() {
    facts.clear();rewards.length=queue.length=0;stage=0;noticeUntil=0;
    notice.hidden=true;notice.textContent='';
  }
  return {steps, facts, rewards, record, update, render, reset, get stage(){return stage;}};
};
