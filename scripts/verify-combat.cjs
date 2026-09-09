const {execFileSync} = require('node:child_process');
const fs = require('node:fs');

const suite = async function () {
  const g = window.__game, results = [], T = window.THREE;
  const assert = (v, message) => { if (!v) throw Error(message); };
  const test = async (name, fn) => { try { results.push({name, pass: true, evidence: await fn()}); } catch (e) { results.push({name, pass: false, error: e.message}); } };
  const step = (seconds, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) g.simulate(1 / fps); };
  const reset = () => {
    g.setLocked(false); g.reset(); g.state.help = false; document.querySelector('#help').hidden = true;
    document.querySelector('#sound').checked = false; g.ally.hp = 0; g.openGate(); g.state.between = 999;
    Object.assign(g.player, {x: 0, y: 0, z: 20, pitch: 0, yaw: 0}); g.updateCamera(0);
  };
  const shootAt = (e, height) => {
    g.player.yaw = -Math.atan2(e.x - g.player.x, g.player.z - e.z);
    g.player.pitch = Math.atan2(e.y + height - (g.player.y + 1.68), Math.hypot(e.x - g.player.x, e.z - g.player.z));
    g.updateCamera(0); g.shoot();
  };
  const visibleNumbers = () => g.combat.debug.numbers.filter(n => !n.node.hidden);

  await test('first-shot pushback, sustained kickback and full recovery', () => {
    reset(); g.shoot(); const r = g.combat.recoil, first = r.gunZ.p, firstPitch = g.camera.rotation.x;
    assert(first > .04 && r.gunPitch.p > .02, 'First shot lacks backward and angular kick');
    step(.12); const before = r.gunZ.p; g.shoot();
    assert(!g.combat.debug.lastShot.first && r.burst === 2 && r.gunZ.p > before, 'Repeated kick does not retrigger');
    assert(r.gunZ.p - before < first && g.camera.rotation.x > firstPitch, 'First and sustained impulses are indistinguishable');
    const sustainedPitch = g.camera.rotation.x;
    step(1.5);
    assert(Math.abs(r.gunZ.p) < .0001 && Math.abs(g.camera.rotation.x - g.player.pitch) < .0001 && r.heat === 0, 'Recoil never returns to aim');
    g.shoot(); assert(g.combat.debug.lastShot.first, 'New burst failed to restore first-shot pushback');
    return {firstPushback: first, firstPitch, sustainedPitch};
  });

  await test('held fire changes actual shot direction and preserves rate at 30/60/120 fps', () => {
    const counts = [];
    for (const fps of [30, 60, 120]) {
      reset(); g.setFiring(true); step(1, fps); g.setFiring(false);
      const s = g.combat.debug.lastShot;
      assert(s.direction.y > .045 && s.spread > .003, 'Recoil and bloom did not affect live hitscan');
      counts.push(g.combat.recoil.shots);
    }
    assert(counts.every(n => n === 10), 'Frame rate changes fire rate: ' + counts);
    return {fps: [30, 60, 120], shotsPerSecond: counts};
  });

  await test('ADS uses smaller gun/camera kick, tighter spread and centered sights', () => {
    reset(); g.shoot(); const hip = {z: g.combat.recoil.gunZ.p, pitch: g.camera.rotation.x};
    step(.12); g.shoot(); hip.spread = g.combat.debug.lastShot.spread;
    reset(); g.setAiming(true); step(.5); g.shoot();
    const ads = {z: g.combat.recoil.gunZ.p, pitch: g.camera.rotation.x};
    assert(ads.z < hip.z * .6 && ads.pitch < hip.pitch * .6, 'ADS not braced');
    step(.12); g.shoot(); ads.spread = g.combat.debug.lastShot.spread;
    assert(ads.spread < hip.spread * .4, 'ADS spread not tighter');
    step(1); const sight = new T.Vector3(.24, -.024, -.77); g.gun.localToWorld(sight); sight.project(g.weaponCamera);
    assert(Math.abs(sight.x) < .005 && Math.abs(sight.y) < .01, 'ADS front sight not centered');
    return {hip, ads, sight: sight.toArray()};
  });

  await test('camera shake decays and springs agree across frame rates', () => {
    const poses = [];
    for (const fps of [30, 60, 120]) {
      reset(); g.shoot(); step(.1, fps);
      poses.push(g.combat.recoil.gunZ.p);
      assert(g.combat.recoil.shakeTime === 0, 'Shake persists after shot impulse');
    }
    assert(Math.max(...poses) - Math.min(...poses) < .00001, 'Spring response depends on frame rate');
    reset(); g.shoot(); step(1 / 60); assert(Math.abs(g.camera.rotation.z) > .0001, 'Camera never shakes');
    return {gunZAt100ms: poses};
  });

  await test('muzzle and ejection sockets project correctly for both FOVs and aspect ratios', () => {
    const originalAspect = g.camera.aspect, errors = [];
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) for (const ads of [false, true]) {
      reset(); g.camera.aspect = g.weaponCamera.aspect = aspect;
      g.setAiming(ads); step(.5); g.updateCamera(0);
      for (const socket of [g.muzzle, g.ejector]) {
        const a = socket.getWorldPosition(new T.Vector3()).project(g.weaponCamera);
        const b = g.combat.socketWorld(socket).project(g.camera);
        const error = Math.hypot(a.x - b.x, a.y - b.y); errors.push(error);
        assert(error < .00001, 'Effect socket drifts away from viewmodel');
      }
    }
    g.camera.aspect = g.weaponCamera.aspect = originalAspect; g.updateCamera(0);
    reset(); g.keys.add('KeyD'); g.setFiring(true); step(1 / 60); g.keys.clear(); g.setFiring(false);
    assert(Math.abs(g.combat.debug.lastShot.origin.x - g.player.x) < .00001, 'Firing used previous movement frame');
    return {maxProjectionError: Math.max(...errors)};
  });

  await test('muzzle flash, smoke, bolt cycle and finite tracer expire without lighting the district', () => {
    reset(); g.shoot();
    const d = g.combat.debug;
    assert(g.flash.visible && d.glow.visible, 'No muzzle flash');
    const lights=[];g.scene.traverse(x=>{if(x.isLight)lights.push(x);});
    assert(lights.length===1&&lights[0]===g.flashlight,'Gunfire introduced an additional scene light');
    assert(d.smoke.some(p => p.sprite.visible) && d.tracers.some(t => t.root.visible), 'No smoke/tracer');
    step(2 / 60); assert(g.bolt.position.z > -.48, 'Bolt did not cycle');
    step(.2); assert(!g.flash.visible && !d.glow.visible && !d.tracers.some(t => t.root.visible), 'Flash or bullet beam persists');
    assert(Math.abs(g.bolt.position.z + .51) < .00001, 'Bolt failed to return');
    step(.5); assert(!d.smoke.some(p => p.sprite.visible), 'Muzzle smoke never dissipates');
  });

  await test('one casing per round, rightward ejection, gravity, bounce and cleanup', () => {
    reset(); g.shoot(); const d = g.combat.debug, s = d.shells.find(s => s.life > 0);
    assert(d.shellMesh.count === 1 && s.v.x > 1.9, 'Casing not ejected right');
    const y = s.p.y; step(.1); assert(s.p.y > y, 'Casing has no initial upward arc');
    step(1); assert(s.bounced && s.p.y >= .019, 'Casing failed to bounce above floor');
    step(2); assert(d.shellMesh.count === 0, 'Casing never recycled');
  });

  await test('wall stops damage and tracers, leaves dust and a bullet mark', () => {
    reset(); g.reset(); g.state.help = false; document.querySelector('#help').hidden = true; g.ally.hp = 0;
    const enemy = g.spawnEnemy('walker', {x: 0, z: 25}); const hp = enemy.hp;
    g.shoot(); const d = g.combat.debug;
    assert(enemy.hp === hp && !d.lastHit, 'Shot crossed closed gate');
    assert(d.lastShot.end.z > 26 && d.lastShot.end.z < 34, 'Tracer did not terminate at gate');
    assert(d.decals.some(p => p.mesh.visible) && d.smoke.length > 0, 'Missing impact feedback');
    assert(visibleNumbers().length === 0, 'Wall produced damage numbers');
  });

  await test('live body hit gives 34 damage, white marker and a projected fading number', () => {
    reset(); const e = g.spawnEnemy('brute', {x: 0, z: 14}); shootAt(e, 1.3);
    assert(e.hp === 226 && g.combat.debug.lastHit.damage === 34, 'Body damage changed');
    assert(document.querySelector('#hitmarker').dataset.kind === 'body', 'Body marker not distinct');
    const n = visibleNumbers()[0]; assert(n && n.node.textContent === '34', 'Body damage label missing');
    const top = parseFloat(n.node.style.top); step(.15);
    assert(parseFloat(n.node.style.top) < top, 'Number does not rise');
    g.player.yaw = Math.PI; g.updateCamera(0); assert(n.node.hidden, 'Number appears behind camera');
    step(1); assert(visibleNumbers().length === 0, 'Damage label never expires');
    return {damage: 34};
  });

  await test('headshots and kills show distinct markers, 70! damage, score and authored death effects', () => {
    reset(); const walker = g.spawnEnemy('walker', {x: 0, z: 14}); shootAt(walker, 1.81);
    assert(walker.hp === 6 && document.querySelector('#hitmarker').dataset.kind === 'head', 'Nonlethal headshot marker/damage wrong');
    reset(); const runner = g.spawnEnemy('runner', {x: 0, z: 14}); shootAt(runner, 1.81 * .87);
    assert(runner.hp <= 0 && g.state.kills === 1 && g.state.score === 140, 'Headshot did not kill/score');
    assert(document.querySelector('#hitmarker').dataset.kind === 'kill' && visibleNumbers()[0]?.node.textContent === '70!', 'Lethal hit feedback missing');
    assert(document.querySelector('#kill-confirm').textContent.includes('爆头击杀') && document.querySelector('#kill-confirm').textContent.includes('140'), 'Kill confirmation missing');
    assert(g.corpses.includes(runner) && runner.activeAction === 'dead' && runner.deathFlash > 0, 'Death animation/flash missing');
    assert(g.combat.debug.smoke.filter(p => p.life > 0).length >= 3, 'Death mist/ground dust missing');
    const before = g.combat.debug.numbers.filter(n => n.life > 0).length; g.hurtEnemy(runner, 70, new T.Vector3(0, 1, 14));
    assert(g.state.kills === 1 && g.combat.debug.numbers.filter(n => n.life > 0).length === before, 'Corpse gives duplicate kill feedback');
  });

  await test('ally kills stay out of personal marker, numbers and kill count', () => {
    reset(); const e = g.spawnEnemy('runner', {x: 0, z: 14}); g.hurtEnemy(e, 80, new T.Vector3(0, 1.5, 14), true);
    assert(g.state.kills === 0 && g.ally.kills === 1 && visibleNumbers().length === 0, 'Ally hit looks like a personal kill');
    assert(Number(document.querySelector('#hitmarker').style.opacity) === 0, 'Ally triggered personal marker');
  });

  await test('all enemies immediately collapse from every live pose at 30/60/120 fps', () => {
    let cases = 0, latestLanding = 0, smallestFirstFrameDrop = Infinity;
    const play = g.combat.audio.play;
    try {
      reset();
      for (const type of Object.keys(g.types)) for (const pose of ['paused', 'walk', 'attack', 'crouch'])
        for (const kill of ['body', 'head', 'ally']) for (const fps of [30, 60, 120]) {
          g.updateEffects(20); // Recycle the previous corpse and blood between cases.
          const e = g.spawnEnemy(type, {x: 0, z: 14});
          e.animate(0, pose === 'walk', pose === 'attack');
          if (pose === 'crouch') { e.upper.position.y = -.4; e.upper.rotation.x = -.12; }
          e.animate(.2, pose === 'walk', pose === 'attack');
          const headY = () => e.head.getWorldPosition(new T.Vector3()).y - e.y;
          const label = [type, pose, kill, fps].join('/');
          let impacts = 0, contactHeight = null;
          g.combat.audio.play = (kind, ...args) => {
            if (kind === 'bodyFall') { impacts++; contactHeight = headY(); }
            return play(kind, ...args);
          };
          g.hurtEnemy(e, 9999, new T.Vector3(0, 1, 14), kill === 'ally', kill === 'head', new T.Vector3(1, 0, 0));
          assert(!g.enemies.includes(e) && g.corpses.includes(e), label + ': still alive after lethal hit');
          assert(!e.landed && impacts === 0, label + ': impact happened before falling');
          const initial = headY(); step(1 / fps, fps);
          const drop = initial - headY(); smallestFirstFrameDrop = Math.min(smallestFirstFrameDrop, drop);
          assert(drop > .001, label + ': no downward motion in first frame (' + drop + ')');
          let landingTime = null;
          for (let frame = 2; frame <= Math.round(.6 * fps); frame++) {
            step(1 / fps, fps);
            if (e.landed && landingTime === null) landingTime = frame / fps;
          }
          assert(landingTime !== null && landingTime <= .21, label + ': delayed landing ' + landingTime);
          assert(headY() < .35 * e.g.scale.y, label + ': body is still upright');
          assert(impacts === 1 && contactHeight < .35 * e.g.scale.y, label + ': landing sound is out of sync');
          assert(g.bloodPools.filter(p => p.life > 0).length === 1, label + ': missing/duplicate landing blood');
          latestLanding = Math.max(latestLanding, landingTime); cases++;
        }
    } finally { g.combat.audio.play = play; }
    return {cases, latestLanding, smallestFirstFrameDrop};
  });

  await test('recycled corpses stand up and can immediately fall again', () => {
    for (const type of Object.keys(g.types)) {
      reset(); const e = g.spawnEnemy(type, {x: 0, z: 14});
      g.hurtEnemy(e, 9999, new T.Vector3(0, 1, 14)); step(8.1);
      assert(!g.corpses.includes(e) && !e.g.visible, type + ': corpse not recycled');
      const reused = g.spawnEnemy(type, {x: 0, z: 14});
      assert(reused === e && reused.head.getWorldPosition(new T.Vector3()).y > 1.3 * e.g.scale.y, type + ': reuse kept fallen pose');
      assert(e.meshes.every(m => m.material.opacity === 1), type + ': reuse kept faded materials');
      g.hurtEnemy(e, 9999, new T.Vector3(0, 1, 14)); step(.2);
      assert(e.landed && e.head.getWorldPosition(new T.Vector3()).y < .35 * e.g.scale.y, type + ': reused death was delayed');
    }
    return {types: Object.keys(g.types)};
  });

  await test('reload, empty magazine, sprint and pause cannot spawn a shot', () => {
    reset(); g.player.ammo = 4; g.reload(); g.shoot(); assert(g.combat.recoil.shots === 0 && g.player.ammo === 4, 'Reload fired');
    step(2); assert(g.player.ammo === 30 && g.player.reserve === 154, 'Reload ammo conservation regressed');
    g.player.ammo = 0; g.player.reserve = 0; g.shoot(); assert(g.combat.recoil.shots === 0, 'Empty gun ejected shell');
    reset(); g.player.sprinting = true; g.shoot(); assert(g.combat.recoil.shots === 0, 'Sprint fired');
    reset(); g.pause(); g.shoot(); assert(g.combat.recoil.shots === 0 && !g.flash.visible, 'Pause fired');
  });

  await test('actual right/left mouse events aim and fire; release stops the burst', () => {
    reset(); g.setLocked(true);
    document.dispatchEvent(new MouseEvent('mousedown', {button: 2}));
    step(.4); assert(g.combat.recoil.ads > .99, 'Right mouse failed to aim');
    document.dispatchEvent(new MouseEvent('mousedown', {button: 0})); step(.3);
    document.dispatchEvent(new MouseEvent('mouseup', {button: 0}));
    const shots = g.combat.recoil.shots; step(.3); assert(shots >= 3 && g.combat.recoil.shots === shots, 'Trigger release did not stop firing');
    document.dispatchEvent(new MouseEvent('mouseup', {button: 2})); step(.4); g.setLocked(false);
    assert(g.combat.recoil.ads < .01, 'Right mouse release failed to lower gun');
  });

  await test('effect pools remain bounded through continuous fire and restart clears all feedback', () => {
    reset(); const geometryCount = g.renderer.info.memory.geometries;
    g.setFiring(true);
    for (let i = 0; i < 60 * 8; i++) { g.player.ammo = 30; g.simulate(1 / 60); }
    g.setFiring(false); const d = g.combat.debug;
    assert(d.shellMesh.count <= 40 && d.smoke.filter(p => p.life > 0).length <= 32 && d.tracers.filter(t => t.life > 0).length <= 12, 'GPU effect pool grew');
    assert(document.querySelectorAll('.damage-number').length === 24, 'DOM labels allocated without bound');
    reset();
    assert(g.combat.recoil.shots === 0 && d.shellMesh.count === 0 && d.smoke.every(p => !p.sprite.visible) && d.tracers.every(p => !p.root.visible) && d.decals.every(p => !p.mesh.visible), 'Restart retained VFX');
    assert(visibleNumbers().length === 0 && !g.flash.visible && !d.glow.visible, 'Restart retained UI/flash');
    return {shellCap: 40, smokeCap: 32, tracerCap: 12, labels: 24, geometryCountBefore: geometryCount};
  });

  const {createCombatAudio} = await import('./combat-audio.js');
  const audioMetrics = [];
  await test('all four audio layers render non-silent PCM, with a low kick and a longer tail', async () => {
    for (const layer of ['blast', 'mechanic', 'kick', 'tail']) {
      const ctx = new OfflineAudioContext(2, 24000, 48000), audio = createCombatAudio({context: ctx});
      audio.play('shot', {layers: [layer]});
      assert(audio.status.lastLayers.includes(layer) && !audio.status.lastError, 'Audio scheduler failed for ' + layer);
      const buffer = await ctx.startRendering(), data = buffer.getChannelData(0);
      let energy = 0, peak = 0, late = 0, diff = 0;
      for (let i = 0; i < data.length; i++) { energy += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i])); if (i > 5760) late += data[i] ** 2; if (i) diff += (data[i] - data[i - 1]) ** 2; }
      const rms = Math.sqrt(energy / data.length);
      assert(rms > .0001 && peak < .98, layer + ' is silent or clipping');
      audioMetrics.push({layer, rms, peak, lateRatio: late / energy, brightness: diff / energy});
    }
    const metric = name => audioMetrics.find(m => m.layer === name);
    assert(metric('tail').lateRatio > .015 && metric('kick').brightness < metric('mechanic').brightness * .1, 'Layer timing/frequency roles collapsed');
    return audioMetrics;
  });

  await test('mute is immediate and audio voice count is bounded', () => {
    const ctx = new OfflineAudioContext(2, 24000, 48000), audio = createCombatAudio({context: ctx});
    for (let i = 0; i < 20; i++) audio.play('shot');
    assert(audio.status.voices <= audio.status.maxVoices && !audio.status.lastError, 'Audio node budget exceeded');
    audio.mute(); assert(audio.status.voices === 0, 'Mute left scheduled voices');
    const silent = createCombatAudio({isEnabled: () => false}); silent.play('shot');
    assert(silent.status.context === 'uninitialized', 'Muted game opened an audio device');
  });

  // Save a listenable example using the same mixer as live gameplay: one shot, then a burst.
  const ctx = new OfflineAudioContext(2, 48000 * 3, 48000), preview = createCombatAudio({context: ctx});
  preview.play('shot', {at: .1});
  for (let i = 0; i < 4; i++) preview.play('shot', {at: 1.2 + i * .105, first: i === 0});
  const buffer = await ctx.startRendering(), pcm = new Int16Array(buffer.length * 2);
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < 2; c++) pcm[i * 2 + c] = Math.round(Math.max(-1, Math.min(1, buffer.getChannelData(c)[i])) * 32767);
  const bytes = new Uint8Array(pcm.buffer); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  reset(); g.state.help = true; document.querySelector('#help').hidden = false; g.updateUI();
  return {passed: results.filter(r => r.pass).length, total: results.length, results, previewPCM: btoa(binary)};
};

const raw = execFileSync('agent-browser', ['--session', process.argv[2] || 'afterlight-combat', 'eval', '-b', Buffer.from(`(${suite})()`).toString('base64')], {encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024});
const result = JSON.parse(raw), pcm = Buffer.from(result.previewPCM, 'base64'); delete result.previewPCM;
const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24);
header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
fs.mkdirSync('logs', {recursive: true}); fs.writeFileSync('logs/rifle-preview.wav', Buffer.concat([header, pcm]));
fs.writeFileSync('logs/combat-verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2)); if (result.passed !== result.total) process.exitCode = 1;
