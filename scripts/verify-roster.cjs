const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const source = fs.readFileSync('index.html', 'utf8');
const playerUpdate = source.slice(source.indexOf('function updatePlayer(dt)'), source.indexOf('function updateEffects(dt)'));
const typeConfig = source.slice(source.indexOf('const types = {'), source.indexOf('const actor = createCharacterFactory'));

// Run the real model factory and control functions without the unrelated combat
// director. The fixture stays in ignored logs and is never part of the game UI.
fs.mkdirSync('logs', {recursive: true});
fs.writeFileSync('logs/roster-check.html', `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"../vendor/three/three.module.js"}}</script>
<script src="../guide.js"></script><script type="module">
import * as T from 'three';import {loadCharacterFactory} from '../characters.js';
window.THREE=T;window.ready=loadCharacterFactory().then(factory=>{window.createActor=factory;return true});
</script>`);
const session = process.argv[2] || 'afterlight-roster';
const url = process.argv[3] || 'http://127.0.0.1:8000/logs/roster-check.html';
execFileSync('agent-browser', ['--session', session, 'open', url], {timeout: 30000});
const suite = async function (playerSource, typeSource) {
  await window.ready;
  const T = window.THREE, results = [];
  const assert = (value, message) => { if (!value) throw Error(message); };
  const test = (name, fn) => { try { results.push({name, pass: true, evidence: fn()}); } catch (error) { results.push({name, pass: false, error: error.message}); } };
  test('five distinct model variants animate and reset independently', () => {
    const types = new Function(typeSource + ';return types;')(), kinds = Object.keys(types);
    assert(kinds.length === 5, 'Expected five enemy types');
    const actors = kinds.map(kind => window.createActor(null, kind));
    const guard = actors.find(a => a.kind === 'guard'), stalker = actors.find(a => a.kind === 'stalker');
    assert(guard.gear.some(m => m.name === 'riot helmet'), 'Guard model lacks a helmet');
    assert(stalker.gear.some(m => m.name === 'back spine'), 'Stalker lacks its distinctive silhouette');
    for (const actor of actors) {
      assert(actor.head.isBone && actor.meshes.some(m => m.isSkinnedMesh && m.material.map), 'Missing textured skeleton');
      actor.animate(0, true); actor.animate(.1, true);
      assert(actor.activeAction === 'walk', 'Walking animation missing');
      actor.animate(.2, false, true); assert(actor.activeAction === 'attack', 'Attack animation missing');
      actor.die(); actor.mixer.update(1); assert(actor.activeAction === 'dead', 'Death animation missing');
      actor.setOpacity(.2); actor.resetPose();
      assert(actor.activeAction === 'walk' && actor.meshes.every(m => m.material.opacity === 1), 'Reset leaked death/opacity state');
    }
    const unchanged = actors[1].head.quaternion.clone();
    actors[0].animate(.1, true); actors[0].animate(.2, true);
    assert(actors[1].head.quaternion.angleTo(unchanged) < .0001, 'Skeletons share animation state');
    window.rosterActors = actors;
    return actors.map(a => ({kind: a.kind,parts: a.gear.length}));
  });
  test('real forward input moves at reduced walk, sprint and aim speeds', () => {
    const run = new Function('sprint', 'aiming', `
      const player={x:0,y:0,z:38,yaw:0,fire:0,reload:0,stamina:100,grounded:true,vy:0};
      const keys=new Set(sprint?['KeyW','ShiftLeft']:['KeyW']);
      const state={gate:true},mouseDown=false,clamp=THREE.MathUtils.clamp;
      let stepClock=0;const sound=()=>{},supportAt=()=>0,move=(a,x,z)=>{a.x+=x;a.z+=z};
      ${playerSource}
      for(let i=0;i<60;i++)updatePlayer(1/60);
      return {distance:38-player.z,stamina:player.stamina};`);
    const walk = run(false, false), sprint = run(true, false), aim = run(true, true);
    assert(Math.abs(walk.distance - 3.4) < .01, 'Walk speed must be 3.4 m/s');
    assert(Math.abs(sprint.distance - 5.4) < .01 && sprint.stamina < walk.stamina, 'Sprint speed/stamina incorrect');
    assert(Math.abs(aim.distance - 2.2) < .01, 'Aiming must suppress sprint');
    return {walk: walk.distance, sprint: sprint.distance, aim: aim.distance};
  });
  test('companion follow, wait and return thresholds are doubled', () => {
    const player={x:0,y:0,z:0},ally={x:0,y:0,z:6,hp:100,g:new T.Group()},state={gate:true,time:0};
    const guide=createGuide({T,scene:new T.Scene(),player,ally,state,blocked:()=>false,floorAt:()=>0,
      move:(a,x,z)=>{a.x+=x;a.z+=z},toast:()=>{},navigation:{route:(_a,p)=>[{x:p.x,z:p.z}]}});
    guide.complete=true;guide.stage=3;guide.update(.1);assert(ally.z===6,'Follows too closely at 6m');
    ally.z=9;guide.update(.1);assert(ally.z<9,'Does not follow beyond 8m');
    const at=distance=>{guide.reset();ally.x=0;ally.z=distance;guide.update(.1);return guide.status};
    assert(at(16).startsWith('带路')&&at(18)==='等你跟上','17m waiting threshold incorrect');
    assert(at(33)==='等你跟上'&&at(35)==='返回接应','34m return threshold incorrect');
    ally.z=9;guide.update(.1);assert(!guide.returning,'Does not rejoin within 10m');
    return guide.distances;
  });
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
};
const expression = `(${suite})(${JSON.stringify(playerUpdate)},${JSON.stringify(typeConfig)})`;
const output = execFileSync('agent-browser', ['--session', session, 'eval', '-b', Buffer.from(expression).toString('base64')], {encoding: 'utf8', timeout: 60000});
fs.writeFileSync('logs/roster-verification.json', output); console.log(output);
const result = JSON.parse(output); if (result.passed !== result.total) process.exitCode = 1;
