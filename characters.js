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
  // PixelHouse's 24 fps death take idles/staggers until frame 75; contact is
  // frame 84. Keep only the collapse and settling, at twice the source speed.
  const deathIndex = infected.animations.findIndex(clip => clip.name === 'dead');
  const deathClip = T.AnimationUtils.subclip(infected.animations[deathIndex], 'dead', 75, 101, 24);
  for (const track of deathClip.tracks) track.scale(.5);
  deathClip.resetDuration();
  infected.animations[deathIndex] = deathClip;
  const deathLandingTime = (84 - 75) / 24 / 2;
  const gearGeometry={box:new T.BoxGeometry(1,1,1),hood:new T.IcosahedronGeometry(1,1),claw:new T.ConeGeometry(1,1,5)};
  const kitCanvas=document.createElement('canvas');kitCanvas.width=kitCanvas.height=128;
  const kitContext=kitCanvas.getContext('2d');kitContext.fillStyle='#b5b0a3';kitContext.fillRect(0,0,128,128);
  let kitSeed=37;const kitRandom=()=>((kitSeed=(kitSeed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<1500;i++){kitContext.fillStyle=i%3?'#665f4d44':'#dbd4bd55';kitContext.fillRect(kitRandom()*128,kitRandom()*128,1+kitRandom()*3,1+kitRandom()*5);}
  for(let i=0;i<14;i++){kitContext.strokeStyle='#332c2266';kitContext.beginPath();const x=kitRandom()*128,y=kitRandom()*128;kitContext.moveTo(x,y);kitContext.lineTo(x+kitRandom()*22,y+kitRandom()*8);kitContext.stroke();}
  const kitTexture=new T.CanvasTexture(kitCanvas);kitTexture.colorSpace=T.SRGBColorSpace;
  const X = new T.Vector3(1, 0, 0), forward = new T.Vector3(0, 0, -1);
  return function actor(_color, kind = 'walker') {
    const friendly = kind === 'ally', source = friendly ? survivor : infected;
    const g = new T.Group(), upper = new T.Group(), oriented = new T.Group();
    g.name = friendly ? 'LIN — thehumbug survivor' : 'PixelHouse infected';
    g.add(upper); upper.add(oriented);
    const model = clone(source.scene); oriented.add(model);
    oriented.rotation.y = friendly ? Math.PI : -Math.PI / 2;
    if (!friendly) {
      const shape={walker:[1,1,1],runner:[.78,1.03,.8],brute:[1.18,1,1.12],guard:[1.08,1,1.03],stalker:[.86,1.02,.85]}[kind];
      oriented.scale.set(...shape.map(v=>v*3.35));
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
    const rig = {g, upper, model, bodyMat, head, meshes, mixer, actions, kind, deathLandingTime, shot: 0, aim: 0, lastTime: null, activeAction: null, rifle: null, muzzle: null, flash: null};
    function action(name, fade = .16) {
      if (rig.activeAction === name) return;
      const next = actions[name];
      if (!next) return;
      const previous = actions[rig.activeAction];
      next.reset().setEffectiveTimeScale(kind === 'runner' ? 1.65 : kind === 'brute' ? .8 : kind === 'stalker' ? 1.3 : 1).setEffectiveWeight(1).play();
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
    // Runtime model kits follow the imported skeleton, including death and attack clips.
    // These change silhouettes and geometry, rather than only swapping a texture tint.
    const gear=[];
    function part(name,bone,shape,position,size,color) {
      const material=new T.MeshStandardMaterial({color,map:kitTexture,roughness:.87,metalness:.15});
      const m=new T.Mesh(gearGeometry[shape],material);m.name=name;m.position.set(...position);m.scale.set(...size);
      m.castShadow=true;m.receiveShadow=true;g.add(m);g.updateMatrixWorld(true);
      (model.getObjectByName(bone)||head).attach(m);meshes.push(m);gear.push(m);
      return m;
    }
    if(!friendly) {
      if(kind==='runner') {
        part('torn orange running vest','Bip01_Spine2','box',[0,1.31,.015],[.37,.36,.22],'#a95730');
        for(const x of [-.14,.14])part('reflective vest stripe','Bip01_Spine2','box',[x,1.31,-.107],[.025,.31,.012],'#c1bfa1');
      } else if(kind==='brute') {
        for(const x of [-.28,.28])part('swollen shoulder','Bip01_Spine2','hood',[x,1.48,.015],[.18,.19,.2],'#785950');
        part('heavy chest harness','Bip01_Spine2','box',[0,1.31,-.15],[.49,.38,.1],'#4d4237');
      } else if(kind==='guard') {
        part('riot helmet','Bip01_Head','hood',[0,1.70,.025],[.235,.20,.235],'#344a55');
        part('helmet visor','Bip01_Head','box',[0,1.66,-.205],[.35,.12,.04],'#889589');
        part('riot chest plate','Bip01_Spine2','box',[0,1.34,-.17],[.49,.45,.12],'#3f525d');
        for(const x of [-.34,.34])part('riot shoulder plate','Bip01_Spine2','box',[x,1.49,0],[.22,.18,.36],'#4b5961');
        part('chest identification stripe','Bip01_Spine2','box',[0,1.47,-.26],[.38,.055,.025],'#cabd93');
      } else if(kind==='stalker') {
        part('ragged hood','Bip01_Head','hood',[0,1.70,.08],[.23,.27,.23],'#555f48');
        part('hunched growth','Bip01_Spine2','hood',[0,1.48,.22],[.3,.33,.22],'#65715b');
        for(const x of [-.16,0,.16]) {
          const m=part('back spine','Bip01_Spine2','claw',[x,1.54,.42],[.075,.36,.075],'#a7a68a');m.rotateX(Math.PI/3);
        }
      }
    }
    rig.gear=gear;
    const actorMaterials=[...new Set(meshes.map(m=>m.material))];
    rig.setOpacity=value=>actorMaterials.forEach(m=>{if(!m.transparent){m.transparent=true;m.needsUpdate=true;}m.opacity=value;m.depthWrite=value>.95;});
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
      const legs=['L','R'].map(side=>['Thigh','Calf','Foot'].map(name=>model.getObjectByName(`Bip01_${side}_${name}`)));
      const hip=new T.Vector3(),knee=new T.Vector3(),foot=new T.Vector3(),target=new T.Vector3(),bend=new T.Vector3(),axis=new T.Vector3(),joint=new T.Vector3();
      const correction=new T.Quaternion(),parentRotation=new T.Quaternion();
      function rotateToward(bone,from,to) {
        correction.setFromUnitVectors(from.normalize(),to.normalize());
        bone.parent.getWorldQuaternion(parentRotation);
        bone.quaternion.premultiply(parentRotation.clone().invert().multiply(correction).multiply(parentRotation));
        g.updateMatrixWorld(true);
      }
      function crouchLegs() {
        if(upper.position.y>=-.001)return;
        g.updateMatrixWorld(true);
        for(const [thigh,calf,ankle]of legs) {
          thigh.getWorldPosition(hip);calf.getWorldPosition(knee);ankle.getWorldPosition(foot);
          // Preserve each foot's animated ground contact while the hips drop behind cover.
          target.copy(foot);target.y-=upper.position.y*g.scale.y;
          const a=hip.distanceTo(knee),b=knee.distanceTo(foot),d=Math.min(a+b-.001,hip.distanceTo(target));
          axis.copy(target).sub(hip).normalize();
          bend.set(-Math.sin(g.rotation.y),0,-Math.cos(g.rotation.y));bend.addScaledVector(axis,-bend.dot(axis)).normalize();
          const along=(a*a-b*b+d*d)/(2*d),out=Math.sqrt(Math.max(0,a*a-along*along));
          joint.copy(hip).addScaledVector(axis,along).addScaledVector(bend,out);
          rotateToward(thigh,knee.clone().sub(hip),joint.clone().sub(hip));
          calf.getWorldPosition(knee);ankle.getWorldPosition(foot);
          rotateToward(calf,foot.clone().sub(knee),target.clone().sub(knee));
        }
      }
      rig.animate = (time, moving, attacking = false) => {
        const dt = rig.lastTime === null ? 0 : Math.max(0, Math.min(.1, time - rig.lastTime));
        rig.lastTime = time;
        action(attacking ? 'attack' : 'walk');
        actions[rig.activeAction].paused = !moving && !attacking;
        mixer.update(dt);
        crouchLegs();
      };
    }
    rig.die = () => {
      // Interrupt even paused walking/attack actions and apply the falling pose
      // on the lethal hit itself, without a blend back toward a standing pose.
      mixer.stopAllAction();
      actions.dead.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(T.LoopOnce, 1);
      actions.dead.clampWhenFinished = true;
      actions.dead.play(); rig.activeAction = 'dead'; mixer.update(0);
      rig.bodyMat.emissive.setHex(0);
    };
    rig.resetPose = () => {
      mixer.stopAllAction(); rig.activeAction = null; rig.lastTime = null;
      rig.shot = 0; rig.aim = 0;
      rig.setOpacity(1);upper.position.set(0,0,0);upper.rotation.set(0,0,0);
      bodyMat.color.set(friendly ? '#ffffff' : kind === 'runner' ? '#e1d9cc' : kind === 'brute' ? '#ccb8ae' : kind === 'guard' ? '#b3c0c3' : kind === 'stalker' ? '#a1ad8d' : '#ffffff');
      bodyMat.emissive.setHex(0);
      action(friendly ? 'aim' : 'walk', 0); mixer.update(0);
      rig.animate(0, false);
    };
    rig.resetPose();
    return rig;
  };
}
