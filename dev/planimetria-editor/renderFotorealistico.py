"""Calcola un PNG Cycles dal GLB dell’editor e dalla sua esatta camera."""

import json
import math
import os
import random
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree


def da_gltf(v):
    return Vector((v[0], -v[2], v[1]))


def verifica_geometria(file, oggetti):
    # I nodi di catalogo condividono i vertici locali e portano la propria posa.
    glb = file.read_bytes()
    lunghezza = struct.unpack_from("<I", glb, 12)[0]
    schema = json.loads(glb[20:20 + lunghezza])
    binario = 28 + lunghezza
    mesh = {o.get("id"): o for o in oggetti if o.type == "MESH"}
    if len(mesh) != len(schema["nodes"]):
        raise ValueError("Il numero di oggetti importati differisce dalla scena.")

    def chiave(v):
        return tuple(round(n, 5) for n in v)

    def coincidono(primi, secondi):
        albero = KDTree(len(secondi))
        for i, punto in enumerate(secondi):
            albero.insert(punto, i)
        albero.balance()
        return all(albero.find(punto)[2] <= 0.00002 for punto in primi)

    for nodo in schema["nodes"]:
        oggetto = mesh[nodo["extras"]["id"]]
        primitiva = schema["meshes"][nodo["mesh"]]["primitives"][0]
        accessor = schema["accessors"][primitiva["attributes"]["POSITION"]]
        vista = schema["bufferViews"][accessor["bufferView"]]
        inizio = binario + vista["byteOffset"] + accessor.get("byteOffset", 0)
        ha_posa = any(campo in nodo for campo in ("translation", "rotation", "scale"))
        x, y, z, w = nodo.get("rotation", (0, 0, 0, 1))
        posa = Matrix.LocRotScale(Vector(nodo.get("translation", (0, 0, 0))),
                                  Quaternion((w, x, y, z)), Vector(nodo.get("scale", (1, 1, 1))))
        originali = {chiave(da_gltf(posa @ Vector(v))) for v in struct.iter_unpack("<fff", glb[inizio:inizio + vista["byteLength"]])}
        importati = {chiave(oggetto.matrix_world @ vertice.co) for vertice in oggetto.data.vertices}
        if originali != importati:
            # La stessa posa applicata prima o dopo la conversione di assi può cambiare
            # un ultimo decimale. Verifica in entrambe le direzioni i punti in metri.
            if ha_posa and originali and importati and coincidono(originali, importati) and coincidono(importati, originali):
                continue
            raise ValueError(f"Coordinate 3D diverse per {nodo['name']}.")


def imposta_camera(scena, t, rapporto):
    dati = bpy.data.cameras.new("Inquadratura dell’editor")
    camera = bpy.data.objects.new(dati.name, dati)
    scena.collection.objects.link(camera)
    camera.location = da_gltf(t["posizione"])
    avanti = (da_gltf(t["guarda"]) - camera.location).normalized()
    destra = avanti.cross(da_gltf(t.get("alto", [0, 1, 0]))).normalized()
    alto = destra.cross(avanti)
    camera.rotation_euler = Matrix((destra, alto, -avanti)).transposed().to_euler()
    dati.sensor_fit = "HORIZONTAL"
    dati.angle = 2 * math.atan(math.tan(math.radians(t["fov"]) / 2) * rapporto)
    dati.clip_start, dati.clip_end = .05, 500
    scena.camera = camera


def copertura_senza_facce_coincidenti(scena):
    for oggetto in scena.objects:
        parte = oggetto.get("id", "").rsplit("/", 1)[-1]
        if oggetto.type != "MESH" or parte not in ("tetto", "tetto:timpani"):
            continue
        # Nel visore le superfici di copertura sono duplicate. Cycles usa la
        # singola superficie a doppia faccia, senza l'auto-ombra della copia.
        dati = bmesh.new()
        try:
            dati.from_mesh(oggetto.data)
            matrice = oggetto.matrix_world.to_3x3().inverted().transposed()
            centro = oggetto.matrix_world @ (sum((Vector(p) for p in oggetto.bound_box), Vector()) / 8)
            for faccia in list(dati.faces):
                normale = matrice @ faccia.normal
                esterno = Vector((0, 0, 1)) if parte == "tetto" else oggetto.matrix_world @ faccia.calc_center_median() - centro
                if normale.dot(esterno) < -.001:
                    dati.faces.remove(faccia)
            dati.to_mesh(oggetto.data)
        finally:
            dati.free()
        for materiale in oggetto.data.materials:
            if materiale:
                materiale.use_backface_culling = False


def rugosita_micro(materiale, segnale, delta):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    rugosita = nodi.get("Principled BSDF").inputs["Roughness"]
    if rugosita.is_linked:
        return
    campo = nodi.new("ShaderNodeMapRange")
    campo.inputs["From Min"].default_value = .15
    campo.inputs["From Max"].default_value = .85
    campo.inputs["To Min"].default_value = max(.035, rugosita.default_value - delta)
    campo.inputs["To Max"].default_value = min(1, rugosita.default_value + delta)
    links.new(segnale, campo.inputs["Value"])
    links.new(campo.outputs["Result"], rugosita)


def variazione(materiale, coordinate, scala, rilievo, contrasto, direzione=None):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    shader = nodi.get("Principled BSDF")
    texture = nodi.new("ShaderNodeTexCoord")
    texture.object = coordinate
    rumore = nodi.new("ShaderNodeTexNoise")
    rumore.inputs["Scale"].default_value = scala
    rumore.inputs["Detail"].default_value = 3
    spazio = texture.outputs["Object"]
    if direzione:
        stira = nodi.new("ShaderNodeVectorMath")
        stira.operation = "MULTIPLY"
        stira.inputs[1].default_value = direzione
        links.new(spazio, stira.inputs[0])
        spazio = stira.outputs["Vector"]
    links.new(spazio, rumore.inputs["Vector"])
    base = shader.inputs["Base Color"].default_value[:]
    colori = nodi.new("ShaderNodeValToRGB")
    for punto, fattore in zip(colori.color_ramp.elements, (1 - contrasto, 1 + contrasto)):
        punto.color = [min(1, n * fattore) for n in base[:3]] + [1]
    links.new(rumore.outputs["Fac"], colori.inputs["Fac"])
    links.new(colori.outputs["Color"], shader.inputs["Base Color"])
    bump = nodi.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .28
    bump.inputs["Distance"].default_value = rilievo
    links.new(rumore.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    rugosita_micro(materiale, rumore.outputs["Fac"], min(.12, contrasto * .7))


def riflesso_spigoli(materiale, raggio):
    # Agisce sulle normali dello shader, con la mesh e le quote originali.
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    normale = nodi.get("Principled BSDF").inputs["Normal"]
    bevel = nodi.new("ShaderNodeBevel")
    bevel.samples = 3
    bevel.inputs["Radius"].default_value = raggio
    if normale.is_linked:
        links.new(normale.links[0].from_socket, bevel.inputs["Normal"])
    links.new(bevel.outputs["Normal"], normale)


def vetro(materiale):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    # Per le lastre sottili: riflessione superficiale e trasparenza senza deformare il vano.
    chiaro, riflesso = nodi.new("ShaderNodeBsdfTransparent"), nodi.new("ShaderNodeMixShader")
    specchio = nodi.new("ShaderNodeBsdfGlossy")
    specchio.inputs["Color"].default_value = (.91, .96, .99, 1)
    chiaro.inputs["Color"].default_value = (.983, .991, .997, 1)
    specchio.inputs["Roughness"].default_value = .025
    fresnel = nodi.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.46
    limita = nodi.new("ShaderNodeMath")
    limita.operation = "MINIMUM"
    limita.inputs[1].default_value = .51
    links.new(fresnel.outputs[0], limita.inputs[0])
    links.new(limita.outputs[0], riflesso.inputs[0])
    links.new(chiaro.outputs[0], riflesso.inputs[1])
    links.new(specchio.outputs[0], riflesso.inputs[2])
    links.new(riflesso.outputs[0], nodi.get("Material Output").inputs["Surface"])


def trama_rete(materiale, coordinate, passo):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    shader = nodi.get("Principled BSDF")
    texture = nodi.new("ShaderNodeTexCoord")
    texture.object = coordinate
    pos, normale = (nodi.new("ShaderNodeSeparateXYZ") for _ in range(2))
    links.new(texture.outputs["Object"], pos.inputs[0])
    links.new(nodi.new("ShaderNodeNewGeometry").outputs["Normal"], normale.inputs[0])

    def math_node(op, a, b=None):
        nodo = nodi.new("ShaderNodeMath")
        nodo.operation = op
        for index, x in enumerate((a, b)):
            if isinstance(x, (int, float)):
                nodo.inputs[index].default_value = x
            elif x is not None:
                links.new(x, nodo.inputs[index])
        return nodo.outputs[0]

    fili = []
    for asse in "XYZ":
        fase = math_node("FRACT", math_node("MULTIPLY", pos.outputs[asse], 1 / passo))
        spessore = math_node("LESS_THAN", fase, .09)
        parallelo = math_node("LESS_THAN", math_node("ABSOLUTE", normale.outputs[asse]), .85)
        fili.append(math_node("MULTIPLY", spessore, parallelo))
    links.new(math_node("MAXIMUM", fili[0], math_node("MAXIMUM", fili[1], fili[2])), shader.inputs["Alpha"])


def piastrelle(materiale, coordinate, lato, segue_pareti=False):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    shader = nodi.get("Principled BSDF")
    base = shader.inputs["Base Color"].default_value[:3]
    texture = nodi.new("ShaderNodeTexCoord")
    texture.object = coordinate
    sorgente = texture.outputs["Object"]
    if segue_pareti:
        xyz, norm = (nodi.new("ShaderNodeSeparateXYZ") for _ in range(2))
        links.new(sorgente, xyz.inputs[0])
        links.new(nodi.new("ShaderNodeNewGeometry").outputs["True Normal"], norm.inputs[0])
        verticale = []
        for asse in ("X", "Z"):
            modulo = nodi.new("ShaderNodeMath")
            modulo.operation = "ABSOLUTE"
            links.new(norm.outputs[asse], modulo.inputs[0])
            soglia = nodi.new("ShaderNodeMath")
            soglia.operation = "GREATER_THAN"
            soglia.inputs[1].default_value = .7
            links.new(modulo.outputs[0], soglia.inputs[0])
            verticale.append(soglia.outputs[0])
        piano = nodi.new("ShaderNodeCombineXYZ")
        for i, (criterio, da, a) in enumerate(((verticale[0], "X", "Y"), (verticale[1], "Z", "Y"))):
            componente = nodi.new("ShaderNodeMix")
            componente.data_type = "FLOAT"
            links.new(criterio, componente.inputs[0])
            links.new(xyz.outputs[da], componente.inputs[2])
            links.new(xyz.outputs[a], componente.inputs[3])
            links.new(componente.outputs[0], piano.inputs[i])
        sorgente = piano.outputs[0]
    lastre = nodi.new("ShaderNodeTexBrick")
    lastre.offset = 0
    lastre.squash = 1
    lastre.inputs["Scale"].default_value = 1
    lastre.inputs["Brick Width"].default_value = lato
    lastre.inputs["Row Height"].default_value = lato
    lastre.inputs["Mortar Size"].default_value = .0014 if segue_pareti else .004
    lastre.inputs["Mortar Smooth"].default_value = .0006 if segue_pareti else .002
    for nome, fattore in (("Color1", .91), ("Color2", 1.06), ("Mortar", .43)):
        lastre.inputs[nome].default_value = (*[min(1, c * fattore) for c in base], 1)
    links.new(sorgente, lastre.inputs["Vector"])
    links.new(lastre.outputs["Color"], shader.inputs["Base Color"])
    rilievo = nodi.new("ShaderNodeBump")
    rilievo.invert = True
    rilievo.inputs["Distance"].default_value = .001 if segue_pareti else .003
    links.new(lastre.outputs["Fac"], rilievo.inputs["Height"])
    links.new(rilievo.outputs["Normal"], shader.inputs["Normal"])
    rugosita_micro(materiale, lastre.outputs["Fac"], .095)


def rilievo_campione(materiale, altezza):
    nodi, links = materiale.node_tree.nodes, materiale.node_tree.links
    shader = nodi.get("Principled BSDF")
    colore = shader.inputs["Base Color"]
    rilievo = nodi.new("ShaderNodeBump")
    rilievo.inputs["Distance"].default_value = altezza
    rilievo.inputs["Strength"].default_value = .27
    links.new(colore.links[0].from_socket, rilievo.inputs["Height"])
    links.new(rilievo.outputs["Normal"], shader.inputs["Normal"])
    rugosita_micro(materiale, colore.links[0].from_socket, .075)


def materiali(scena, interni):
    coordinate = bpy.data.objects.new("Coordinate metriche delle finiture", None)
    scena.collection.objects.link(coordinate)
    spigoli = {"laccato": .0015, "legno": .0016, "ceramica": .00135, "ceramica_smalto": .001,
               "quarzo": .0018, "piano_cucina": .0015, "telaio": .0012, "stipite": .0015, "inox": .00085}
    for materiale in list(bpy.data.materials):
        shader = materiale.node_tree.nodes.get("Principled BSDF") if materiale.use_nodes else None
        if not shader:
            continue
        chiave = materiale.get("chiave", "")
        if chiave.startswith("arredo:"):
            chiave = chiave.split(":")[1]
        elif chiave.startswith("piano_cucina:"):
            chiave = "piano_cucina"
        elif chiave.startswith("auto:"):
            parte = chiave.split(":")[2].lower()
            if parte == "carrozzeria":
                chiave = "carrozzeria"
            elif parte.startswith("vetro_"):
                chiave = "vetro_auto"
        trama = materiale.get("trama", "")
        if chiave == "vetro":
            vetro(materiale)
        elif chiave in ("rete", "recinzione"):
            trama_rete(materiale, coordinate, .075 if chiave == "rete" else .12)
        elif shader.inputs["Normal"].is_linked and shader.inputs["Roughness"].is_linked:
            if trama == "tessuto":
                shader.inputs["Sheen Weight"].default_value = .19
                shader.inputs["Sheen Roughness"].default_value = .55
        elif (trama.startswith(("rovere", "marmo")) or trama in ("pietra", "travertino")) and shader.inputs["Base Color"].is_linked:
            rilievo_campione(materiale, .0018 if trama in ("pietra", "travertino") else .0008)
        elif trama.startswith("facciata-") and shader.inputs["Base Color"].is_linked:
            rilievo_campione(materiale, .006 if trama in ("facciata-mattone", "facciata-pietra") else .0018)
        elif trama == "tessuto":
            variazione(materiale, coordinate, 190, .00075, .11, (1.6, 1.6, 1.05))
            shader.inputs["Sheen Weight"].default_value = .19
            shader.inputs["Sheen Roughness"].default_value = .55
        elif trama == "legno" or chiave in ("stipite",):
            variazione(materiale, coordinate, 32, .00125, .15, (2.4, .39, 2.4))
        elif chiave.startswith(("prato", "erba_sintetica")):
            variazione(materiale, coordinate, 36, .017, .43, (1.2, 1.2, .68))
        elif chiave.startswith("terra_rossa"):
            variazione(materiale, coordinate, 28, .01, .39)
        elif chiave == "ghiaia":
            variazione(materiale, coordinate, 84, .008, .29)
        elif chiave.startswith("resina"):
            variazione(materiale, coordinate, 42, .006, .24)
        elif trama in ("piastrelle", "cemento") or chiave in ("pavimento_piastrelle", "pavimento_gres", "pavimento_esterno", "marciapiede"):
            metri = materiale.get("metri", (.0, .0))
            piastrelle(materiale, coordinate, metri[0] / 2 if metri[0] else .55)
        elif chiave == "inox":
            variazione(materiale, coordinate, 260, .00012, .045, (.43, 2.0, 2.6))
            anisotropia = shader.inputs.get("Anisotropic IOR Level") or shader.inputs.get("Anisotropic")
            if anisotropia:
                anisotropia.default_value = .48
        elif chiave in ("quarzo", "piano_cucina", "davanzale"):
            variazione(materiale, coordinate, 118, .00038, .11)
        elif chiave == "laccato":
            variazione(materiale, coordinate, 144, .00013, .025)
            shader.inputs["Coat Weight"].default_value = .24
            shader.inputs["Coat Roughness"].default_value = .27
        elif chiave == "carrozzeria":
            shader.inputs["Coat Weight"].default_value = .62
            shader.inputs["Coat Roughness"].default_value = .11
        elif chiave == "vetro_auto":
            shader.inputs["Coat Weight"].default_value = .84
            shader.inputs["Coat Roughness"].default_value = .08
        elif chiave in ("ceramica", "ceramica_smalto"):
            shader.inputs["Coat Weight"].default_value = .20
            shader.inputs["Coat Roughness"].default_value = .19
        elif chiave.startswith("piscina_mosaico"):
            piastrelle(materiale, coordinate, .049, segue_pareti=True)
        elif chiave.startswith("acqua"):
            shader.inputs["Alpha"].default_value = 1
            shader.inputs["IOR"].default_value = 1.333
            shader.inputs["Transmission Weight"].default_value = 1
            shader.inputs["Base Color"].default_value = (.91, .98, .985, 1)
            variazione(materiale, coordinate, 3.8, .019, .045, (1.3, .82, .3))
        elif trama == "intonaco" or chiave in ("muro", "soffitto", "muro_nuovo", "pietra", "calcestruzzo", "asfalto", "tegole"):
            variazione(materiale, coordinate, 57, .0015, .062)
        if interni and chiave in spigoli:
            riflesso_spigoli(materiale, spigoli[chiave])
    return coordinate


def alberi_di_contesto(limiti):
    # Sagome oltre il lotto. Nessuna parte del fabbricato o del campo viene sostituita.
    xmin, xmax, _, ymax = limiti
    rng = random.Random(23)
    foglie = []
    for colore in ((.055, .105, .021, 1), (.079, .145, .032, 1), (.13, .19, .043, 1)):
        mat = bpy.data.materials.new("Foglie di contesto")
        mat.diffuse_color = colore
        foglie.append(mat)
    tronco = bpy.data.materials.new("Corteccia")
    tronco.diffuse_color = (.095, .058, .027, 1)
    passo = max(7, (xmax - xmin) / 7)
    for i in range(12):
        x = xmin - 2 * passo + i * passo + rng.uniform(-2, 2)
        y = ymax + rng.uniform(8, 19)
        h = rng.uniform(4.2, 7.6)
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=.18, radius2=.06, depth=h * .68, location=(x, y, h * .34))
        bpy.context.object.data.materials.append(tronco)
        for j in range(13):
            a = j * 2.4
            r = rng.uniform(.22, .5) * h if j < 9 else rng.uniform(.05, .20) * h
            q = (x + r * .64 * math.cos(a), y + r * .51 * math.sin(a), h * rng.uniform(.59, .88))
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=q)
            chioma = bpy.context.object
            for v in chioma.data.vertices:
                v.co *= rng.uniform(.82, 1.15)
            misura = h * rng.uniform(.17, .25)
            chioma.scale = (misura * 1.06, misura, misura * rng.uniform(1, 1.36))
            chioma.data.materials.append(foglie[j % len(foglie)])
            for faccia in chioma.data.polygons:
                faccia.use_smooth = True


def luce_area(scena, nome, posizione, direzione, energia, misura, colore, rotazione=None):
    dati = bpy.data.lights.new(nome, "AREA")
    dati.energy, dati.size = energia, misura
    dati.color = colore
    luce = bpy.data.objects.new(nome, dati)
    scena.collection.objects.link(luce)
    luce.location = posizione
    luce.rotation_euler = direzione.to_track_quat("-Z", "Y").to_euler() if rotazione is None else rotazione
    # Queste sorgenti compensano la luce diffusa. Vetro e specchi vedono la scena.
    dati.specular_factor = 0
    luce.visible_glossy = False
    luce.visible_transmission = False
    return dati


def finestre_della_vista(scena):
    occhio = scena.camera.location
    depsgraph = bpy.context.evaluated_depsgraph_get()
    finestre = []
    for v in scena.objects:
        if v.type != "MESH" or v.get("genere") != "vetro" or not v.get("id", "").rsplit("/", 1)[-1].startswith("vetro:"):
            continue
        punti = [v.matrix_world @ p.co for p in v.data.vertices]
        bordi = [punti[b] - punti[a] for a, b in (e.vertices for e in v.data.edges)]
        asse = max((e for e in bordi if abs(e.z) < .002), key=lambda e: e.length_squared, default=None)
        if asse is None or asse.length < .08:
            continue
        asse.normalize()
        normale = Vector((-asse.y, asse.x, 0))
        lungo = [p.dot(asse) for p in punti]
        traverso = [p.dot(normale) for p in punti]
        quote = [p.z for p in punti]
        larghezza, altezza = max(lungo) - min(lungo), max(quote) - min(quote)
        if min(larghezza, altezza) < .3:
            continue
        centro = asse * ((max(lungo) + min(lungo)) / 2) + normale * ((max(traverso) + min(traverso)) / 2)
        centro.z = (max(quote) + min(quote)) / 2
        if (occhio - centro).dot(normale) < 0:
            normale.negate()
        distacco = (max(traverso) - min(traverso)) / 2 + .035
        lato_interno = centro + normale * distacco
        lato_esterno = centro - normale * distacco
        # Una finestra dietro un muro non deve schiarire la stanza della camera.
        for scarto in (0, -.25, .25):
            punto = lato_interno + asse * (scarto * larghezza) + Vector((0, 0, altezza * .22))
            raggio = punto - occhio
            if raggio.length <= .06 or scena.ray_cast(depsgraph, occhio, raggio.normalized(), distance=raggio.length - .05)[0]:
                continue
            # Il lato opposto al locale deve avere almeno una direzione libera verso il cielo.
            # Un vetro interno o dietro una chiusura opaca non riceve luce artificiale dal serramento.
            da_fuori = lato_esterno + asse * (scarto * larghezza)
            direzioni = [(-normale + Vector((0, 0, alzata))).normalized() for alzata in (.12, .45)]
            if any(not scena.ray_cast(depsgraph, da_fuori, d, distance=35)[0] for d in direzioni):
                finestre.append((raggio.length, lato_interno, normale, asse, larghezza, altezza))
                break
    return sorted(finestre, key=lambda v: v[0])[:3]


def luci_profili(scena):
    # Una luce rettangolare sotto il profilo illumina il piano o il pavimento.
    for profilo in tuple(scena.objects):
        if profilo.type != "MESH" or not profilo.get("id", "").endswith(":luce_calda"):
            continue
        vertici = [profilo.matrix_world @ v.co for v in profilo.data.vertices]
        bordi = [vertici[b] - vertici[a] for a, b in (e.vertices for e in profilo.data.edges)]
        centro = Vector(((min(p.x for p in vertici) + max(p.x for p in vertici)) / 2,
                         (min(p.y for p in vertici) + max(p.y for p in vertici)) / 2,
                         min(p.z for p in vertici) - .008))
        asse = max((d for d in bordi if abs(d.z) < .002), key=lambda d: d.length_squared, default=None)
        if asse is None or asse.length < .05:
            continue
        dati = luce_area(scena, "Luce del profilo LED", centro, Vector((0, 0, -1)), 23 * asse.length,
                         asse.length, (1, .72, .49), (0, 0, math.atan2(asse.y, asse.x)))
        dati.shape = "RECTANGLE"
        dati.size_y = .035


def luci_interni(scena, finestre, ora):
    for _, posizione, normale, asse, larghezza, altezza in finestre:
        avanti = normale + Vector((0, 0, -.12))
        energia = larghezza * altezza * {"giorno": 35, "diffusa": 54, "sera": 12}[ora]
        dati = luce_area(scena, "Luce diffusa dal serramento", posizione, avanti, energia, larghezza * .86,
                        (.78, .86, 1) if ora == "sera" else (.92, .96, 1))
        dati.shape = "RECTANGLE"
        dati.size_y = altezza * .86
    if finestre and ora != "sera":
        return
    # Luce d'ambiente morbida dall'alto per i locali ciechi e le viste serali.
    camera = scena.camera
    posizione = camera.location + Vector((0, 0, .39))
    sguardo = camera.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    luce_area(scena, "Luce interna diffusa", posizione, Vector((sguardo.x * .25, sguardo.y * .25, -1)),
              152 if ora == "sera" else 126, .82, (1, .85, .68) if ora == "sera" else (1, .96, .90))


def terreno_contesto(scena, centro, lato):
    margini = (centro.x - lato / 2, centro.y - lato / 2, centro.x + lato / 2, centro.y + lato / 2)
    locale = next((o for o in scena.objects if o.type == "MESH" and o.get("id") == "terreno"), None)
    quota = -.205
    if locale is None:
        pezzi = [margini]
    else:
        punti = [locale.matrix_world @ Vector(c) for c in locale.bound_box]
        quota = min(p.z for p in punti)
        x0, x1 = min(p.x for p in punti), max(p.x for p in punti)
        y0, y1 = min(p.y for p in punti), max(p.y for p in punti)
        u0, v0, u1, v1 = margini
        # Il contesto circonda il terreno della pianta. La vasca resta libera fino al fondo.
        pezzi = [(u0, v0, x0, v1), (x1, v0, u1, v1), (x0, v0, x1, y0), (x0, y1, x1, v1)]
    vertici, facce = [], []
    for x0, y0, x1, y1 in pezzi:
        i = len(vertici)
        vertici.extend([(x0, y0, quota), (x1, y0, quota), (x1, y1, quota), (x0, y1, quota)])
        facce.append((i, i + 1, i + 2, i + 3))
    dati = bpy.data.meshes.new("Estensione del terreno")
    dati.from_pydata(vertici, [], facce)
    oggetto = bpy.data.objects.new(dati.name, dati)
    scena.collection.objects.link(oggetto)
    if locale and locale.data.materials:
        dati.materials.append(locale.data.materials[0])
    return dati


def cielo_diffuso(nodi, links, fondo, ora):
    coordinate = nodi.new("ShaderNodeTexCoord")
    quota = nodi.new("ShaderNodeSeparateXYZ")
    links.new(coordinate.outputs["Normal"], quota.inputs["Vector"])
    valore = nodi.new("ShaderNodeMath")
    valore.operation = "MULTIPLY_ADD"
    valore.inputs[1].default_value = -.5
    valore.inputs[2].default_value = .5
    links.new(quota.outputs["Z"], valore.inputs[0])
    orizzonte = nodi.new("ShaderNodeValToRGB")
    orizzonte.color_ramp.interpolation = "EASE"
    if ora == "sera":
        colori = [(0, (.035, .046, .053)), (.43, (.09, .135, .18)), (.52, (.38, .32, .38)), (.68, (.15, .23, .40)), (1, (.07, .115, .26))]
    else:
        colori = [(0, (.20, .26, .21)), (.42, (.37, .44, .37)), (.51, (.92, .95, .99)), (.68, (.53, .70, .91)), (1, (.40, .57, .84))]
    estremi = orizzonte.color_ramp.elements
    estremi[0].color = (*colori[0][1], 1)
    estremi[1].color = (*colori[-1][1], 1)
    for posizione, colore in colori[1:-1]:
        estremi.new(posizione).color = (*colore, 1)
    links.new(valore.outputs[0], orizzonte.inputs["Fac"])
    # Il cielo visibile e i riflessi possono avere un orizzonte senza cambiare l'esposizione della stanza.
    raggi = nodi.new("ShaderNodeLightPath")
    visibili = nodi.new("ShaderNodeMath")
    visibili.operation = "MAXIMUM"
    links.new(raggi.outputs["Is Camera Ray"], visibili.inputs[0])
    links.new(raggi.outputs["Is Glossy Ray"], visibili.inputs[1])
    sfondo = nodi.new("ShaderNodeMixRGB")
    sfondo.inputs[1].default_value = fondo.inputs["Color"].default_value[:]
    links.new(visibili.outputs[0], sfondo.inputs["Fac"])
    panorama = Path(__file__).with_name("ambiente-cortile.exr")
    if ora == "diffusa" and panorama.is_file():
        foto = nodi.new("ShaderNodeTexEnvironment")
        foto.image = bpy.data.images.load(str(panorama), check_existing=True)
        links.new(foto.outputs["Color"], sfondo.inputs[2])
    else:
        links.new(orizzonte.outputs["Color"], sfondo.inputs[2])
    links.new(sfondo.outputs["Color"], fondo.inputs["Color"])


def ambiente(scena, tipo, coordinate, inquadratura, ora, con_alberi, sole_progetto=None):
    scena.world = bpy.data.worlds.new("Luce ambientale")
    scena.world.use_nodes = True
    nodi, links = scena.world.node_tree.nodes, scena.world.node_tree.links
    fondo = nodi.get("Background")
    esterno = tipo in ("sport", "facciata")
    finestre = finestre_della_vista(scena) if tipo == "interni" else []
    direzione = Vector((.43, .69, -.88))
    if sole_progetto is not None:
        direzione = -da_gltf(sole_progetto).normalized()
    elif finestre:
        _, _, normale, asse, _, _ = finestre[0]
        direzione = normale * .83 + asse * .32 + Vector((0, 0, -.57))
    if ora in ("diffusa", "sera") or tipo == "tecnico":
        fondo.inputs["Color"].default_value = (.16, .225, .37, 1) if ora == "sera" else (.72, .8, .91, 1)
        fondo.inputs["Strength"].default_value = .28 if ora == "sera" else .77
        if tipo != "tecnico":
            cielo_diffuso(nodi, links, fondo, ora)
            # La luce indiretta ha colore uniforme. Il cielo visibile non richiede una mappa di importanza.
            scena.world.cycles.sampling_method = "NONE"
    else:
        cielo = nodi.new("ShaderNodeTexSky")
        cielo.sky_type = "NISHITA"
        cielo.sun_disc = False
        cielo.sun_elevation = math.atan2(-direzione.z, math.hypot(direzione.x, direzione.y))
        cielo.sun_rotation = math.atan2(-direzione.y, -direzione.x)
        cielo.dust_density = .45
        links.new(cielo.outputs["Color"], fondo.inputs["Color"])
        fondo.inputs["Strength"].default_value = .25 if esterno else .31
    if esterno:
        ingombri = [o.matrix_world @ Vector(p) for o in scena.objects if o.type == "MESH" for p in o.bound_box]
        limiti = (min(p.x for p in ingombri), max(p.x for p in ingombri), min(p.y for p in ingombri), max(p.y for p in ingombri))
        centro = da_gltf(inquadratura["guarda"])
        distanza = (scena.camera.location - centro).length
        lato = max(600, (limiti[1] - limiti[0]) * 6, (limiti[3] - limiti[2]) * 6, distanza * 8)
        scena.camera.data.clip_end = lato * 2
        terreno = terreno_contesto(scena, centro, lato)
        if not terreno.materials:
            suolo = bpy.data.materials.new("Terreno di contesto")
            suolo.use_nodes = True
            shader = suolo.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Base Color"].default_value = (.10, .15, .052, 1)
            shader.inputs["Roughness"].default_value = .98
            variazione(suolo, coordinate, .34, .014, .48)
            terreno.materials.append(suolo)
        if con_alberi:
            alberi_di_contesto(limiti)
    luce = bpy.data.lights.new("Sole", "SUN")
    luce.energy = {"giorno": 2.75 if esterno else 1.85, "diffusa": 1.05 if esterno else .32, "sera": .12}[ora]
    luce.color = (1, .78, .57) if ora == "sera" else (1, .94, .83) if ora == "giorno" else (.87, .93, 1)
    luce.angle = math.radians(16 if ora == "diffusa" else 3.2)
    sole = bpy.data.objects.new(luce.name, luce)
    scena.collection.objects.link(sole)
    sole.rotation_euler = direzione.to_track_quat("-Z", "Y").to_euler()
    if tipo == "interni" or (esterno and ora == "sera"):
        luci_profili(scena)
    if tipo == "interni":
        luci_interni(scena, finestre, ora)


def imposta_dispositivo(scena):
    scena.cycles.device = "CPU"
    if os.environ.get("PLANIMETRIE_CYCLES_DEVICE") != "METAL":
        return
    preferenze = bpy.context.preferences.addons["cycles"].preferences
    preferenze.compute_device_type = "METAL"
    preferenze.refresh_devices()
    metallo = [device for device in preferenze.devices if device.type == "METAL"]
    if not metallo:
        return
    for device in preferenze.devices:
        device.use = device in metallo
    scena.cycles.device = "GPU"
    print("Cycles · Metal:", ", ".join(device.name for device in metallo), flush=True)


def render(modello, parametri, uscita):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(modello), merge_vertices=False)
    scena = bpy.context.scene
    bpy.context.view_layer.update()
    verifica_geometria(modello, scena.objects)
    copertura_senza_facce_coincidenti(scena)
    larghezza, altezza = parametri["larghezza"], parametri["altezza"]
    imposta_camera(scena, parametri["telecamera"], larghezza / altezza)
    ora = parametri.get("luce", "giorno")
    alta = parametri.get("qualita") == "alta"
    interni = parametri["ambiente"] == "interni"
    ambiente(scena, parametri["ambiente"], materiali(scena, interni), parametri["telecamera"], ora,
             parametri.get("alberi", True), parametri.get("sole"))
    scena.render.engine = "CYCLES"
    imposta_dispositivo(scena)
    scena.cycles.use_adaptive_sampling = True
    scena.cycles.samples = 80 if alta else 36
    scena.cycles.adaptive_threshold = .026 if alta else .042
    scena.cycles.adaptive_min_samples = 10 if alta else 8
    # Lascia tempo al denoise, che si aggiunge al campionamento su CPU.
    scena.cycles.time_limit = 135 if alta else 90
    scena.cycles.use_denoising = True
    scena.cycles.max_bounces = 8 if alta else 7
    scena.cycles.transparent_max_bounces = 12
    scena.view_settings.view_transform = "AgX"
    if interni:
        scena.view_settings.look = "AgX - Medium High Contrast"
    scena.view_settings.exposure = .22 if interni else .03
    scena.render.resolution_x, scena.render.resolution_y = larghezza, altezza
    scena.render.resolution_percentage = 100
    scena.render.image_settings.file_format = "PNG"
    scena.render.filepath = str(uscita)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    modello, camera, uscita = map(Path, sys.argv[sys.argv.index("--") + 1:])
    render(modello, json.loads(camera.read_text()), uscita)
