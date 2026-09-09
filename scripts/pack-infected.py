# Merge FBX2glTF outputs with original PixelHouse UV textures. See ASSETS.md.
import json,struct,pathlib,sys
root=pathlib.Path(sys.argv[1])
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),bytearray(b[28+n:])
def write(p,j,b):
 j['buffers']=[{'byteLength':len(b)}];js=json.dumps(j,separators=(',',':')).encode();js+=b' '*(-len(js)%4);b+=b'\0'*(-len(b)%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b)
j,b=read(root/'zombie-walk.glb');j['animations'][0]['name']='walk'
for name in ['attack','dead']:
 s,bin=read(root/f'zombie-{name}.glb');offset=len(b);b.extend(bin);viewoffset=len(j['bufferViews']);accessoffset=len(j['accessors'])
 for v in s['bufferViews']:v['byteOffset']=v.get('byteOffset',0)+offset;j['bufferViews'].append(v)
 for a in s['accessors']:
  if 'bufferView' in a:a['bufferView']+=viewoffset
  j['accessors'].append(a)
 for a in s['animations']:
  a['name']=name
  for sampler in a['samplers']:sampler['input']+=accessoffset;sampler['output']+=accessoffset
  for c in a['channels']:c['target']['node']=next(i for i,n in enumerate(j['nodes']) if n.get('name')==s['nodes'][c['target']['node']].get('name'))
  j['animations'].append(a)
j['nodes'][0]['children']=[1,2]
j.pop('extensions',None);j.pop('extensionsUsed',None);j.pop('cameras',None)
for n in j['nodes']:n.pop('extensions',None);n.pop('camera',None)
j['images']=[];j['textures']=[];j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
for path in ['difusse.jpg','normal.JPG']:
 data=(root/'zombie'/path).read_bytes();b.extend(b'\0'*(-len(b)%4));vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(data)});b.extend(data);j['images'].append({'bufferView':vi,'mimeType':'image/jpeg'});j['textures'].append({'sampler':0,'source':len(j['images'])-1})
j['materials']=[{'name':'PixelHouse infected skin and clothes','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.92},'normalTexture':{'index':1,'scale':.65}}]
for m in j['meshes']:
 for p in m['primitives']:p['material']=0
j['asset']['copyright']='Zombie © PixelHouse team, CC BY 3.0. https://opengameart.org/content/zombie'
write(pathlib.Path(sys.argv[2]),j,b)
print('packed',len(b))
