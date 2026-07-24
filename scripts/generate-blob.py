# Generate a dense liquid-metal blob and export it as a .glb for the hero.
#
# Usage (from the project root):
#   blender --background --python scripts/generate-blob.py
#
# Output: public/models/chrome-blob.glb  (centered, ~unit size, dense enough
# to morph smoothly with the site's displacement shader).
#
# Tweak SEED / N_BLOBS / VOXEL / NOISE below to explore different forms.
# Requires Blender 3.x or 4.x.

import bpy
import os
import random

SEED = 7          # change for a different silhouette
N_BLOBS = 9       # more = busier form
VOXEL = 0.035     # smaller = denser mesh (smoother morph, heavier file)
NOISE = 0.28      # surface fold strength
OUT = os.path.join("public", "models", "chrome-blob.glb")

random.seed(SEED)

# --- clean scene ---
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

# --- metaballs → fused organic lobes ---
mball = bpy.data.metaballs.new("Blob")
obj = bpy.data.objects.new("Blob", mball)
bpy.context.collection.objects.link(obj)
mball.resolution = 0.08
mball.render_resolution = 0.05
for _ in range(N_BLOBS):
    el = mball.elements.new()
    el.co = (
        random.uniform(-1.2, 1.2),
        random.uniform(-1.2, 1.2),
        random.uniform(-0.8, 0.8),
    )
    el.radius = random.uniform(0.9, 1.5)

bpy.context.view_layer.objects.active = obj
bpy.ops.object.convert(target="MESH")
blob = bpy.context.active_object

# --- uniform dense topology (ideal for vertex displacement) ---
blob.data.remesh_voxel_size = VOXEL
bpy.ops.object.voxel_remesh()

# --- noise displacement for the folds/creases ---
tex = bpy.data.textures.new("blobNoise", type="CLOUDS")
tex.noise_scale = 0.6
disp = blob.modifiers.new("Disp", type="DISPLACE")
disp.texture = tex
disp.strength = NOISE
bpy.ops.object.modifier_apply(modifier=disp.name)

bpy.ops.object.shade_smooth()

# --- center + normalize to ~unit ---
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
blob.location = (0.0, 0.0, 0.0)
max_dim = max(blob.dimensions)
if max_dim > 0:
    s = 2.0 / max_dim
    blob.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# --- export ---
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB")
print("verts:", len(blob.data.vertices), "-> exported", OUT)
