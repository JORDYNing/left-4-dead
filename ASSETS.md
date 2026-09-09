# Asset credits and licenses

The following third-party assets are distributed with this game. Their licenses remain separate from the game code. Modified model files retain the applicable asset license.

| Runtime file | Original work / author | License | Adaptation |
| --- | --- | --- | --- |
| `assets/characters/infected.glb` | [Zombie](https://opengameart.org/content/zombie), **PixelHouse team** ([creator website](http://www.pixelhouse.com.ar)) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Converted the original FBX mesh and walk, fury and dead animation takes to one GLB; restored diffuse and normal textures; removed cameras/lights. Runtime normalizes scale/orientation, removes horizontal root motion, and tints/scales variants. |
| `assets/characters/survivor.glb` | [Zombie Survivor](https://opengameart.org/content/zombie-survivor), **thehumbug**; body based on [Low Poly Base Meshes](https://opengameart.org/content/low-poly-base-meshes-male-female) by **Julius**. Face reference credited by the original author to Aneta / 3d.sk. | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Rebuilt legacy Blender materials as PBR image materials; baked the original two-handed shotgun pose; exported the rig, character and weapons as GLB. Added runtime skeletal walking, torso aiming and recoil. **This adapted model is distributed under CC BY-SA 3.0.** |
| `vendor/three/` | [Three.js](https://github.com/mrdoob/three), Three.js authors, version 0.160.0 | MIT, included in `vendor/three/LICENSE` | Vendored engine, GLTFLoader, SkeletonUtils and BufferGeometryUtils. |

Original model downloads:

- [PixelHouse zombie.zip](https://opengameart.org/sites/default/files/zombie.zip)
- [thehumbug anetaPublish1.0.blend](https://opengameart.org/sites/default/files/anetaPublish1.0.blend)

The survivor's reference photographs are not included in the runtime GLB. Only the authored UV textures used by the exported meshes are included.

The city geometry is currently the project's procedural district. An externally authored Los Angeles scene is being evaluated and **has not yet been integrated**. No GTA or other commercial game assets are included.

## Rebuild the adapted files

Use Blender 4.5 and [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) 0.9.7. Download the originals above to a temporary work directory. Extract PixelHouse's files into `WORK/zombie/`, and save the survivor as `WORK/survivor.blend`. Replace `WORK` and `FBX2glTF` with your local paths:

```sh
FBX2glTF --binary --input WORK/zombie/walk.FBX --output WORK/zombie-walk.glb
FBX2glTF --binary --input WORK/zombie/fury.FBX --output WORK/zombie-attack.glb
FBX2glTF --binary --input WORK/zombie/dead.FBX --output WORK/zombie-dead.glb
python3 scripts/pack-infected.py WORK assets/characters/infected.glb
blender --factory-startup --disable-autoexec -b --python scripts/export-survivor.py -- WORK/survivor.blend assets/characters/survivor.glb
```

The FBX converter reports missing old texture paths; the packing script reconnects the original diffuse and normal files. The survivor conversion excludes cameras, lamps, hidden physics proxies and unused reference images.
