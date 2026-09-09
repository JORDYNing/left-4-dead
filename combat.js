import * as T from 'three';
import {createCombatAudio} from './combat-audio.js';

const mix = T.MathUtils.lerp, clamp = T.MathUtils.clamp;
const random = (a, b) => a + Math.random() * (b - a);
const vec = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

// Exact underdamped spring integration keeps recoil consistent at 30/60/120 fps.
class Spring {
  constructor(frequency, damping) { this.frequency = frequency; this.damping = damping; this.reset(); }
  reset() { this.p = 0; this.v = 0; }
  step(dt) {
    const w = this.frequency, d = w * this.damping, wd = Math.sqrt(w * w - d * d);
    const decay = Math.exp(-d * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    const p = this.p, v = this.v;
    this.p = decay * (p * c + (v + d * p) / wd * s);
    this.v = decay * (v * c - (d * v + w * w * p) / wd * s);
  }
}

function particleTexture(kind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'), gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (kind === 'flash') {
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.18, '#fff3bd');
    gradient.addColorStop(.42, '#ffb64ba0'); gradient.addColorStop(1, '#ff981000');
  } else if (kind === 'decal') {
    gradient.addColorStop(0, '#080706ee'); gradient.addColorStop(.2, '#12110ce0');
    gradient.addColorStop(.4, '#29241c88'); gradient.addColorStop(1, '#17120d00');
  } else {
    gradient.addColorStop(0, '#ffffffb0'); gradient.addColorStop(.35, '#ffffff80');
    gradient.addColorStop(1, '#ffffff00');
  }
  c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
  if (kind === 'flash') {
    c.fillStyle = '#fff3b8aa';
    for (let i = 0; i < 6; i++) {
      c.save(); c.translate(32, 32); c.rotate(i * Math.PI / 3);
      c.beginPath(); c.moveTo(-4, 1); c.lineTo(0, -31); c.lineTo(4, 1); c.fill(); c.restore();
    }
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}

export function createCombatFeedback({scene, camera, weaponScene, weaponCamera, gun, muzzle, ejector, bolt, flash,
  floorAt, marker, numbersLayer, killLabel, crosshair, soundEnabled}) {
  const audio = createCombatAudio({isEnabled: soundEnabled});
  const recoil = {
    ads: 0, heat: 0, climb: 0, sinceShot: 10, burst: 0, shots: 0, flashTime: 0, shakeTime: 0,
    gunZ: new Spring(31, .7), gunPitch: new Spring(35, .62), gunYaw: new Spring(29, .73),
    gunRoll: new Spring(32, .65), cameraPitch: new Spring(29, .78), cameraYaw: new Spring(25, .8),
  };
  const springs = Object.values(recoil).filter(v => v instanceof Spring);
  const light = new T.PointLight('#ffc477', 0, 7, 2); scene.add(light);
  const weaponLight = new T.PointLight('#ffcf91', 0, 3, 2); weaponScene.add(weaponLight);
  const glow = new T.Sprite(new T.SpriteMaterial({map: particleTexture('flash'), color: '#ffdc9b',
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false}));
  muzzle.add(glow); glow.position.z = -.055; glow.visible = false;
  Object.assign(flash.material, {blending: T.AdditiveBlending, depthWrite: false, toneMapped: false});

  // GPU allocations are fixed. Effect slots and DOM labels are recycled for endless waves.
  const shellMesh = new T.InstancedMesh(new T.CylinderGeometry(.009, .009, .05, 7),
    new T.MeshStandardMaterial({color: '#d7ac58', roughness: .28, metalness: .72}), 40);
  shellMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); shellMesh.frustumCulled = false; shellMesh.count = 0;
  scene.add(shellMesh);
  const shells = Array.from({length: 40}, () => ({life: 0, p: vec(), v: vec(), rotation: vec(), spin: vec(), bounced: false}));
  const smokeMap = particleTexture('smoke');
  const smoke = Array.from({length: 32}, () => {
    const sprite = new T.Sprite(new T.SpriteMaterial({map: smokeMap, transparent: true, opacity: 0, depthWrite: false}));
    sprite.visible = false; scene.add(sprite); return {sprite, life: 0, total: 0, v: vec(), size: 0, alpha: 0};
  });
  const tracerGeometry = new T.CylinderGeometry(1, 1, 1, 5);
  const tracers = Array.from({length: 12}, () => {
    const root = new T.Group();
    const glow = new T.Mesh(tracerGeometry, new T.MeshBasicMaterial({color: '#ffc46c', transparent: true,
      opacity: .42, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false}));
    const core = new T.Mesh(tracerGeometry, new T.MeshBasicMaterial({color: '#fff1c9', transparent: true,
      opacity: .94, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false}));
    glow.scale.set(.012, 1, .012); core.scale.set(.0035, 1, .0035); root.add(glow, core);
    root.visible = false; scene.add(root); return {root, life: 0, age: 0, start: vec(), end: vec()};
  });
  const decalMap = particleTexture('decal'), decalGeometry = new T.PlaneGeometry(1, 1);
  const decals = Array.from({length: 32}, () => {
    const mesh = new T.Mesh(decalGeometry, new T.MeshBasicMaterial({map: decalMap, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false}));
    mesh.visible = false; scene.add(mesh); return {mesh, life: 0};
  });
  const numbers = Array.from({length: 24}, () => {
    const node = document.createElement('span'); node.className = 'damage-number'; node.hidden = true;
    numbersLayer.appendChild(node); return {node, life: 0, total: 0, point: vec(), drift: 0};
  });
  const dummy = new T.Object3D(), yAxis = vec(0, 1, 0), zAxis = vec(0, 0, 1);
  const scratch = vec(), direction = vec(), projection = vec();
  let shellCursor = 0, smokeCursor = 0, tracerCursor = 0, decalCursor = 0, numberCursor = 0;
  let markerLife = 0, markerTotal = 0, killLife = 0, lastShot = null, lastHit = null;

  // The viewmodel uses a separate FOV. Convert its projected sockets into the world
  // camera so flash, tracer and casing agree on screen in both hip fire and ADS.
  function socketWorld(socket) {
    gun.updateMatrixWorld(true); camera.updateMatrixWorld(true); weaponCamera.updateMatrixWorld(true);
    const local = socket.getWorldPosition(vec()), depth = Math.max(.15, -local.z);
    const ndc = local.clone().project(weaponCamera), h = Math.tan(T.MathUtils.degToRad(camera.fov * .5)) * depth;
    return vec(ndc.x * h * camera.aspect, ndc.y * h, -depth).applyMatrix4(camera.matrixWorld);
  }

  function puff(point, velocity, color, size, life, alpha) {
    const p = smoke[smokeCursor++ % smoke.length];
    p.sprite.position.copy(point); p.sprite.material.color.set(color); p.sprite.material.rotation = random(0, Math.PI * 2);
    Object.assign(p, {size, life, total: life, alpha}); p.v.copy(velocity);
    p.sprite.scale.setScalar(size); p.sprite.material.opacity = alpha; p.sprite.visible = true;
  }

  function shotDirection(forward, moving = false) {
    const first = recoil.sinceShot > .24;
    const spread = (first ? 0 : mix(.003 + recoil.heat * .011, .0008 + recoil.heat * .002, recoil.ads))
      + (moving ? mix(.008, .0025, recoil.ads) : 0);
    const angle = random(0, Math.PI * 2), radius = Math.sqrt(Math.random()) * spread;
    const right = vec(1, 0, 0).applyQuaternion(camera.quaternion), up = vec(0, 1, 0).applyQuaternion(camera.quaternion);
    return {direction: forward.clone().addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius).normalize(), first, spread, ads: recoil.ads};
  }

  function fire({end, origin, direction, start, first, spread, ads}) {
    const side = (recoil.burst % 4 < 2 ? 1 : -1) * random(.6, 1);
    recoil.burst = first ? 1 : recoil.burst + 1;
    recoil.shots++; recoil.sinceShot = 0; recoil.heat = Math.min(1, recoil.heat + .16);
    recoil.climb = Math.min(mix(.115, .067, ads), recoil.climb + mix(.014, .0065, ads) * (first ? 1 : 1.13));
    recoil.gunZ.p = Math.min(.14, recoil.gunZ.p + mix(first ? .058 : .024, first ? .026 : .012, ads));
    recoil.gunZ.v += mix(first ? .95 : .7, .4, ads);
    recoil.gunPitch.p = Math.min(.11, recoil.gunPitch.p + mix(.032, .013, ads));
    recoil.gunPitch.v += mix(.68, .28, ads);
    recoil.gunYaw.v += side * mix(.19, .055, ads);
    recoil.gunRoll.v += side * mix(.34, .09, ads);
    recoil.cameraPitch.v += mix(.32, .16, ads);
    recoil.cameraYaw.v += side * mix(.055, .021, ads);
    recoil.flashTime = .043; recoil.shakeTime = .095;
    glow.material.rotation = random(0, Math.PI * 2); glow.scale.setScalar(random(.19, .29));
    flash.scale.set(random(.65, 1.05), random(.7, 1.25), random(.65, 1.05));
    const tracer = tracers[tracerCursor++ % tracers.length];
    tracer.start.copy(start); tracer.end.copy(end); tracer.age = 0;
    tracer.life = .035 + start.distanceTo(end) / 550; tracer.root.visible = true;
    const shell = shells[shellCursor++ % shells.length];
    shell.life = 2.8; shell.bounced = false; shell.p.copy(socketWorld(ejector));
    shell.v.set(random(2, 3.2), random(1.1, 2), random(.3, 1)).applyQuaternion(camera.quaternion);
    shell.rotation.set(random(0, 6), random(0, 6), random(0, 6)); shell.spin.set(random(8, 18), random(7, 16), random(8, 20));
    puff(start, direction.clone().multiplyScalar(.6).add(vec(0, .25, 0)), '#b8b3a7', .13, .46, .24);
    audio.play('shot', {first, ads: ads > .5});
    lastShot = {origin: origin.clone(), direction: direction.clone(), end: end.clone(), start: start.clone(), first, ads, spread, burst: recoil.burst};
    updateParticles(0);
  }

  function hit({point, damage, headshot = false, lethal = false, points = 0, byAlly = false, direction = vec(0, 0, -1)}) {
    puff(point, direction.clone().multiplyScalar(lethal ? 1.1 : .45).add(vec(0, .18, 0)), '#9c3e2d', lethal ? .4 : .2, lethal ? .5 : .22, lethal ? .5 : .35);
    if (lethal) {
      // The authored fall animation remains visible through a brief impact mist and ground dust.
      puff(vec(point.x, floorAt(point.x, point.z) + .16, point.z), vec(0, .15, 0), '#afa08b', .55, .7, .24);
    }
    if (byAlly) return;
    markerTotal = markerLife = lethal ? .3 : headshot ? .22 : .16;
    marker.dataset.kind = lethal ? 'kill' : headshot ? 'head' : 'body';
    marker.style.opacity = 1;
    const n = numbers[numberCursor++ % numbers.length];
    n.life = n.total = lethal ? .95 : .75; n.point.copy(point); n.drift = numberCursor % 2 ? 1 : -1;
    n.node.textContent = Math.round(damage) + (headshot ? '!' : '');
    n.node.className = 'damage-number' + (headshot ? ' headshot' : '') + (lethal ? ' lethal' : ''); n.node.hidden = false;
    if (lethal) { killLife = .95; killLabel.textContent = `${headshot ? '爆头击杀' : '击杀'}  +${points}`; }
    audio.play(lethal ? 'kill' : headshot ? 'headshot' : 'hit', {headshot});
    lastHit = {damage, headshot, lethal, points};
    renderHUD();
  }

  function targetHit() {
    markerTotal = markerLife = .16; marker.dataset.kind = 'body'; marker.style.opacity = 1; audio.play('hit');
  }

  function impact(hit) {
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : vec(0, 1, 0);
    puff(hit.point, normal.clone().multiplyScalar(.5).add(vec(0, .2, 0)), '#b5ab92', .18, .4, .42);
    const decal = decals[decalCursor++ % decals.length];
    decal.life = 12; decal.mesh.position.copy(hit.point).addScaledVector(normal, .008);
    decal.mesh.quaternion.setFromUnitVectors(zAxis, normal); decal.mesh.rotateZ(random(0, Math.PI * 2));
    decal.mesh.scale.setScalar(random(.08, .14)); decal.mesh.material.opacity = 1; decal.mesh.visible = true;
    decal.object = hit.object;
  }

  function tick(dt, aiming) {
    recoil.ads = T.MathUtils.damp(recoil.ads, aiming ? 1 : 0, 14, dt);
    recoil.sinceShot += dt; recoil.heat = Math.max(0, recoil.heat - dt * .75);
    if (recoil.sinceShot > .12) recoil.climb *= Math.exp(-10 * dt);
    if (recoil.sinceShot > .24) recoil.burst = 0;
    springs.forEach(s => s.step(dt));
    recoil.flashTime = Math.max(0, recoil.flashTime - dt); recoil.shakeTime = Math.max(0, recoil.shakeTime - dt);
    markerLife = Math.max(0, markerLife - dt); killLife = Math.max(0, killLife - dt);
    numbers.forEach(n => { n.life = Math.max(0, n.life - dt); });
    updateParticles(dt);
  }

  function updateParticles(dt) {
    let count = 0;
    for (const s of shells) {
      if (s.life <= 0) continue;
      s.life -= dt; if (s.life <= 0) continue;
      s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); s.rotation.addScaledVector(s.spin, dt);
      const ground = floorAt(s.p.x, s.p.z) + .02;
      if (s.p.y < ground) {
        s.p.y = ground;
        if (!s.bounced) { s.v.y = Math.abs(s.v.y) * .28; s.v.x *= .5; s.v.z *= .5; s.spin.multiplyScalar(.4); s.bounced = true; audio.play('casing'); }
        else { s.v.set(0, 0, 0); s.spin.set(0, 0, 0); s.rotation.z = Math.PI * .5; }
      }
      dummy.position.copy(s.p); dummy.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
      dummy.scale.setScalar(Math.min(1, s.life / .25)); dummy.updateMatrix(); shellMesh.setMatrixAt(count++, dummy.matrix);
    }
    shellMesh.count = count; shellMesh.instanceMatrix.needsUpdate = true;
    for (const p of smoke) {
      p.life = Math.max(0, p.life - dt); p.sprite.visible = p.life > 0;
      if (!p.life) continue;
      p.sprite.position.addScaledVector(p.v, dt); p.sprite.scale.setScalar(p.size * (1 + (1 - p.life / p.total) * 2.5));
      p.sprite.material.opacity = p.alpha * (p.life / p.total); p.sprite.material.rotation += dt * .3;
    }
    for (const t of tracers) {
      t.life = Math.max(0, t.life - dt); t.root.visible = t.life > 0; if (!t.life) continue;
      t.age += dt; direction.copy(t.end).sub(t.start); const length = direction.length(); direction.normalize();
      const head = Math.min(length, 2 + t.age * 550), tail = Math.max(0, (t.age - .025) * 550 - 5);
      if (tail >= length || length < .015) { t.root.visible = false; continue; }
      t.root.position.copy(t.start).addScaledVector(direction, (head + tail) * .5);
      t.root.quaternion.setFromUnitVectors(yAxis, direction); t.root.scale.set(1, Math.max(.01, head - tail), 1);
    }
    for (const d of decals) {
      d.life = Math.max(0, d.life - dt);
      // A broken barricade must take its impact marks with it.
      if (d.object?.userData.barrier?.hp <= 0) d.life = 0;
      d.mesh.visible = d.life > 0; d.mesh.material.opacity = Math.min(1, d.life / 2);
    }
  }

  function view(time) {
    const shake = recoil.shakeTime / .095 * mix(1, .45, recoil.ads);
    return {
      pitch: recoil.climb + recoil.cameraPitch.p + Math.sin(time * 167) * .0016 * shake,
      yaw: recoil.cameraYaw.p + Math.sin(time * 139) * .0009 * shake,
      roll: Math.sin(time * 153) * .0025 * shake,
      x: Math.sin(time * 131) * .0018 * shake, y: Math.cos(time * 173) * .0015 * shake,
    };
  }

  function pose({time, moving, sprinting, reload}) {
    const ads = recoil.ads, reloadDip = reload > 0 ? Math.sin((1 - reload / 1.85) * Math.PI) : 0;
    const sway = moving ? 1 - ads * .85 : 0;
    gun.position.set(-.1968 * ads + Math.sin(time * 10) * sway * .009,
      .021 * ads - reloadDip * .25 - (sprinting ? .12 : 0), -.25 + .12 * ads + recoil.gunZ.p);
    gun.rotation.set(-reloadDip * .45 + recoil.gunPitch.p, recoil.gunYaw.p,
      -reloadDip * .45 + recoil.gunRoll.p + Math.cos(time * 5) * sway * .015);
    bolt.position.z = -.51 + (recoil.sinceShot < .085 ? Math.sin(recoil.sinceShot / .085 * Math.PI) * .065 : 0);
    flash.visible = glow.visible = recoil.flashTime > 0;
    const strength = recoil.flashTime / .043;
    glow.material.opacity = strength * .85; flash.material.opacity = strength * .9;
    flash.rotation.y = time * 57; light.intensity = strength * 5; weaponLight.intensity = strength * 1.7;
    light.position.copy(socketWorld(muzzle)); weaponLight.position.copy(muzzle.getWorldPosition(scratch));
    crosshair.style.setProperty('--gap', `${mix(28, 16, ads) + recoil.heat * mix(26, 12, ads) + (moving ? 8 : 0)}px`);
    crosshair.style.opacity = reload > 0 || sprinting ? .2 : mix(.9, .32, ads);
  }

  function renderHUD() {
    camera.updateMatrixWorld(true);
    marker.style.opacity = Math.min(1, markerLife / .055);
    marker.style.transform = `translate(-50%, -50%) scale(${1 + (markerLife / (markerTotal || 1)) * .22})`;
    killLabel.style.opacity = Math.min(1, killLife / .2);
    for (const n of numbers) {
      n.node.hidden = !n.life; if (!n.life) continue;
      const age = n.total - n.life;
      projection.copy(n.point); projection.y += .12 + age * .65;
      projection.project(camera);
      const onscreen = projection.z > -1 && projection.z < 1 && Math.abs(projection.x) < 1.1 && Math.abs(projection.y) < 1.1;
      n.node.hidden = !onscreen; if (!onscreen) continue;
      const x = (projection.x * .5 + .5) * innerWidth + n.drift * (22 + age * 19);
      const y = (-projection.y * .5 + .5) * innerHeight;
      n.node.style.left = `${x}px`; n.node.style.top = `${y}px`;
      n.node.style.opacity = Math.min(1, n.life / .22);
      n.node.style.transform = `translate(-50%, -50%) scale(${1 + Math.max(0, 1 - age / .12) * .25})`;
    }
  }

  function suspend() { audio.stop(); recoil.flashTime = recoil.shakeTime = 0; flash.visible = glow.visible = false; light.intensity = weaponLight.intensity = 0; }
  function reset() {
    suspend(); springs.forEach(s => s.reset());
    Object.assign(recoil, {ads: 0, heat: 0, climb: 0, sinceShot: 10, burst: 0, shots: 0});
    shells.forEach(s => { s.life = 0; }); shellMesh.count = 0;
    smoke.forEach(s => { s.life = 0; s.sprite.visible = false; });
    tracers.forEach(t => { t.life = 0; t.root.visible = false; }); decals.forEach(d => { d.life = 0; d.mesh.visible = false; });
    numbers.forEach(n => { n.life = 0; n.node.hidden = true; });
    markerLife = killLife = 0; lastShot = lastHit = null; marker.style.opacity = killLabel.style.opacity = 0;
    bolt.position.z = -.51;
  }
  return {audio, recoil, fire, hit, impact, targetHit, tick, pose, view, shotDirection, socketWorld, renderHUD, suspend, reset,
    get debug() { return {lastShot, lastHit, shells, shellMesh, smoke, tracers, decals, numbers, light, weaponLight, glow}; },
  };
}
