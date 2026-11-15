"""Builds raw per-layer GLB files + manifest from the open source datasets.

World space: the BodyParts3D body (one individual), unmodified. The SPL-PNL brain atlas
(another individual, far more detailed) is fitted into that body's cranial cavity with an
affine transform estimated on homologous structures, so the SPL meshes are flagged
`registration: "affine-approx"` in the manifest and the body meshes `native`.

glTF axes: +X = subject LEFT, +Y = superior, +Z = anterior; units = metres.
"""
import collections, csv, glob, json, os, re, sys
import numpy as np
import trimesh
from meshio_lite import read_obj, read_vtk_polydata

HERE = os.path.dirname(os.path.abspath(__file__))
SPL = os.path.join(HERE, ".cache/spl-brain-atlas")
BP = os.path.join(HERE, ".cache/bodyparts3d")
OUT = os.path.join(HERE, "build/raw")

ATTRIB = {
    "spl": {
        "name": "SPL-PNL Brain Atlas (Open Anatomy Project)",
        "license": "3D Slicer License",
        "licenseUrl": "https://github.com/Slicer/Slicer/blob/main/License.txt",
        "url": "https://github.com/mhalle/spl-brain-atlas",
        "attribution": "Halle M. et al., SPL-PNL Brain Atlas, Surgical Planning Laboratory / Psychiatry Neuroimaging Laboratory, Brigham and Women's Hospital, Harvard Medical School.",
    },
    "zanatomy": {
        "name": "Z-Anatomy",
        "license": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "url": "https://github.com/LluisV/Z-Anatomy",
        "attribution": "Z-Anatomy (Gauthier Kervyn, Lluís Vinent et al.), derived from BodyParts3D, licensed under CC BY-SA 4.0. Meshes repositioned and simplified for NeuroAtlas.",
    },
    "bp3d": {
        "name": "BodyParts3D 4.0",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
        "attribution": "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
    },
}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def split_side(label):
    """'left precentral gyrus' -> ('precentral gyrus', 'L'); handles 'X of left Y' too."""
    for word, side in (("left", "L"), ("right", "R")):
        if re.search(rf"\b{word}\b", label):
            base = re.sub(rf"\b{word}\b[ -]?", "", label)
            return re.sub(r"\s+", " ", base).strip(), side
    return label, "M"


# ---------- SPL-PNL ----------
def spl_layer(value, label):
    if value == 3 or 4000 <= value < 5000:
        return None  # skin, muscles, eyeballs: outside the scope of the atlas
    if 5000 <= value < 6000:
        return "sulci"
    if 1000 <= value < 3000:
        return "cortex"
    if 300 <= value < 380 or "cerebell" in label:
        return "cerebellum"
    if "ventricle" in label or "aqueduct" in label:
        return "ventricles"
    if re.search(r"optic (nerve|tract|chiasm)", label):
        return "cranial-nerves"
    if re.search(r"hippocampus|amygdala|fornix|mammillothalamic", label):
        return "limbic"
    if re.search(r"caudate|putamen|pallidus|accumbens|claustrum", label):
        return "basal-ganglia"
    if re.search(r"thalam|geniculate|pulvinar|medullary lamina|mammillary|pineal|hypophysis|subthalamic", label):
        return "diencephalon"
    if re.search(r"pons|medulla|midbrain|colliculus|nigra|red nucleus", label):
        return "brainstem"
    if re.search(r"white matter|callosum|commissure|septum", label):
        return "white-matter"
    raise ValueError(f"unclassified SPL label {value} {label}")


def load_spl():
    colors = {}
    with open(os.path.join(SPL, "labelinfo/hncma-atlas-lut.tsv")) as fh:
        for row in list(csv.reader(fh, delimiter="\t"))[1:]:
            nums = [float(x) for x in re.findall(r"[\d.]+", row[2])]
            colors[int(row[0])] = [n / 255 for n in nums[:3]]
    items = []
    for path in sorted(glob.glob(os.path.join(SPL, "slicer/models/*.vtk"))):
        m = re.match(r"Model_(\d+)_(.+)\.vtk", os.path.basename(path))
        value, label = int(m.group(1)), m.group(2).replace("_", " ")
        label = re.sub(r"^(left|right)-", r"\1 cerebellar lobule ", label) if 300 <= value < 370 else label.replace("-", " ")
        layer = spl_layer(value, label)
        if not layer:
            continue
        v, f = read_vtk_polydata(path)
        v = np.column_stack([-v[:, 0], v[:, 2], v[:, 1]])  # RAS -> glTF (L,S,A)
        base, side = split_side(label)
        items.append(dict(source="spl", sourceId=f"label {value}", label=label, base=base, side=side,
                          layer=layer, color=colors.get(value, [0.8, 0.8, 0.8]), v=v, f=f, registration="affine-approx"))
    return items


# ---------- BodyParts3D ----------
BP_PICK = [  # (regex on most-specific concept name, layer)
    (r"(cerebral|cerebellar|communicating|basilar|choroidal|pontine|callosomarginal|pericallosal|thalamo\w+|vertebral|internal carotid|ophthalmic|spinal|frontobasal|prefrontal|parietal|temporal|occipital|splenial) artery"
     r"|artery of .*central sulcus|branch of .*(cerebral|cerebellar|pontine|callosomarginal|pericallosal|communicating|occipital) artery", "vessels"),
    (r"tentorium cerebelli|region of dura mater", "meninges"),
    (r"internal capsule$|peduncle of midbrain|posterior commissure|habenula|lamina terminalis", "white-matter"),
    (r"choroid plexus", "ventricles"),
]
BP_SKIP = r"hepatic|coronary|common carotid|vein|nasociliary|capsule of|superficial temporal|deep temporal|occipital artery$(?<!lateral occipital artery)(?<!medial occipital artery)"
BP_SURFACE = r"gyrus|occipital lobe|parietal lobule|cerebellum|^pons$|medulla oblongata|insula$"  # used for ICP refinement
BP_COLORS = {"vessels": [0.78, 0.12, 0.12], "cranial-nerves": [0.95, 0.82, 0.25], "meninges": [0.75, 0.72, 0.68],
             "white-matter": [0.93, 0.93, 0.88], "ventricles": [0.75, 0.3, 0.45]}
# Whole body: (layer, regex on the concept name or any of its IS-A ancestors). First match wins.
BODY_RULES = [
    ("body-skin", r"^skin$|integument|^hair of|pubic hair|eyebrow"),
    ("body-muscles", r"muscle organ|^muscle|trapezius|interossei|lumbricals|levatores|intertransversarii|interspinales|raphe$"),
    ("body-skeleton", r"bone organ|^bone$|cartilage organ|^cartilage|vertebra|tooth|sternum|xiphoid"),
    ("body-ligaments", r"ligament|tendon|tendinous|fascia|membrane organ|joint|interosseous membrane|linea alba"),
    ("body-heart", r"^heart$|cardiac|region of heart|wall of heart|heart|papillary muscle|coronary"),
    ("body-arteries", r"^artery$|arterial|^systemic artery|aorta|arter(y|ies)"),
    ("body-veins", r"^vein$|venous|^systemic vein|portal|veins?$"),
    ("body-nerves", r"^nerve$|ganglion|spinal cord|nerve|plexus"),
    ("body-respiratory", r"\blung|trachea|bronch|larynx|respiratory|nasal cavity|\bnose\b"),
    ("body-digestive", r"esophag|stomach|intestin|liver|pancrea|gallbladder|bil(e|iary)|tongue|pharynx|salivary|digestive|alimentary|colon|rectum|duoden|\boral\b|gland of mouth|appendix|ileocecal|taenia|gingiva|^lip$|cystic duct|jejun|ileum"),
    ("body-urogenital", r"kidney|ureter|bladder|urethra|prostate|testis|genital|reproductive|urinary|penis|scrot|seminal|epididym|deferen"),
    ("body-endocrine", r"thyroid|adrenal|spleen|thymus|lymph|endocrine"),
    ("body-sense", r"\beye|\bear\b|cochlea|\bretina\b|\blens\b|cornea|sclera|auditory|\borbit|lacrimal|vitreous|ossicle|choroid$|chamber of|\biris\b|ciliaris|external ear"),
]
BODY_COLORS = {"body-skin": [0.86, 0.68, 0.56], "body-muscles": [0.62, 0.22, 0.2], "body-skeleton": [0.9, 0.86, 0.74],
               "body-ligaments": [0.82, 0.8, 0.72], "body-heart": [0.7, 0.16, 0.2], "body-arteries": [0.8, 0.12, 0.12],
               "body-veins": [0.2, 0.3, 0.7], "body-nerves": [0.93, 0.8, 0.25], "body-respiratory": [0.85, 0.6, 0.62],
               "body-digestive": [0.76, 0.5, 0.36], "body-urogenital": [0.6, 0.38, 0.5], "body-endocrine": [0.55, 0.45, 0.7],
               "body-sense": [0.55, 0.7, 0.8]}


def jitter(color, key):
    """Small deterministic per-structure variation so that neighbours can be told apart."""
    h = sum(ord(c) * (i + 7) for i, c in enumerate(key))
    return [min(1.0, max(0.0, c + (((h >> (4 * i)) % 17) - 8) * 0.012)) for i, c in enumerate(color)]


# Whole-organ surfaces that BodyParts3D 4.0 lacks (it only has their bronchi/vessels), taken from release 3.0.
# The two releases are posed slightly differently (about 2 cm in height around the trunk), so each group is shifted
# by the median displacement of nearby structures present in both releases.
# (landmark concepts, [(3.0 file id, label, layer)])
SUPPLEMENTS = [
    (['trachea', 'body of sternum', 'left first rib', 'first thoracic vertebra', 'seventh thoracic vertebra', 'right clavicle', 'left clavicle', 'right scapula', 'left scapula'],
     [("FMA7333", "upper lobe of right lung", "body-respiratory"), ("FMA7383", "middle lobe of right lung", "body-respiratory"),
      ("FMA7337", "lower lobe of right lung", "body-respiratory"), ("FMA7370", "upper lobe of left lung", "body-respiratory"),
      ("FMA7371", "lower lobe of left lung", "body-respiratory")]),
    (['stomach', 'spleen', 'gallbladder', 'right kidney', 'left kidney', 'first lumbar vertebra', 'right twelfth rib'],
     [("FMA7197", "liver", "body-digestive")]),
]
V3 = os.path.join(HERE, ".cache/bodyparts3d_v3")


# homologous structures used to fit BodyParts3D -> SPL space: (BP3D concept, SPL label)
PAIRS = [(f"{s} {n}", f"{s} {m}") for s in ("left", "right") for n, m in [
    ("caudate nucleus", "caudate nucleus"), ("putamen", "putamen"), ("hippocampus", "hippocampus"),
    ("amygdala", "amygdala"), ("superior colliculus", "superior colliculus"), ("inferior colliculus", "inferior colliculus"),
    ("insula", "insula"), ("precentral gyrus", "precentral gyrus"), ("postcentral gyrus", "postcentral gyrus"),
    ("lateral ventricle", "lateral ventricle"), ("fornix of forebrain", "fornix of forebrain"),
    ("fusiform gyrus", "fusiform gyrus"), ("superior frontal gyrus", "superior frontal gyrus"),
    ("optic tract", "optic tract")]] + [
    ("pons", "pons"), ("medulla oblongata", "medulla oblongata"), ("pineal body", "pineal body"),
    ("optic chiasm", "optic chiasm"), ("third ventricle", "third ventricle"), ("fourth ventricle", "fourth ventricle"),
    ("corpus callosum", "corpus callosum"), ("anterior commissure", "anterior commissure")]


def load_bp(spl_items):
    def rows(name):
        with open(os.path.join(BP, name), encoding="utf-8") as fh:
            return list(csv.reader(fh, delimiter="\t"))[1:]
    name = {r[0]: r[2] for r in rows("isa_parts_list_e.txt")}
    els = collections.defaultdict(set)
    for r in rows("isa_element_parts.txt"):
        els[r[0]].add(r[2])
    has_kids = {r[0] for r in rows("isa_inclusion_relation_list.txt")}
    by_name = {n: c for c, n in name.items()}
    cache = {}

    def mesh(e):
        if e not in cache:
            cache[e] = read_obj(os.path.join(BP, "isa_BP3D_4.0_obj_99", e + ".obj"))
        return cache[e]

    # --- registration (affine least squares on centroids of homologous structures) ---
    spl_c = {i["label"]: i["v"].mean(0) for i in spl_items}
    src, dst, used_lm = [], [], []
    for bpn, spn in PAIRS:
        if bpn in by_name and spn in spl_c and els[by_name[bpn]]:
            src.append(np.vstack([mesh(e)[0] for e in els[by_name[bpn]]]).mean(0)); dst.append(spl_c[spn] * 1.0); used_lm.append(bpn)
    src, dst = np.array(src), np.array(dst)
    A, *_ = np.linalg.lstsq(np.column_stack([src, np.ones(len(src))]), dst, rcond=None)
    resid = np.linalg.norm(np.column_stack([src, np.ones(len(src))]) @ A - dst, axis=1)
    det = float(np.linalg.det(A[:3]))
    reg = dict(method="affine least squares on centroids of homologous structures", landmarks=len(used_lm),
               rmsMm=float(np.sqrt((resid ** 2).mean())), maxMm=float(resid.max()), worst=used_lm[int(resid.argmax())],
               determinant=det, matrix=A.tolist())
    print(f"registration: {len(used_lm)} landmarks, RMS {reg['rmsMm']:.2f} mm, max {reg['maxMm']:.2f} mm ({reg['worst']}), det {det:.3f}")

    # --- refinement: trimmed affine ICP of the BodyParts3D brain surface onto the SPL brain surface ---
    from scipy.spatial import cKDTree
    rng = np.random.default_rng(0)
    surf_el = sorted(set().union(*[els[c] for c, n in name.items() if re.search(BP_SURFACE, n)]))
    P = np.vstack([mesh(e)[0] for e in surf_el]); P = P[rng.choice(len(P), min(40000, len(P)), replace=False)]
    T = np.vstack([i["v"] for i in spl_items if i["layer"] in ("cortex", "cerebellum", "brainstem")])
    T = T[rng.choice(len(T), min(200000, len(T)), replace=False)]; tree = cKDTree(T)
    Ph = np.column_stack([P, np.ones(len(P))])
    for it in range(40):
        d, idx = tree.query(Ph @ A)
        keep = d <= np.quantile(d, 0.9)
        A, *_ = np.linalg.lstsq(Ph[keep], T[idx[keep]], rcond=None)
    d, _ = tree.query(Ph @ A)
    det = float(np.linalg.det(A[:3]))
    lm = np.linalg.norm(np.column_stack([src, np.ones(len(src))]) @ A - dst, axis=1)
    reg.update(method="affine: least squares on centroids of homologous structures, refined by trimmed ICP of brain surfaces",
               surfaceMedianMm=float(np.median(d)), surfaceP90Mm=float(np.quantile(d, 0.9)),
               landmarkRmsAfterIcpMm=float(np.sqrt((lm ** 2).mean())), determinant=det, matrix=A.tolist())
    print(f"after ICP: surface median {reg['surfaceMedianMm']:.2f} mm, p90 {reg['surfaceP90Mm']:.2f} mm, landmark RMS {reg['landmarkRmsAfterIcpMm']:.2f} mm, det {det:.3f}")

    # --- most specific concept for each element, then pick by name ---
    best = {}
    for c, es in els.items():
        for e in es:
            key = (len(es), c in has_kids)
            if e not in best or key < best[e][0]:
                best[e] = (key, c)
    groups = collections.defaultdict(list)
    for e, (_, c) in best.items():
        groups[c].append(e)
    items, used = [], set()
    for c, es in sorted(groups.items(), key=lambda kv: name[kv[0]]):
        n = name[c]
        if re.search(BP_SKIP, n):
            continue
        layer = next((l for rx, l in BP_PICK if re.search(rx, n)), None)
        if not layer:
            continue
        vs, fs, off = [], [], 0
        for e in sorted(es):
            v, f = mesh(e)
            vs.append(v); fs.append(f + off); off += len(v)
        v, f = np.vstack(vs), np.vstack(fs)
        used.update(es)
        label = "tentorium cerebelli" if n == "region of dura mater" else n
        base, side = split_side(label)
        items.append(dict(source="bp3d", sourceId=f"{c} ({', '.join(sorted(es))})", label=label, base=base, side=side,
                          layer=layer, color=BP_COLORS[layer], v=v, f=f, registration="native"))

    # --- the rest of the body: everything not in the brain and not already used ---
    brain_els = {r[2] for r in rows("partof_element_parts.txt") if r[1] == "brain"}
    parents = collections.defaultdict(set)
    for r in rows("isa_inclusion_relation_list.txt"):
        parents[r[2]].add(r[0])

    def ancestors(c, seen):
        for p in parents.get(c, ()):
            if p not in seen:
                seen.add(p); ancestors(p, seen)
        return seen

    skipped = []
    for c, es in sorted(groups.items(), key=lambda kv: name[kv[0]]):
        es = [e for e in es if e not in used and e not in brain_els]
        if not es:
            continue
        if re.search(r"amygdala|optic (chiasm|nerve|tract)|gyrus|hypothalamus|pituitary|pineal", name[c]):
            continue  # already provided, in more detail, by the brain atlas
        names = [name[c]] + [name[a] for a in ancestors(c, set())]
        layer = next((l for l, rx in BODY_RULES if any(re.search(rx, n) for n in names)), None)
        if not layer:
            skipped.append(name[c]); continue
        vs, fs, off = [], [], 0
        for e in sorted(es):
            v, f = mesh(e)
            vs.append(v); fs.append(f + off); off += len(v)
        base, side = split_side(name[c])
        items.append(dict(source="bp3d", sourceId=f"{c} ({', '.join(sorted(es))})", label=name[c], base=base, side=side,
                          layer=layer, color=jitter(BODY_COLORS[layer], base), v=np.vstack(vs), f=np.vstack(fs), registration="native"))
    for landmarks, parts in SUPPLEMENTS:
        deltas = []
        for lm in landmarks:
            old = trimesh.load(os.path.join(V3, by_name[lm] + ".stl")).bounds
            new = np.vstack([mesh(e)[0] for e in els[by_name[lm]]])
            deltas += [new.min(0) - old[0], new.max(0) - old[1]]
        deltas = np.array(deltas)
        shift = np.median(deltas, axis=0)
        spread = np.median(np.abs(deltas - shift), axis=0)
        print(f"supplement {parts[0][1]}...: shift {shift.round(1).tolist()} mm, median abs deviation {spread.round(1).tolist()} mm")
        for fid, label, layer in parts:
            m = trimesh.load(os.path.join(V3, fid + ".stl"))
            base, side = split_side(label)
            items.append(dict(source="bp3d", sourceId=f"{fid} (BodyParts3D 3.0)", label=label, base=base, side=side, layer=layer,
                              color=jitter([0.5, 0.26, 0.2] if label == "liver" else BODY_COLORS[layer], base),
                              v=np.asarray(m.vertices, dtype=np.float64) + shift, f=np.asarray(m.faces), registration="affine-approx"))
    print("body: unclassified, skipped:", "; ".join(skipped) or "none")
    return items, reg, A


# ---------- Z-Anatomy (nervous system) ----------
ZA = os.path.join(HERE, ".cache/z-anatomy")
ZA_COLORS = {"cranial-nerves": [0.95, 0.82, 0.25], "body-nerves": [0.93, 0.8, 0.25], "body-spinal-cord": [0.86, 0.8, 0.62],
             "meninges": [0.75, 0.72, 0.68]}


def za_sides(names):
    """Z-Anatomy marks sides with a trailing l / r glued to the name; only trust it when the twin exists."""
    names = set(names)
    out = {}
    for n in names:
        if n.endswith("l") and n[:-1] + "r" in names:
            out[n] = (n[:-1], "L")
        elif n.endswith("r") and n[:-1] + "l" in names:
            out[n] = (n[:-1], "R")
        elif n + "l" in names and n + "r" not in names:
            out[n] = (n, "R")  # a right-side mesh that lost its suffix in the source
        elif n.endswith("l") and n[:-1] in names and n[:-1] + "r" not in names:
            out[n] = (n[:-1], "L")
        else:
            out[n] = (n, "M")
    return out


def load_zanatomy(bp_items):
    """Peripheral and cranial nerves, spinal cord, falx and spinal dura from Z-Anatomy, warped onto the BodyParts3D body.

    Z-Anatomy re-posed the BodyParts3D body, so a single affine leaves about 1 cm of error. After the global affine
    (fitted on the bones the two skeletons share) the remaining displacement of each bone is interpolated to the
    nerve vertices (inverse-distance weighting over the nearest bone landmarks), so that nerves follow the bones.
    """
    from scipy.spatial import cKDTree
    def meta(name):
        with open(os.path.join(ZA, name + ".json")) as fh:
            return {m["name"]: m for m in json.load(fh)}
    skel, nerv = meta("SkeletalSystem100"), meta("NervousSystem100")
    bones = {}
    for it in bp_items:
        if it["layer"] == "body-skeleton":
            bones[(it["base"].lower(), it["side"])] = it["v"]
    sides = za_sides(n for n, m in skel.items() if m["vertices"] > 200)
    pairs = []
    for n, (base, side) in sides.items():
        key = (re.sub(r"_\(.*?\)", "", base).replace("_", " ").lower(), side)
        if key in bones and skel[n]["min"][0] is not None:
            pairs.append((np.array(skel[n]["min"]), np.array(skel[n]["max"]), bones[key]))
    P = np.array([(lo + hi) / 2 for lo, hi, _ in pairs]); Q = np.array([(v.min(0) + v.max(0)) / 2 for _, _, v in pairs])
    A, *_ = np.linalg.lstsq(np.column_stack([P, np.ones(len(P))]), Q, rcond=None)
    aff = lambda x: np.column_stack([x, np.ones(len(x))]) @ A
    # landmarks for the local correction: centre and extreme corners of every shared bone, after the global affine
    src, disp = [], []
    for lo, hi, v in pairs:
        corners = aff(np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]))
        for a, b in ((corners.min(0), v.min(0)), (corners.max(0), v.max(0)), (corners.mean(0), (v.min(0) + v.max(0)) / 2)):
            src.append(a); disp.append(b - a)
    src, disp = np.array(src), np.array(disp)
    tree = cKDTree(src)
    def warp(x):
        y = aff(x)
        d, i = tree.query(y, k=8)
        w = 1.0 / (d ** 2 + 25.0)  # mm^2: smooth within about 5 mm of a landmark
        return y + (disp[i] * w[..., None]).sum(1) / w.sum(1)[:, None]
    before = np.linalg.norm(disp[2::3], axis=1)
    print(f"z-anatomy: {len(pairs)} shared bones; bone-centre error after global affine: median {np.median(before):.1f} mm, max {before.max():.1f} mm (removed by the local warp)")

    scene = trimesh.load(os.path.join(ZA, "NervousSystem100.glb"), process=False)
    geoms = {}
    for node in scene.graph.nodes_geometry:
        tf, gname = scene.graph[node]
        geoms.setdefault(node, (scene.geometry[gname], tf))
    wanted = {}
    for n, m in nerv.items():
        if m["vertices"] <= 60 or m["min"][0] is None:
            continue  # label lines and helpers
        par = m["parents"]
        if "Cranial_nervesg" in par:
            layer = None if n.startswith("Optic_nerve") else "cranial-nerves"
        elif "Peripheral_nervous_systemg" in par:
            layer = "body-nerves"
        elif "Spinal_cordg" in par:
            layer = "body-spinal-cord"
        elif n == "Falx_cerebri":
            layer = "meninges"
        elif n == "Spinal_dura":
            layer = "body-spinal-cord"
        else:
            layer = None
        if layer:
            wanted[n] = layer
    sides = za_sides(wanted)
    items = []
    for n, layer in sorted(wanted.items()):
        if n not in geoms:
            continue
        g, tf = geoms[n]
        v = trimesh.transform_points(np.asarray(g.vertices, dtype=np.float64), tf)
        base, side = sides[n]
        base = base.replace("_", " ").replace("'", " (segment)").strip()
        base = base[0].lower() + base[1:] if not re.match(r"[A-Z]{2}", base) else base
        label = {"L": "left ", "R": "right ", "M": ""}[side] + base
        items.append(dict(source="zanatomy", sourceId=f"NervousSystem100.fbx: {n}", label=label, base=base, side=side, layer=layer,
                          color=jitter(ZA_COLORS[layer], base) if layer == "body-spinal-cord" else ZA_COLORS[layer],
                          v=warp(v), f=np.asarray(g.faces), registration="affine-approx"))
    print("z-anatomy:", collections.Counter(i["layer"] for i in items))
    return items


def main():
    os.makedirs(OUT, exist_ok=True)
    spl = load_spl()
    bp, reg, A = load_bp(spl)
    bp += load_zanatomy(bp)
    Minv, t = np.linalg.inv(A[:3]), A[3]
    for it in spl:  # SPL space -> BodyParts3D space (inverse of the fitted affine)
        it["v"] = (it["v"] - t) @ Minv
    for it in spl + bp:  # BodyParts3D axes (x left, y posterior, z up) -> glTF axes
        v = it["v"]
        it["v"] = np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])
    manifest = dict(space="BodyParts3D body space; glTF axes +X=left, +Y=superior (0 = floor), +Z=anterior; metres",
                    sources=ATTRIB, registration={"bp3d": reg}, layers={}, meshes=[])
    scenes = collections.defaultdict(trimesh.Scene)
    seen = set()
    for it in spl + bp:
        mesh_id = slug(it["base"]) + {"L": "-l", "R": "-r", "M": ""}[it["side"]]
        if mesh_id in seen:
            mesh_id += "-" + it["source"]
        seen.add(mesh_id)
        m = trimesh.Trimesh(it["v"] * 0.001, it["f"], process=False)
        m.merge_vertices()
        if m.is_watertight and m.volume < 0:
            m.invert()
        m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            name=mesh_id, baseColorFactor=[*it["color"], 1.0], metallicFactor=0.0, roughnessFactor=0.75))
        _ = m.vertex_normals
        scenes[it["layer"]].add_geometry(m, node_name=mesh_id, geom_name=mesh_id)
        lo, hi = m.bounds
        manifest["meshes"].append(dict(
            id=mesh_id, structure=slug(it["base"]), side=it["side"], layer=it["layer"], labelEn=it["label"],
            source=it["source"], sourceId=it["sourceId"], registration=it["registration"],
            color=[round(c, 3) for c in it["color"]], triangles=int(len(m.faces)),
            centroid=[round(float(x), 5) for x in m.centroid], bbox=[[round(float(x), 5) for x in lo], [round(float(x), 5) for x in hi]]))
    for layer, scene in scenes.items():
        scene.export(os.path.join(OUT, f"{layer}.glb"))
        ms = [m for m in manifest["meshes"] if m["layer"] == layer]
        manifest["layers"][layer] = dict(meshes=len(ms), triangles=sum(m["triangles"] for m in ms))
        print(f"{layer:15} {len(ms):4} meshes {manifest['layers'][layer]['triangles']:9} tris")
    with open(os.path.join(HERE, "build/manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    print("structures:", len({m["structure"] for m in manifest["meshes"]}), "meshes:", len(manifest["meshes"]))


if __name__ == "__main__":
    main()
