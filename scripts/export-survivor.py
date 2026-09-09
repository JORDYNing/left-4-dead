# Blender 4.5 conversion of thehumbug survivor; see ASSETS.md for CC BY-SA 3.0.
import bpy,sys
args=sys.argv[sys.argv.index('--')+1:]
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=args[0])
# Rebuild legacy Blender Internal materials as portable PBR image materials.
tex={'aneta':('anetaColor','anetaNormal.png'),'anetaSKIN':('anetaColor','anetaNormal.png'),'eyes':('eyeDif.png',None),'hair':('hair1.png',None),'Material':('revolverColor.png',None),'Material.001':('rem870Color.png','rem870normal.png'),'shotgunShell':('shotgunShell.png',None)}
for name,(color,normal) in tex.items():
 m=bpy.data.materials[name];m.use_nodes=True;m.node_tree.nodes.clear();nodes=m.node_tree.nodes;links=m.node_tree.links
 out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.82;links.new(bs.outputs['BSDF'],out.inputs['Surface']);im=nodes.new('ShaderNodeTexImage');im.image=bpy.data.images[color];links.new(im.outputs['Color'],bs.inputs['Base Color'])
 if normal:
  n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images[normal];n.image.colorspace_settings.name='Non-Color';nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
 if name=='hair':links.new(im.outputs['Alpha'],bs.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
rig=bpy.data.objects['armature'];rig.animation_data.action=bpy.data.actions['armatureAction'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
# Export only the visible character and equipped weapons, excluding reference photographs / physics proxies.
for o in bpy.context.scene.objects:o.select_set(o==rig or (o.type=='MESH' and not o.hide_render))
bpy.context.view_layer.objects.active=rig
# Bake the existing two-handed aim pose so constraints don't depend on Blender at runtime.
bpy.ops.nla.bake(frame_start=0,frame_end=0,only_selected=False,visual_keying=True,clear_constraints=True,use_current_action=False,bake_types={'POSE'})
rig.animation_data.action.name='aim'
for o in bpy.context.selected_objects:
 if o.type=='MESH':
  print('VISIBLE',o.name,[round(x,4) for x in o.matrix_world.translation], [round(x,4) for x in o.dimensions])
# Keep only the baked aim animation; the game animates legs and applies aiming/recoil to the torso rig.
for a in list(bpy.data.actions):
 if a!=rig.animation_data.action:bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=args[1],export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_yup=True,export_cameras=False,export_lights=False)
print('EXPORTED')
