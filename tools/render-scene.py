"""Build a Cycles scene from the same measured geometry used in the editor."""
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def point(value):
    """Convert Three.js right-handed Y-up coordinates to Blender Z-up."""
    return Vector((value[0], -value[2], value[1]))


def linear(channel):
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def display_hex(color):
    def channel(linear_value):
        value = 12.92 * linear_value if linear_value <= .0031308 else 1.055 * linear_value ** (1 / 2.4) - .055
        return f"{round(255 * max(0, min(1, value))):02x}"
    return "#" + "".join(channel(component) for component in color[:3])


def tint(color, factor):
    return (*(min(1.0, channel * factor) for channel in color), 1)


def noise_at(nodes, links, coordinates, scale, stretch=None):
    if stretch:
        mapping = nodes.new("ShaderNodeVectorMath")
        mapping.operation = "MULTIPLY"
        mapping.inputs[1].default_value = stretch
        links.new(coordinates, mapping.inputs[0])
        coordinates = mapping.outputs["Vector"]
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3.0
    links.new(coordinates, noise.inputs["Vector"])
    return noise.outputs["Fac"]


def bump_at(nodes, links, height, distance, normal=None):
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = distance
    bump.inputs["Strength"].default_value = .38
    links.new(height, bump.inputs["Height"])
    if normal is not None:
        links.new(normal, bump.inputs["Normal"])
    return bump.outputs["Normal"]


def grain_color(nodes, links, value, color, low, high):
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = tint(color, low)
    ramp.color_ramp.elements[1].color = tint(color, high)
    links.new(value, ramp.inputs["Fac"])
    return ramp.outputs["Color"]


def uv_transform(nodes, links, coords, direction, repeat=1):
    if direction:
        rotate = nodes.new("ShaderNodeVectorRotate")
        rotate.rotation_type = "Z_AXIS"
        rotate.inputs["Angle"].default_value = math.radians(direction)
        links.new(coords, rotate.inputs["Vector"])
        coords = rotate.outputs["Vector"]
    if repeat != 1:
        scale = nodes.new("ShaderNodeVectorMath")
        scale.operation = "SCALE"
        scale.inputs["Scale"].default_value = repeat
        links.new(coords, scale.inputs[0])
        coords = scale.outputs["Vector"]
    return coords


def surface_detail(nodes, links, bsdf, color, label, finish, relief, appearance=None):
    coords = nodes.new("ShaderNodeTexCoord")
    uv = coords.outputs["UV"]
    obj = coords.outputs["Object"]
    if appearance:
        uv = uv_transform(nodes, links, uv, appearance.get("direction", 0), 1 / appearance.get("scale", 1))
        obj = uv
    if finish == "metal":
        bsdf.inputs["Metallic"].default_value = .8
        bsdf.inputs["Roughness"].default_value = .34
    elif finish in ("fabric", "linen", "quilt", "pillow"):
        threads = noise_at(nodes, links, obj, 410, (1.0, 1.35, 1.1))
        shade = noise_at(nodes, links, obj, 17)
        bsdf.inputs["Roughness"].default_value = .88
        bsdf.inputs["Sheen Weight"].default_value = .2
        links.new(grain_color(nodes, links, shade, color, .84, 1.06), bsdf.inputs["Base Color"])
        links.new(bump_at(nodes, links, threads, .00048 * relief), bsdf.inputs["Normal"])
    elif finish == "wood":
        bsdf.inputs["Roughness"].default_value = .5
        grain = noise_at(nodes, links, uv if label in ("Floor", "Wall") else obj, 4.8,
                         (1.1, 45, 1) if label == "Floor" else (38, 36, 1.05))
        grain_contrast = max(0, relief - 1)
        grain = grain_color(nodes, links, grain, color, .67 - .23 * grain_contrast, 1.13 + .13 * grain_contrast)
        surface_normal = None
        if label == "Floor":
            plank = nodes.new("ShaderNodeTexBrick")
            plank.offset, plank.offset_frequency = .32, 2
            plank.inputs["Scale"].default_value = 1.0
            plank.inputs["Brick Width"].default_value = 1.10
            plank.inputs["Row Height"].default_value = .155
            plank.inputs["Mortar Size"].default_value = .0016
            plank.inputs["Mortar Smooth"].default_value = .001
            plank.inputs["Mortar"].default_value = tint(color, .43)
            plank.inputs["Color1"].default_value = tint(color, .84)
            links.new(grain, plank.inputs["Color2"])
            links.new(uv, plank.inputs["Vector"])
            grain = plank.outputs["Color"]
            surface_normal = bump_at(nodes, links, plank.outputs["Fac"], -.0016 * relief)
        fine = noise_at(nodes, links, obj, 140)
        links.new(bump_at(nodes, links, fine, .00016 * relief, surface_normal), bsdf.inputs["Normal"])
        links.new(grain, bsdf.inputs["Base Color"])
    elif finish == "concrete":
        shading = noise_at(nodes, links, obj, 7)
        pores = noise_at(nodes, links, obj, 150)
        low, high = (.91, 1.03) if label == "Wall" else (.72, 1.12)
        links.new(grain_color(nodes, links, shading, color, low, high), bsdf.inputs["Base Color"])
        links.new(bump_at(nodes, links, pores, .0008 * relief), bsdf.inputs["Normal"])
        bsdf.inputs["Roughness"].default_value = .84
    elif finish == "marble":
        wave = nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "DIAGONAL"
        wave.inputs["Scale"].default_value = 2.2
        wave.inputs["Distortion"].default_value = 6.8
        wave.inputs["Detail"].default_value = 4
        wave.inputs["Detail Scale"].default_value = 1.8
        links.new(obj, wave.inputs["Vector"])
        vein = nodes.new("ShaderNodeValToRGB")
        vein.color_ramp.elements[0].color = tint(color, .48)
        vein.color_ramp.elements[0].position = .008
        vein.color_ramp.elements[1].color = (*color, 1)
        vein.color_ramp.elements[1].position = .17
        links.new(wave.outputs["Fac"], vein.inputs["Fac"])
        links.new(vein.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = .24
    elif finish == "tile":
        brick = nodes.new("ShaderNodeTexBrick")
        brick.offset = 0
        brick.inputs["Scale"].default_value = 1
        brick.inputs["Brick Width"].default_value = .5
        brick.inputs["Row Height"].default_value = .5
        brick.inputs["Mortar Size"].default_value = .0023
        brick.inputs["Color1"].default_value = tint(color, 1)
        brick.inputs["Color2"].default_value = tint(color, .92)
        brick.inputs["Mortar"].default_value = tint(color, .70)
        links.new(uv, brick.inputs["Vector"])
        links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = .48
        if relief > 1:
            links.new(bump_at(nodes, links, brick.outputs["Fac"], -.0014 * (relief - 1)), bsdf.inputs["Normal"])


def node_math(nodes, links, operation, *inputs):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate(inputs):
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            links.new(value, node.inputs[index])
    return node.outputs[0]


def furniture_detail(nodes, links, bsdf, color, furniture, use_uv=False):
    coords = nodes.new("ShaderNodeTexCoord")
    scale = 1 / furniture["scale"]
    relief = furniture["relief"]
    bsdf.inputs["Roughness"].default_value = furniture["roughness"]
    uv = uv_transform(nodes, links, coords.outputs["UV"], furniture.get("direction", 0))
    if furniture["preset"] == "matte-oak":
        local = uv if use_uv else coords.outputs["Object"]
        broad = noise_at(nodes, links, local, 3.5 * scale, (5, .32, 1) if use_uv else (5, 5, .32))
        grain = noise_at(nodes, links, local, 8 * scale, (15, .48, 1) if use_uv else (15, 15, .48))
        pores = noise_at(nodes, links, local, 42 * scale, (4.2, .85, 1) if use_uv else (4.2, 4.2, .85))
        rings = node_math(nodes, links, "MULTIPLY_ADD", grain, .62, node_math(nodes, links, "MULTIPLY", broad, .38))
        links.new(grain_color(nodes, links, rings, color, .42, 1.26), bsdf.inputs["Base Color"])
        normal = bump_at(nodes, links, rings, .0006 * relief)
        links.new(bump_at(nodes, links, pores, .00038 * relief, normal), bsdf.inputs["Normal"])
    else:
        xy = nodes.new("ShaderNodeSeparateXYZ")
        links.new(uv, xy.inputs[0])
        yarn = []
        for axis, period in (("X", .0038), ("Y", .0032)):
            angle = node_math(nodes, links, "MULTIPLY", xy.outputs[axis], math.tau / period * scale)
            wave = node_math(nodes, links, "SINE", angle)
            yarn.append(node_math(nodes, links, "MULTIPLY_ADD", wave, .5, .5))
        weave = node_math(nodes, links, "MULTIPLY", *yarn)
        shade = noise_at(nodes, links, uv, 26 * scale)
        color_mix = node_math(nodes, links, "MULTIPLY_ADD", weave, .57, node_math(nodes, links, "MULTIPLY", shade, .43))
        bsdf.inputs["Sheen Weight"].default_value = .32
        links.new(grain_color(nodes, links, color_mix, color, .74, 1.14), bsdf.inputs["Base Color"])
        links.new(bump_at(nodes, links, weave, .00046 * relief), bsdf.inputs["Normal"])


def multiply_color(nodes, links, source, color):
    blend = nodes.new("ShaderNodeMixRGB")
    blend.blend_type = "MULTIPLY"
    blend.inputs["Fac"].default_value = 1
    blend.inputs[1].default_value = (*color, 1)
    links.new(source, blend.inputs[2])
    return blend.outputs["Color"]


def texture_node(nodes, links, texture, uv, data_map=False):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(texture["path"], check_existing=True)
    if data_map:
        node.image.colorspace_settings.name = "Non-Color"
    node.extension = "REPEAT"
    links.new(uv, node.inputs["Vector"])
    return node


def material_maps(nodes, links, bsdf, appearance, uv_width):
    roughness, normal = appearance.get("roughnessMap"), appearance.get("normalMap")
    if not (roughness or normal):
        return
    texture = appearance.get("texture") or roughness or normal
    tile = appearance.get("tileMm", texture["tileMm"]) * appearance.get("scale", 1)
    coords = nodes.new("ShaderNodeTexCoord").outputs["UV"]
    uv = uv_transform(nodes, links, coords, appearance.get("direction", 0), 1000 * uv_width / tile)
    if roughness:
        image = texture_node(nodes, links, roughness, uv, True)
        channels = nodes.new("ShaderNodeSeparateColor")
        links.new(image.outputs["Color"], channels.inputs["Color"])
        links.new(channels.outputs["Green"], bsdf.inputs["Roughness"])
    if normal:
        image = texture_node(nodes, links, normal, uv, True)
        detail = nodes.new("ShaderNodeNormalMap")
        detail.inputs["Strength"].default_value = appearance.get("relief", 1)
        links.new(image.outputs["Color"], detail.inputs["Color"])
        links.new(detail.outputs["Normal"], bsdf.inputs["Normal"])


def material(hex_color, cache, label="Surface", finish="plain", texture=None, relief=1, furniture=None,
             appearance=None, glass=False, uv_width=1, emission=None, sheer=False, mirror=False):
    appearance_key = json.dumps(appearance, sort_keys=True) if appearance else None
    furniture_key = tuple(furniture[name] for name in ("preset", "scale", "relief", "roughness")) if furniture else None
    key = (label, hex_color, finish, texture["path"] if texture else None, relief, furniture_key,
           appearance_key, glass, uv_width, emission, sheer, mirror)
    if key in cache:
        return cache[key]
    color = tuple(linear(int(hex_color[start:start + 2], 16)) for start in (1, 3, 5))
    mat = bpy.data.materials.new(label + " " + hex_color)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .72
    direction, scale = 0, 1
    if appearance:
        preset = appearance["preset"]
        direction = appearance.get("direction", 0)
        scale = appearance.get("scale", 1)
        relief = appearance.get("relief", 1)
        if appearance.get("texture"):
            texture = {**appearance["texture"], "originalColors": not appearance.get("color")}
        elif preset in ("matte-oak", "woven-linen", "walnut", "cotton", "pique"):
            wood = preset in ("matte-oak", "walnut")
            furniture = {"preset": "matte-oak" if wood else "woven-linen", "scale": scale, "relief": relief, "direction": direction,
                         "roughness": .72 if wood else .86}
        elif preset in ("matte-lacquer", "gloss-lacquer"):
            finish = "plain"
            bsdf.inputs["Roughness"].default_value = .16 if preset == "gloss-lacquer" else .72
        elif preset != "original":
            finish = preset
    if furniture:
        furniture_detail(nodes, links, bsdf, color, furniture, bool(appearance))
    elif texture:
        coords = nodes.new("ShaderNodeTexCoord")
        tile = appearance.get("tileMm", texture["tileMm"]) if appearance else texture["tileMm"]
        uv = uv_transform(nodes, links, coords.outputs["UV"], direction, 1000 * uv_width / (tile * scale))
        image = texture_node(nodes, links, texture, uv)
        surface_color = image.outputs["Color"]
        if not texture.get("originalColors"):
            surface_color = multiply_color(nodes, links, surface_color, color)
        links.new(surface_color, bsdf.inputs["Base Color"])
        links.new(bump_at(nodes, links, image.outputs["Color"], .0005 * relief), bsdf.inputs["Normal"])
    elif finish != "plain":
        surface_detail(nodes, links, bsdf, color, label, finish, relief, appearance)
    if glass:
        bsdf.inputs["Transmission Weight"].default_value = 1
        bsdf.inputs["IOR"].default_value = 1.46
        bsdf.inputs["Roughness"].default_value = .12
    if appearance and "roughness" in appearance:
        bsdf.inputs["Roughness"].default_value = appearance["roughness"]
    if mirror:
        bsdf.inputs["Metallic"].default_value = 1
        bsdf.inputs["Roughness"].default_value = .025
    if appearance:
        material_maps(nodes, links, bsdf, appearance, uv_width)
    if emission:
        emission_color = tuple(linear(int(emission[start:start + 2], 16)) for start in (1, 3, 5))
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1)
        bsdf.inputs["Emission Strength"].default_value = .9
    if sheer:
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = .42
        links.new(nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
        links.new(bsdf.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], nodes.get("Material Output").inputs["Surface"])
    cache[key] = mat
    return mat


def cube(entry, cache, bevel=False, wall_finish=None, wall_texture=None, relief=1):
    rounded = entry.get("round", False)
    shade = entry.get("shade", False)
    location = point(entry["position"])
    if shade:
        bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.5, radius2=.22, depth=1,
                                        end_fill_type="NOTHING", location=location)
    elif entry.get("cylinder"):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.5, depth=1, location=location)
        if entry["cylinder"] == "front":
            bpy.context.object.rotation_euler.x = math.pi / 2
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        for face in bpy.context.object.data.polygons:
            face.use_smooth = len(face.vertices) == 4
    elif rounded:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=.5, location=location)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    sx, sy, sz = entry["size"]
    obj.dimensions = (sx, sz, sy)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    furniture = entry.get("material")
    appearance = entry.get("appearance")
    if wall_finish or wall_texture or furniture or appearance:
        uv = obj.data.uv_layers.active.data
        for face in obj.data.polygons:
            for index in face.loop_indices:
                vertex = obj.data.vertices[obj.data.loops[index].vertex_index].co
                local_uv = (furniture or appearance) and not entry.get("wallCovering")
                x, y, z = vertex if local_uv else obj.matrix_world @ vertex
                normal = face.normal
                uv[index].uv = (x, y) if abs(normal.z) > .5 else (-y if abs(normal.x) > .5 else x, z)
    obj.data.materials.append(material(entry["color"], cache, "Wall" if wall_finish or wall_texture else "Surface",
                                       wall_finish or entry.get("surface", "plain"), wall_texture, relief, furniture,
                                       appearance, entry.get("glass", False), emission=entry.get("emission"),
                                       mirror=entry.get("mirror", False)))
    if rounded or shade:
        for face in obj.data.polygons:
            face.use_smooth = True
        if shade:
            shell = obj.modifiers.new("Shade shell", "SOLIDIFY")
            shell.thickness = min(.0015, min(sx, sy, sz) * .05)
    elif bevel and not entry.get("mirror"):
        modifier = obj.modifiers.new("Edge bevel", "BEVEL")
        modifier.width = min(.025, min(sx, sy, sz) * .19)
        modifier.segments = 4
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def curtain_mesh(entry, cache, relief):
    width, height, depth = entry["size"]
    folds = entry["curtain"]["folds"]
    steps = folds * 10
    vertices, faces = [], []
    for step in range(steps + 1):
        fraction = step / steps
        x = (fraction - .5) * width
        y = -math.cos(fraction * 2 * math.pi * folds) * depth / 2
        vertices.extend([(x, y, -height / 2), (x, y, height / 2)])
        if step < steps:
            start = step * 2
            faces.append((start, start + 2, start + 3, start + 1))
    mesh = bpy.data.meshes.new("Curtain folds")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new().data
    for face in mesh.polygons:
        face.use_smooth = True
        for index in face.loop_indices:
            x, _, z = vertices[mesh.loops[index].vertex_index]
            uv[index].uv = (x, z)
    obj = bpy.data.objects.new("Curtain panel", mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = Matrix.Translation(point(entry["position"]))
    mesh.materials.append(material(entry["color"], cache, "Curtain", "fabric", relief=relief,
                                   appearance=entry.get("appearance"), sheer=entry["curtain"]["sheer"]))
    return obj


def pillow_mesh(width, height, depth, contact=None, asymmetry=1):
    layers, segments = 30, 96
    bottom = -height * .5 if contact is None else max(-height * .5, contact)
    vertices = [(0, 0, bottom)]

    def signed_power(number, power):
        return math.copysign(abs(number) ** power, number)

    for ring in range(1, layers):
        latitude = math.pi * (ring / layers - .5)
        outline = signed_power(math.cos(latitude), .45)
        level = signed_power(math.sin(latitude), .72)
        for column in range(segments):
            angle = 2 * math.pi * column / segments
            x = outline * signed_power(math.cos(angle), .36)
            y = outline * signed_power(math.sin(angle), .4)
            folds = (.68 * math.sin(15 * x + 2.2 * math.sin(3.8 * y)) + .32 * math.sin(38 * x + 9 * y))
            z = level * (.93 + .035 * folds)
            z *= height / 2
            if contact is not None:
                pinch = abs(x) ** 3 * math.cos(24 * y + 3.5 * x * asymmetry)
                dent = math.exp(-((x - .22 * asymmetry) ** 2 * 6 + (y + .20) ** 2 * 7))
                z = max(contact, z + height * (.04 * pinch - .10 * dent * max(0, level)))
            vertices.append((x * width / 2, y * depth / 2, z))

    faces = []
    top = len(vertices)
    vertices.append((0, 0, height * .5))
    for column in range(segments):
        next_column = (column + 1) % segments
        faces.append((0, next_column + 1, column + 1))
        for row in range(layers - 2):
            low = 1 + row * segments
            high = low + segments
            faces.append((low + column, low + next_column, high + next_column, high + column))
        high = top - segments
        faces.append((high + column, high + next_column, top))
    return vertices, faces


def quilt_mesh(width, height, depth):
    cols, rows = 88, 80
    vertices, faces = [], []
    for row in range(rows + 1):
        v = row * 2 / rows - 1
        for column in range(cols + 1):
            u = column * 2 / cols - 1
            end = max(0, (abs(u) - .91) / .09, (abs(v) - .94) / .06)
            crease = (.19 * math.sin(17 * u + 2.8 * math.sin(3.9 * v)) * (.55 + .45 * math.cos(4 * v))
                      + .062 * math.sin(11 * v + 13 * u) + .035 * math.sin(45 * u + 7 * v))
            fold = .13 * math.exp(-((v - .66 - .025 * math.sin(4 * u)) / .045) ** 2)
            z = height * (.25 - .46 * end * end + crease + fold)
            vertices.append((u * width / 2, v * depth / 2, z))
            if row and column:
                n = row * (cols + 1) + column
                faces.append((n - cols - 2, n - cols - 1, n, n - 1))
    return vertices, faces


def draped_quilt(entry, mattress, bed):
    width, thickness, length = entry["size"]
    mattress_width, mattress_thickness, mattress_length = mattress["size"]
    mattress_height = mattress["position"][1] + mattress_thickness / 2
    foot = mattress["position"][2] + mattress_length / 2 - entry["position"][2]
    rise = mattress_height - entry["position"][1] + max(.004, min(.018, thickness * .31))
    side = min(width, mattress_width) / 2
    side_margin = max(0, min(.034, (bed[0] - mattress_width) / 2))
    foot_margin = max(0, length / 2 - foot)
    fall = min(.115, bed[1] * .125, mattress_thickness * .78)
    cols, rows = 94, 82
    vertices, faces = [], []
    for row in range(rows + 1):
        v = row * 2 / rows - 1
        bottom = max(0, (-v - .88) / .12)
        y = (-foot - foot_margin * math.sin(bottom * math.pi / 2) if bottom
             else -foot + (v + .88) * (foot + length / 2) / 1.88)
        for column in range(cols + 1):
            u = column * 2 / cols - 1
            edge = max(0, (abs(u) - .89) / .11)
            flare = side_margin * (.89 + .1 * math.sin(22 * v + 2 * u))
            lateral = side + flare * math.sin(edge * math.pi / 2) if edge else side * abs(u) / .89
            x = math.copysign(lateral, u)
            overhang = max(edge, bottom)
            drop = fall * (1 - math.cos(overhang * math.pi / 2))
            gathering = .006 * math.sin(28 * (u + v) + 1.6 * math.sin(v * 7)) * overhang
            waves = .0055 * math.sin(8 * u + 4.3 * v) + .0028 * math.sin(20 * u - 9 * v)
            z = rise - drop + gathering + waves * (1 - .54 * overhang)
            vertices.append((x, y, z))
            if row and column:
                n = row * (cols + 1) + column
                faces.append((n - cols - 2, n - cols - 1, n, n - 1))
    perimeter = (list(range(cols + 1)) + [row * (cols + 1) + cols for row in range(1, rows + 1)]
                 + [rows * (cols + 1) + column for column in range(cols - 1, -1, -1)]
                 + [row * (cols + 1) for row in range(rows - 1, 0, -1)])
    return vertices, faces, [vertices[index] for index in perimeter]


def cloth_seam(parent, points, color, cache, radius):
    curve = bpy.data.curves.new("Bedding seam", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for target, position in zip(spline.points, points):
        target.co = (*position, 1)
    spline.use_cyclic_u = True
    seam = bpy.data.objects.new("Bedding seam", curve)
    bpy.context.collection.objects.link(seam)
    seam.parent = parent
    shade = tuple(linear(int(color[i:i + 2], 16)) for i in (1, 3, 5))
    curve.materials.append(material(display_hex(tint(shade, .73)), cache, "Thread", "fabric"))


def soft_bedding(entry, cache, relief, mattress=None, bed=None):
    quilt = entry["surface"] == "quilt"
    seam = None
    if mattress is None:
        vertices, faces = (quilt_mesh if quilt else pillow_mesh)(*entry["size"])
    elif quilt:
        vertices, faces, seam = draped_quilt(entry, mattress, bed)
    else:
        contact = mattress["position"][1] + mattress["size"][1] / 2 - entry["position"][1]
        vertices, faces = pillow_mesh(*entry["size"], contact=contact - .001,
                                     asymmetry=math.copysign(1, entry["position"][0]))
        equator = len(vertices) // 2 - 48
        seam = vertices[equator:equator + 96]
    mesh = bpy.data.meshes.new("Woven bedding")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    furniture = entry.get("material")
    appearance = entry.get("appearance")
    if furniture or appearance:
        uv = mesh.uv_layers.new().data
        for loop in mesh.loops:
            x, y, _ = vertices[loop.vertex_index]
            uv[loop.index].uv = x, y
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new("Woven bedding", mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = Matrix.Translation(point(entry["position"]))
    obj.data.materials.append(material(entry["color"], cache, "Textile", entry["surface"],
                                       relief=relief, furniture=furniture, appearance=appearance))
    if quilt:
        edge = obj.modifiers.new("Folded cloth edge", "SOLIDIFY")
        edge.thickness = .007 if mattress else .003
    if seam:
        cloth_seam(obj, seam, entry["color"], cache, .0013 if quilt else .0018)
    return obj


def window_frame(window, cache):
    x, y, z = window["center"]
    sill = window.get("sillThickness", 0)
    width, height = window["width"], window["height"] - sill
    if height <= 0:
        return
    y += sill / 2
    border = min(.042, width / 7, height / 7)
    depth = min(.064, window["thickness"] * .8)

    def mullion(horizontal, vertical, span, rise):
        position = (x + horizontal, y + vertical, z) if window["alongX"] else (x, y + vertical, z + horizontal)
        size = (span, rise, depth) if window["alongX"] else (depth, rise, span)
        cube({"position": position, "size": size, "color": "#efede6"}, cache, bevel=True)

    for offset in (-1, 1):
        mullion(0, offset * (height - border) / 2, width, border)
        mullion(offset * (width - border) / 2, 0, border, height - 2 * border)
    if width >= .78:
        mullion(0, 0, border * .86, height - 2 * border)


def imported_material(original, appearance, cache, width):
    if appearance["preset"] != "original" or appearance.get("texture"):
        color = appearance.get("color", display_hex(original.diffuse_color))
        return material(color, cache, "Model surface", appearance=appearance, uv_width=width)
    clone = original.copy()
    nodes = clone.node_tree.nodes
    links = clone.node_tree.links
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not bsdf and (appearance.get("roughnessMap") or appearance.get("normalMap")):
        color = appearance.get("color", display_hex(original.diffuse_color))
        bpy.data.materials.remove(clone)
        return material(color, cache, "Model surface", appearance=appearance, uv_width=width)
    emission = next((node for node in nodes if node.type == "EMISSION"), None) if not bsdf else None
    base_color = bsdf.inputs["Base Color"] if bsdf else emission.inputs["Color"] if emission else None
    if appearance.get("color") and base_color is not None:
        hex_color = appearance["color"]
        color = tuple(linear(int(hex_color[start:start + 2], 16)) for start in (1, 3, 5))
        if base_color.is_linked:
            links.new(multiply_color(nodes, links, base_color.links[0].from_socket, color), base_color)
        else:
            base_color.default_value = (*color, 1)
    if bsdf and "roughness" in appearance:
        socket = bsdf.inputs["Roughness"]
        for link in list(socket.links):
            links.remove(link)
        socket.default_value = appearance["roughness"]
    direction, scale = appearance.get("direction", 0), appearance.get("scale", 1)
    if direction or scale != 1:
        coords = nodes.new("ShaderNodeTexCoord").outputs["UV"]
        for image in [node for node in nodes if node.type == "TEX_IMAGE"]:
            source = image.inputs["Vector"]
            uv = source.links[0].from_socket if source.is_linked else coords
            links.new(uv_transform(nodes, links, uv, direction, 1 / scale), source)
    for node in nodes:
        if node.type == "NORMAL_MAP" and "relief" in appearance:
            node.inputs["Strength"].default_value *= appearance["relief"]
    if bsdf:
        material_maps(nodes, links, bsdf, appearance, width)
    return clone


def model(item, cache):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=item["path"])
    inserted = set(bpy.data.objects) - before
    mesh_objects = [obj for obj in inserted if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    if not points:
        raise ValueError(f"Model has no mesh: {item['name']}")
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    extents = high - low
    if min(extents) <= 0:
        raise ValueError(f"Model has invalid dimensions: {item['name']}")
    width, height, depth = item["size"]
    translation = Matrix.Translation(point(item["position"]))
    rotation = Matrix.Rotation(-item["angle"], 4, "Z")
    scale = Matrix.Diagonal((width / extents.x, depth / extents.y, height / extents.z, 1))
    origin = Matrix.Translation((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    transforms = [(obj, obj.matrix_world.copy()) for obj in mesh_objects]
    appearances = item.get("appearances") or {}
    replacements = {}
    for obj, transform in transforms:
        obj.parent = None
        obj.matrix_world = translation @ rotation @ scale @ origin @ transform
        if not appearances:
            continue
        for slot in obj.material_slots:
            original = slot.material
            match = re.fullmatch(r"myhome-slot-(default|\d+)(?:\.\d+)?", original.name) if original else None
            if not match:
                continue
            value = appearances.get("glb-" + match[1], appearances.get("all"))
            if value:
                if original not in replacements:
                    replacements[original] = imported_material(original, value, cache, width)
                slot.link = "OBJECT"
                slot.material = replacements[original]
    for obj in inserted - set(mesh_objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def cabinet_diffusers(lighting, transform, name):
    """Use the visible strip faces as Cycles light sources, in cabinet-local coordinates."""
    vertices, faces = [], []
    for strip in lighting["strips"]:
        normal = point(strip["normal"])
        center = point(strip["position"])
        across = Vector((1, 0, 0)) if abs(normal.z) > .5 else Vector((0, 1, 0))
        along = normal.cross(across)
        u, v = across * (strip["width"] / 2), along * (strip["height"] / 2)
        start = len(vertices)
        vertices.extend([center-u-v, center+u-v, center+u+v, center-u+v])
        faces.append(tuple(range(start, start+4)))
    if not faces:
        return
    mesh = bpy.data.meshes.new("LED diffusers")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name + " · LED", mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = transform
    mat = bpy.data.materials.new("LED " + lighting["color"])
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    emission = nodes.new("ShaderNodeEmission")
    color = lighting["color"]
    emission.inputs["Color"].default_value = (*[linear(int(color[i:i+2], 16)) for i in (1, 3, 5)], 1)
    emission.inputs["Strength"].default_value = lighting["brightness"] * 1.6
    sided = nodes.new("ShaderNodeMixShader")
    links.new(nodes.new("ShaderNodeNewGeometry").outputs["Backfacing"], sided.inputs[0])
    links.new(emission.outputs[0], sided.inputs[1])
    links.new(sided.outputs[0], nodes.get("Material Output").inputs["Surface"])
    mesh.materials.append(mat)


def area_light(name, location, target, energy, size, color, visible=True):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    if not visible:
        data.specular_factor = 0
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    if not visible:
        light.visible_glossy = False
        light.visible_transmission = False
        light.visible_camera = False
    light.rotation_euler = (Vector(target) - light.location).to_track_quat("-Z", "Y").to_euler()
    return data


def point_light(entry, transform=None):
    data = bpy.data.lights.new(entry["name"], "POINT")
    data.energy = entry["power"]
    data.shadow_soft_size = entry["diameter"] / 2 if "diameter" in entry else (.065 if transform is not None else .14)
    color = entry["color"]
    data.color = tuple(linear(int(color[start:start + 2], 16)) for start in (1, 3, 5))
    light = bpy.data.objects.new(entry["name"], data)
    bpy.context.collection.objects.link(light)
    position = point(entry["position"])
    light.location = transform @ position if transform is not None else position
    return light


def ies_light(entry, transform):
    profile = entry["ies"]
    light = point_light({**entry, "power": 1}, transform)
    light.data.shadow_soft_size = entry.get("diameter", .024) / 2
    if profile["aim"] == "out" and not entry.get("downlightDiameter"):
        direction = transform.to_3x3() @ point((0, 0, 1))
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    text = bpy.data.texts.new(profile["name"])
    text.write(profile["text"])
    light.data.use_nodes = True
    tree = light.data.node_tree
    emission = next(node for node in tree.nodes if node.type == "EMISSION")
    ies = tree.nodes.new("ShaderNodeTexIES")
    ies.mode = "INTERNAL"
    ies.ies = text
    ies.inputs["Strength"].default_value = profile["gain"] * entry.get("iesPowerScale", 1)
    tree.links.new(ies.outputs["Fac"], emission.inputs["Strength"])


def sun_light(direction, energy, color):
    data = bpy.data.lights.new("Sun through window", "SUN")
    data.energy = energy
    data.angle = .075
    data.color = color
    sun = bpy.data.objects.new("Sun through window", data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def corridor_scene(setting, materials):
    origin, outward = point(setting["origin"]), point(setting["outward"])
    up = Vector((0, 0, 1))
    side = outward.cross(up)
    width, depth, height = (setting[key] for key in ("width", "depth", "height"))
    half, panel = width / 2, .065
    ceiling = "#bab0a3"
    floor = "#7d6d5b"

    def box(across, along, y, span, length, rise, color):
        location = origin + side * across + outward * along + up * y
        dimensions = (span, rise, length) if abs(side.x) > .5 else (length, rise, span)
        cube({"position": (location.x, location.z, -location.y), "size": dimensions, "color": color}, materials)

    mid = (depth + panel) / 2
    box(0, mid, -panel / 2, width + panel * 2, depth + panel, panel, floor)
    box(0, mid, height + panel / 2, width + panel * 2, depth + panel, panel, ceiling)
    box(0, depth + panel / 2, height / 2, width + panel * 2, panel, height, setting["color"])
    for sign in (-1, 1):
        box(sign * (half + panel / 2), mid, height / 2, panel, depth + panel, height, setting["color"])
        box(sign * (half - .006), mid, .027, .012, depth, .054, "#908475")
    box(0, depth - .006, .027, width, .012, .054, "#908475")
    if setting["power"]:
        emitter = origin + outward * (depth * .68) + up * (height - .07)
        area_light("Corridor ceiling light", emitter, emitter - up, setting["power"], min(width * .62, .65), (1, .85, .70))


def dusk_image():
    # The texture is an equirectangular view. Keep its scene-linear values separate from window illumination.
    import numpy as np

    width, height = 1536, 768
    longitude = np.arange(width) / width
    latitude = np.arange(height) / height
    horizon = np.exp(-((latitude - .51) / .14) ** 2)
    zenith = np.clip((latitude - .49) * 2.5, 0, 1)
    glow = .78 + .22 * np.cos(longitude * 2 * np.pi)
    pixels = np.ones((height, width, 4), dtype=np.float32)
    for channel, (base, bright) in enumerate(zip((.025, .043, .086), (.17, .13, .091))):
        pixels[:, :, channel] = base * (1 - zenith[:, None] * .62) + bright * horizon[:, None] * glow[None, :]

    rng = np.random.default_rng(263)
    for level, (roof_low, roof_high, base, color) in enumerate((
        (.504, .532, .462, (.035, .047, .066)),
        (.510, .556, .469, (.019, .027, .042)),
    )):
        column = -14 + level * 9
        while column < width:
            span = int(rng.integers(15, 45))
            bottom = int(base * height)
            roof = int(rng.uniform(roof_low, roof_high) * height)
            strip = np.arange(column, column + span) % width
            pixels[bottom:roof, strip, :3] = np.asarray(color) * rng.uniform(.84, 1.2)
            if level:
                for row in range(bottom + 6, roof - 4, 7):
                    for x in range(column + 4, column + span - 3, 6):
                        if rng.random() < .20:
                            pixels[row:row + 2, np.arange(x, x + 2) % width, :3] = (.36, .22, .095)
            column += span + int(rng.integers(2, 13))
    below = int(.467 * height)
    pixels[:below, :, :3] = (.014, .022, .035)
    image = bpy.data.images.new("Dusk skyline", width=width, height=height, float_buffer=True)
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    return image


def visible_exterior(world, background, strength):
    nodes, links = world.node_tree.nodes, world.node_tree.links
    sky = nodes.new("ShaderNodeBackground")
    sky.inputs["Strength"].default_value = strength
    panorama = nodes.new("ShaderNodeTexEnvironment")
    panorama.image = dusk_image()
    links.new(panorama.outputs["Color"], sky.inputs["Color"])
    rays = nodes.new("ShaderNodeLightPath")
    # Perfect mirrors need the same surroundings as the camera.
    visible = node_math(nodes, links, "MAXIMUM", rays.outputs["Is Camera Ray"], rays.outputs["Is Glossy Ray"])
    visible = node_math(nodes, links, "MAXIMUM", visible, rays.outputs["Is Singular Ray"])
    mix = nodes.new("ShaderNodeMixShader")
    links.new(visible, mix.inputs[0])
    links.new(background.outputs[0], mix.inputs[1])
    links.new(sky.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes["World Output"].inputs["Surface"])


def render(source, output, width, height, samples, device):
    data = json.loads(Path(source).read_text(encoding="utf-8"))
    if data["version"] != 1:
        raise ValueError("Unsupported scene version")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    cache = {}
    style = data["style"]
    ambience = data.get("ambience", {})
    details = data.get("renderDetail", {})
    relief = style.get("surfaceRelief", 1)
    textures = data.get("textures", {})
    for box in data["boxes"]:
        if box.get("wallCovering") or box.get("windowSill") or box.get("architecturalTrim"):
            cube(box, cache, bevel=bool(box.get("windowSill") or box.get("architecturalTrim")), relief=relief)
        else:
            cube(box, cache, wall_finish=style.get("wallFinish"), wall_texture=textures.get("wall"), relief=relief)
    for door in data.get("doors", []):
        leaf = cube(door, cache, bevel=True)
        leaf.rotation_euler.z = -door["angle"]
    for window in data.get("windows", []):
        window_frame(window, cache)
    if details.get("corridor"):
        corridor_scene(details["corridor"], cache)
    floor_points = [(x, -z, 0) for x, z in data["floor"]]
    winding = sum(
        p[0] * floor_points[(i + 1) % len(floor_points)][1]
        - p[1] * floor_points[(i + 1) % len(floor_points)][0]
        for i, p in enumerate(floor_points)
    )
    if winding < 0:
        floor_points.reverse()
    mesh = bpy.data.meshes.new("Measured floor")
    mesh.from_pydata(floor_points, [], [list(range(len(floor_points)))])
    mesh.update()
    uv = mesh.uv_layers.new().data
    for loop in mesh.loops:
        x, y, _ = floor_points[loop.vertex_index]
        uv[loop.index].uv = x, y
    floor = bpy.data.objects.new("Measured floor", mesh)
    bpy.context.collection.objects.link(floor)
    floor.data.materials.append(material(style["floor"], cache, "Floor", style.get("floorFinish", "plain"),
                                         textures.get("floor"), relief))
    if data.get("enclosed"):
        roof = floor.copy()
        roof.data = floor.data.copy()
        roof.name = "Measured ceiling"
        roof.location.z = data["height"]
        roof.data.materials.clear()
        roof.data.materials.append(material("#eeeae1", cache, "Ceiling"))
        bpy.context.collection.objects.link(roof)

    for item in data["items"]:
        if item.get("path"):
            model(item, cache)
            continue
        transform = Matrix.Translation(point(item["position"])) @ Matrix.Rotation(-item["angle"], 4, "Z")
        if lighting := item.get("cabinetLight"):
            cabinet_diffusers(lighting, transform, item["name"])
        if fixture := item.get("fixture"):
            if fixture.get("ies"):
                ies_light(fixture, transform)
            elif diameter := fixture.get("downlightDiameter"):
                location = transform @ point(fixture["position"])
                color = fixture["color"]
                light_color = tuple(linear(int(color[start:start + 2], 16)) for start in (1, 3, 5))
                light = area_light(fixture["name"], location, location + Vector((0, 0, -1)),
                                   fixture["power"], diameter, light_color)
                light.shape = "DISK"
            else:
                point_light(fixture, transform)
        mattress = (next((part for part in item["fallback"] if part.get("surface") == "linen"), None)
                    if details.get("detailedBedding") else None)
        for entry in item["fallback"]:
            if entry.get("curtain"):
                obj = curtain_mesh(entry, cache, relief)
            elif entry.get("surface") in ("pillow", "quilt"):
                obj = soft_bedding(entry, cache, relief, mattress, item["size"])
            else:
                obj = cube(entry, cache, bevel=True, relief=relief)
            local_rotation = Matrix.Rotation(-entry.get("angle", 0), 4, "Z")
            obj.matrix_world = transform @ obj.matrix_world @ local_rotation

    camera_data = bpy.data.cameras.new("Project camera")
    panorama = data.get("projection") == "equirectangular"
    if panorama:
        camera_data.type = "PANO"
        camera_data.panorama_type = "EQUIRECTANGULAR"
    else:
        camera_data.type = "PERSP"
        camera_data.sensor_fit = "VERTICAL"
        camera_data.angle_y = math.radians(data["camera"]["fov"])
        camera_data.shift_y = data["camera"].get("verticalShift", 0)
    camera_data.clip_start = .035
    camera_data.clip_end = 180
    camera = bpy.data.objects.new("Project camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = point(data["camera"]["position"])
    aim = point(data["camera"]["target"]) - camera.location
    if panorama:
        aim.z = 0
        if aim.length < .001:
            aim = Vector((0, 1, 0))
    camera.rotation_euler = aim.to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    center_x = sum(p[0] for p in floor_points) / len(floor_points)
    center_y = sum(p[1] for p in floor_points) / len(floor_points)
    room_height = data["height"]
    evening = style["light"] == "evening"
    warm = evening or style["light"] == "warm"
    strength = style.get("lightStrength", 1)
    window_strength = ambience.get("windowStrength", strength)
    window_size = ambience.get("windowSize", 1)
    window_hex = ambience.get("windowColor")
    window_color = (tuple(linear(int(window_hex[start:start + 2], 16)) for start in (1, 3, 5)) if window_hex else
                    ((.62, .77, 1.0) if evening else (.86, .92, 1.0)))
    windows = sorted(data.get("windows", []), key=lambda window: window["width"] * window["height"], reverse=True)[:4]
    interior_with_daylight = bool(windows and data.get("enclosed"))
    if interior_with_daylight:
        for window in windows:
            opening = point(window["center"])
            inward = point(window["direction"])
            sideways = inward.cross(Vector((0, 0, 1)))
            # The large source models daylight just outside the measured opening.
            emitter = opening - inward * (window["thickness"] / 2 + .31) + Vector((0, 0, .23))
            aim = opening + inward * 2.2 + sideways * .38 - Vector((0, 0, .49))
            skylight = area_light("Window daylight", emitter, aim,
                                 min(530, (36 if evening else 240) * window["width"] * window["height"]) * window_strength,
                                 window["width"] * window_size, window_color, visible="exterior" not in details)
            skylight.shape = "RECTANGLE"
            skylight.size_y = window["height"] * .8 * window_size
        if not warm and not data.get("sunDirection"):
            inward = point(windows[0]["direction"])
            sideways = inward.cross(Vector((0, 0, 1)))
            direction = inward - sideways * .43 - Vector((0, 0, .42))
            sun_light(direction, .95 * window_strength, (1, .89, .75))
    if source := data.get("sunDirection"):
        direction = -point(source)
        warm_sun = min(1.0, max(0.0, (source[1] - .12) / .5))
        sun_light(direction, 1.25 * window_strength, (1.0, .62 + .3 * warm_sun, .37 + .48 * warm_sun))
    area_light("Soft interior light", (center_x, center_y, room_height * .92),
               (center_x, center_y, 0), (260 if warm else (68 if interior_with_daylight else 160)) * strength,
               1.65, (1.0, .79, .57) if warm else (1.0, .95, .85))
    area_light("Room bounce", (center_x - .45, center_y + .6, room_height + 1.6),
               (center_x, center_y, 0), (300 if warm else 540) * strength, 3.2, (1.0, .92, .81))
    for entry in style.get("lights", []):
        point_light(entry)
    world = bpy.data.worlds.new("Daylight")
    world.use_nodes = True
    world_nodes = world.node_tree.nodes
    background = world_nodes["Background"]
    background.inputs["Color"].default_value = (.75, .83, .96, 1.0)
    background.inputs["Strength"].default_value = (.12 if evening else .27) * strength
    if "exterior" in details:
        visible_exterior(world, background, details["exterior"]["brightness"])
    elif interior_with_daylight:
        world_links = world.node_tree.links
        sky = world_nodes.new("ShaderNodeBackground")
        sky.inputs["Color"].default_value = (.37, .51, .82, 1.0) if evening else (.68, .81, 1.0, 1.0)
        sky.inputs["Strength"].default_value = .16 if evening else 1.6
        ray = world_nodes.new("ShaderNodeLightPath")
        mix = world_nodes.new("ShaderNodeMixShader")
        world_links.new(ray.outputs["Is Camera Ray"], mix.inputs[0])
        world_links.new(background.outputs[0], mix.inputs[1])
        world_links.new(sky.outputs[0], mix.inputs[2])
        world_links.new(mix.outputs[0], world_nodes["World Output"].inputs["Surface"])
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    if device != "CPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = device
        prefs.refresh_devices()
        active = [item for item in prefs.devices if item.type == device]
        if not active:
            raise RuntimeError(f"Cycles device {device} is not available")
        for item in prefs.devices:
            item.use = item.type == device
        scene.cycles.device = "GPU"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = ambience.get("exposure", 0)
    if "whiteBalance" in ambience:
        scene.view_settings.use_white_balance = True
        scene.view_settings.white_balance_temperature = ambience["whiteBalance"]
    if interior_with_daylight:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render()
    bpy.data.images["Render Result"].save_render(str(Path(output).resolve()), scene=scene)


if __name__ == "__main__":
    scene_file, png_file, w, h, sample_count, render_device = sys.argv[sys.argv.index("--") + 1:]
    render(scene_file, png_file, int(w), int(h), int(sample_count), render_device)
