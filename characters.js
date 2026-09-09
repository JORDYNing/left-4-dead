import * as T from 'three';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { clone } from './vendor/three/addons/utils/SkeletonUtils.js';

// Authored meshes, textures and skeletons; see ASSETS.md for authors and licenses.
export async function loadCharacterFactory(onProgress = () => {}) {
  const manager = new T.LoadingManager();
  manager.onProgress = (_url, done, total) => onProgress(done, total);
  const loader = new GLTFLoader(manager);
  const [infected, survivor] = await Promise.all([
    loader.loadAsync(new URL('./assets/characters/infected.glb', import.meta.url).href),
    loader.loadAsync(new URL('./assets/characters/survivor.glb', import.meta.url).href),
  ]);
  // Biped root motion is handled by the game's collision solver. Keep only vertical bob.
  for (const clip of infected.animations) {
    for (const track of clip.tracks) if (track.name === 'Bip01.position') {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = .4158759713;
        track.values[i + 2] = -.230812788;
      }
    }
  }
  const X = new T.Vector3(1, 0, 0), forward = new T.Vector3(0, 0, -1);
  return function actor(_color, kind = 'walker') {
    const friendly = kind === 'ally', source = friendly ? survivor : infected;
    const g = new T.Group(), upper = new T.Group(), oriented = new T.Group();
    g.name = friendly ? 'LIN — thehumbug survivor' : 'PixelHouse infected';
    g.add(upper); upper.add(oriented);
    const model = clone(source.scene); oriented.add(model);
    oriented.rotation.y = friendly ? Math.PI : -Math.PI / 2;
    if (!friendly) {
      oriented.scale.setScalar(3.35);
      model.position.set(-.4158759713, .00612, .230812788);
    } else oriented.scale.setScalar(1.06);
    const mixer = new T.AnimationMixer(model), actions = {};
    source.animations.forEach(clip => actions[clip.name] = mixer.clipAction(clip));
    const meshes = [], materials = new Map();
    model.traverse(o => {
      if (!o.isMesh) return;
      meshes.push(o); o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false;
      const original = o.material;
      if (!materials.has(original)) materials.set(original, original.clone());
      o.material = materials.get(original);
      if (o.material.map) o.material.map.anisotropy = 4;
      if (o.material.normalMap) o.material.normalScale.setScalar(.45);
    });
    const bodyMat = meshes.find(m => m.isSkinnedMesh).material;
    const head = model.getObjectByName(friendly ? 'head' : 'Bip01_Head');
    const rig = {g, upper, model, bodyMat, head, meshes, mixer, actions, kind, shot: 0, aim: 0, lastTime: null, activeAction: null, rifle: null, muzzle: null, flash: null};
    function action(name, fade = .16) {
      if (rig.activeAction === name) return;
      const next = actions[name];
      if (!next) return;
      const previous = actions[rig.activeAction];
      next.reset().setEffectiveTimeScale(kind === 'runner' ? 1.65 : kind === 'brute' ? .8 : 1).setEffectiveWeight(1).play();
      if (previous) { next.fadeIn(fade); previous.fadeOut(fade); }
      rig.activeAction = name;
    }
    action(friendly ? 'aim' : 'walk', 0); mixer.update(0);
    g.updateMatrixWorld(true);
    // Conservative animation bounds prevent stale bind-pose bounds from missing ray hits.
    model.traverse(m => {
      if (!m.isSkinnedMesh) return;
      m.skeleton.update(); m.computeBoundingBox();
      m.boundingBox.expandByScalar(friendly ? 1 : .5);
      m.boundingSphere = m.boundingBox.getBoundingSphere(new T.Sphere());
    });
    if (friendly) {
      const spine = model.getObjectByName('spine'), hand = model.getObjectByName('handR');
      const rifle = model.getObjectByName('Cube');
      hand.attach(rifle); // Old source attached it to an IK control; follow the actual hand.
      const muzzle = new T.Object3D(); muzzle.name = 'shotgun muzzle';
      muzzle.position.set(0, .06324, -.501); rifle.add(muzzle);
      const flash = new T.Mesh(new T.ConeGeometry(.075, .25, 6), new T.MeshBasicMaterial({color: 0xffd398, transparent: true, opacity: .9, depthWrite: false}));
      flash.rotation.x = -Math.PI / 2; flash.position.z = -.1; flash.visible = false;
      muzzle.add(flash); Object.assign(rig, {rifle, muzzle, flash, spine});
      const bones = ['thighL', 'thighR', 'shinL', 'shinR'].map(name => model.getObjectByName(name));
      const bases = bones.map(b => b.quaternion.clone()), spineBase = spine.quaternion.clone();
      const q = new T.Quaternion(), parentQ = new T.Quaternion(), localAxis = new T.Vector3();
      rig.animate = (time, moving) => {
        spine.quaternion.copy(spineBase);
        const phase = time * 9, stride = moving ? .48 : 0;
        bones.forEach((b, i) => {
          b.quaternion.copy(bases[i]);
          b.parent.getWorldQuaternion(parentQ).invert();
          localAxis.copy(X).applyQuaternion(g.quaternion).applyQuaternion(parentQ).normalize();
          const swing = i < 2 ? Math.sin(phase + i * Math.PI) * stride : Math.max(0, -Math.sin(phase + (i - 2) * Math.PI)) * stride * 1.2;
          b.quaternion.premultiply(q.setFromAxisAngle(localAxis, swing));
        });
        upper.position.z = rig.shot > 0 ? .035 : 0;
        upper.position.y = moving ? Math.sin(phase * 2) * .012 : Math.sin(time * 2) * .003;
        flash.visible = rig.shot > 0;
      };
      // Rotate the torso with both arms and the held gun. Two passes account for muzzle movement.
      rig.aimAt = target => {
        for (let i = 0; i < 3; i++) {
          g.updateMatrixWorld(true);
          const from = muzzle.getWorldPosition(new T.Vector3());
          const current = forward.clone().applyQuaternion(muzzle.getWorldQuaternion(new T.Quaternion())).normalize();
          const desired = target.clone().sub(from).normalize();
          const correction = new T.Quaternion().setFromUnitVectors(current, desired);
          const parent = spine.parent.getWorldQuaternion(new T.Quaternion());
          spine.quaternion.premultiply(parent.clone().invert().multiply(correction).multiply(parent));
        }
      };
    } else {
      rig.animate = (time, moving, attacking = false) => {
        const dt = rig.lastTime === null ? 0 : Math.max(0, Math.min(.1, time - rig.lastTime));
        rig.lastTime = time;
        action(attacking ? 'attack' : 'walk');
        actions[rig.activeAction].paused = !moving && !attacking;
        mixer.update(dt);
      };
    }
    rig.die = () => {
      action('dead', .06);
      actions.dead.setLoop(T.LoopOnce, 1); actions.dead.clampWhenFinished = true;
      actions.dead.paused = false; actions.dead.setEffectiveTimeScale(1);
      rig.bodyMat.emissive.setHex(0);
    };
    rig.resetPose = () => {
      mixer.stopAllAction(); rig.activeAction = null; rig.lastTime = null;
      rig.shot = 0; rig.aim = 0;
      bodyMat.color.set(friendly ? '#ffffff' : kind === 'runner' ? '#e1d9cc' : kind === 'brute' ? '#ccb8ae' : '#ffffff');
      bodyMat.emissive.setHex(0);
      action(friendly ? 'aim' : 'walk', 0); mixer.update(0);
      rig.animate(0, false);
    };
    rig.resetPose();
    return rig;
  };
}
