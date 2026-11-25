"""Render local catalogue previews. Pass -- library to render the other categories."""
import json
from pathlib import Path
import runpy
import subprocess
import sys

import bpy
from mathutils import Vector

root = Path(__file__).resolve().parent.parent
render = runpy.run_path(str(root / "tools/render-scene.py"))
selected = set(sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else set()
collection = "library" if "library" in selected else "bedroom"
selected.discard("library")
models = json.loads(subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", """
import { bedroomModels } from './src/bedroom-models.ts';
import { makeBedroomFurniture } from './src/bedroom-catalog.ts';
import { renderFurnitureParts } from './src/scene-data.ts';
import { nativeLibrary } from './src/library-models.ts';
import { modelCatalog } from './src/catalog.ts';
const point = {x:0,z:0};
const entries = process.argv[1] === 'library'
  ? [...Object.values(nativeLibrary).flat().map(m => [m.id, renderFurnitureParts(m.build(point, 2650))]),
      ...modelCatalog.map(m => [m.id, 'public/models/' + m.id + '.v1.web.glb'])]
  : bedroomModels.map(id => [id, renderFurnitureParts(makeBedroomFurniture(id, point))]);
console.log(JSON.stringify(entries));
""", collection], cwd=root))
out = root / "public" / collection
out.mkdir(exist_ok=True)
if selected.difference(dict(models)):
    raise ValueError(f"Unknown catalogue models: {selected.difference(dict(models))}")

for model, parts in models:
    if selected and model not in selected:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 320, 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 88
    scene.world = bpy.data.worlds.new("Studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.68, .69, .70, 1)
    cache = {}
    objects = []
    if isinstance(parts, str):
        bpy.ops.import_scene.gltf(filepath=str(root / parts))
        objects = [obj for obj in scene.objects if obj.type == "MESH"]
        parts = []
    for part in parts:
        if part.get("surface") in ("pillow", "quilt"):
            obj = render["soft_bedding"](part, cache, 1)
        else:
            obj = render["cube"](part, cache, bevel=True)
        obj.rotation_euler.z -= part.get("angle", 0)
        objects.append(obj)
    bpy.context.view_layer.update()
    camera = bpy.data.objects.new("Catalogue", bpy.data.cameras.new("Catalogue"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    direction = Vector((.57, -1, .47)).normalized()
    rotation = (-direction).to_track_quat("-Z", "Y")
    corners = [rotation.inverted() @ (obj.matrix_world @ Vector(c)) for obj in objects for c in obj.bound_box]
    low = Vector([min(p[i] for p in corners) for i in range(3)])
    high = Vector([max(p[i] for p in corners) for i in range(3)])
    centre = rotation @ ((low + high) / 2)
    camera.rotation_euler = rotation.to_euler()
    camera.location = centre + direction * 7
    camera.data.ortho_scale = max(high.x - low.x, (high.y - low.y) * 1.25) * 1.11
    for loc, energy, size in [((-3, -4, 5), 470, 4), ((3, -1, 3), 230, 3), ((1, 3, 4), 320, 3)]:
        render["area_light"]("Softbox", centre + Vector(loc), centre, energy, size, (1, .96, .91))
    scene.render.filepath = str(out / (model + ".webp"))
    bpy.ops.render.render(write_still=True)
