"""Fills content/names.json with Italian (and, where available, Latin) names for every structure that has a 3D mesh.

Order of preference for each structure:
  1. names already in names.json (hand-written, never overwritten);
  2. Terminologia Anatomica 2 table distributed by Z-Anatomy (CC BY-SA 4.0): English -> Italian + Latin;
  3. MANUAL below (irregular names);
  4. grammar rules for the regular FMA-style names of BodyParts3D ("anterior basal segmental artery", ...): Italian only.
Everything produced here is a draft to be reviewed. Run from the repository root:  python3 content/tools/translate_names.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TA2 = ROOT / "assets-pipeline/.cache/z-anatomy/TA2.csv"

ORD_M = {"first": "primo", "second": "secondo", "third": "terzo", "fourth": "quarto", "fifth": "quinto", "sixth": "sesto",
         "seventh": "settimo", "eighth": "ottavo", "ninth": "nono", "tenth": "decimo", "eleventh": "undicesimo", "twelfth": "dodicesimo"}
ORD_F = {k: v[:-1] + "a" for k, v in ORD_M.items()}

# adjective -> (masculine, feminine)
ADJ = {a: (a_it, a_it) for a, a_it in {
    "anterior": "anteriore", "posterior": "posteriore", "superior": "superiore", "inferior": "inferiore", "lateral": "laterale",
    "medial": "mediale", "basal": "basale", "apical": "apicale", "segmental": "segmentale", "palmar": "palmare", "digital": "digitale",
    "dorsal": "dorsale", "plantar": "plantare", "superficial": "superficiale", "ascending": "ascendente", "descending": "discendente",
    "common": "comune", "lingular": "lingulare", "lobar": "lobare", "caudal": "caudale", "marginal": "marginale", "renal": "renale",
    "septal": "settale", "diagonal": "diagonale", "bronchial": "bronchiale", "laterobasal": "laterobasale", "mediobasal": "mediobasale",
    "distal": "distale", "ileal": "ileale", "cervical": "cervicale", "lumbar": "lombare", "esophageal": "esofageo",
    "upper": "superiore", "lower": "inferiore", "subsuperior": "sottosuperiore", "collateral": "collaterale", "radial": "radiale",
    "intercostal": "intercostale", "rectal": "rettale", "subcostal": "sottocostale", "suprarenal": "surrenale",
    "testicular": "testicolare", "genicular": "genicolare", "perforating": "perforante", "circumflex": "circonflesso",
    "interventricular": "interventricolare", "ventricular": "ventricolare", "ureteric": "ureterale", "vertical": "verticale",
    "pulmonary": "polmonare", "brachiocephalic": "brachiocefalico", "celiac": "celiaco", "ileocolic": "ileocolico",
}.items()}
ADJ.update({"hepatic": ("epatico", "epatica"), "middle": ("medio", "media"), "proper": ("proprio", "propria"), "deep": ("profondo", "profonda"),
            "accessory": ("accessorio", "accessoria"), "colic": ("colico", "colica"), "gastric": ("gastrico", "gastrica"),
            "cecal": ("cecale", "cecale"), "pancreatic": ("pancreatico", "pancreatica"), "thoracic": ("toracico", "toracica"),
            "phrenic": ("frenico", "frenica"), "brachial": ("brachiale", "brachiale"), "oblique": ("obliquo", "obliqua"),
            "intermediate": ("intermedio", "intermedia"), "esophageal": ("esofageo", "esofagea"), "circumflex": ("circonflesso", "circonflessa"),
            "brachiocephalic": ("brachiocefalico", "brachiocefalica"), "celiac": ("celiaco", "celiaca"), "ileocolic": ("ileocolico", "ileocolica")})
for k in ORD_M:
    ADJ[k] = (ORD_M[k], ORD_F[k])

# head nouns and fixed noun phrases: english -> (italian, gender, article)
NOUN = {
    "artery": ("arteria", "f", "l'"), "arteries": ("arterie", "fp", "le"), "vein": ("vena", "f", "la"), "veins": ("vene", "fp", "le"),
    "branch": ("ramo", "m", "il"), "tributary": ("affluente", "m", "l'"), "trunk": ("tronco", "m", "il"), "part": ("parte", "f", "la"),
    "division": ("divisione", "f", "la"), "segment": ("segmento", "m", "il"), "bronchial tree": ("albero bronchiale", "m", "l'"),
    "head": ("capo", "m", "il"), "cusp": ("cuspide", "f", "la"), "leaflet": ("lembo", "m", "il"), "cavity": ("cavità", "f", "la"),
    "wall": ("parete", "f", "la"), "ventricle": ("ventricolo", "m", "il"), "atrium": ("atrio", "m", "l'"),
    "papillary muscle": ("muscolo papillare", "m", "il"), "aortic valve": ("valvola aortica", "f", "la"),
    "pulmonary valve": ("valvola polmonare", "f", "la"), "mitral valve": ("valvola mitrale", "f", "la"),
    "tricuspid valve": ("valvola tricuspide", "f", "la"), "coronary artery": ("arteria coronaria", "f", "l'"),
    "portal vein": ("vena porta", "f", "la"), "hepatic biliary tree": ("albero biliare epatico", "m", "l'"),
    "liver": ("fegato", "m", "il"), "caudate lobe": ("lobo caudato", "m", "il"), "lobe": ("lobo", "m", "il"), "duct": ("dotto", "m", "il"),
    "ileum": ("ileo", "m", "l'"), "jejunum": ("digiuno", "m", "il"), "foot": ("piede", "m", "il"), "hand": ("mano", "f", "la"),
    "penis": ("pene", "m", "il"), "spinal cord": ("midollo spinale", "m", "il"), "arch of aorta": ("arco aortico", "m", "l'"),
    "aorta": ("aorta", "f", "l'"), "interventricular branch": ("ramo interventricolare", "m", "il"),
    "descending branch": ("ramo discendente", "m", "il"), "interventricular artery": ("arteria interventricolare", "f", "l'"),
    "mesenteric artery": ("arteria mesenterica", "f", "l'"), "gastroduodenal artery": ("arteria gastroduodenale", "f", "l'"),
    "thoraco-acromial artery": ("arteria toracoacromiale", "f", "l'"), "plantar venous arch": ("arcata venosa plantare", "f", "l'"),
    "external pudendal vein": ("vena pudenda esterna", "f", "la"), "pronator teres": ("muscolo pronatore rotondo", "m", "il"),
    "pectoralis major": ("muscolo grande pettorale", "m", "il"), "deltoid": ("muscolo deltoide", "m", "il"),
    "longus colli": ("muscolo lungo del collo", "m", "il"), "lateral rectus": ("muscolo retto laterale", "m", "il"),
    "medial rectus": ("muscolo retto mediale", "m", "il"), "superior oblique": ("muscolo obliquo superiore", "m", "l'"),
    "lens": ("cristallino", "m", "il"), "levator palpebrae superioris": ("muscolo elevatore della palpebra superiore", "m", "il"),
    "lower eyelid": ("palpebra inferiore", "f", "la"), "upper eyelid": ("palpebra superiore", "f", "la"),
    "colon": ("colon", "m", "il"), "small intestine": ("intestino tenue", "m", "l'"), "pancreas": ("pancreas", "m", "il"),
    "lower jaw": ("arcata dentale inferiore", "f", "l'"), "upper jaw": ("arcata dentale superiore", "f", "l'"),
    "brachial artery": ("arteria brachiale", "f", "l'"), "renal artery": ("arteria renale", "f", "l'"),
    "colic artery": ("arteria colica", "f", "l'"), "ileocolic artery": ("arteria ileocolica", "f", "l'"),
    "hepatic artery": ("arteria epatica", "f", "l'"), "hepatic vein": ("vena epatica", "f", "la"), "axis": ("epistrofeo", "m", "l'"),
    "check ligament": ("legamento di arresto", "m", "il"), "suspensory ligament": ("legamento sospensore", "m", "il"),
    "tarsal plate": ("tarso", "m", "il"), "tendon": ("tendine", "m", "il"), "trochlea": ("troclea", "f", "la"),
    "gingiva": ("gengiva", "f", "la"), "mesentery": ("mesentere", "m", "il"), "parenchyma": ("parenchima", "m", "il"),
    "pancreatic duct tree": ("albero dei dotti pancreatici", "m", "l'"), "venous arch": ("arcata venosa", "f", "l'"),
    "arterial arch": ("arcata arteriosa", "f", "l'"), "genicular artery": ("arteria genicolare", "f", "l'"),
    "digital artery": ("arteria digitale", "f", "l'"), "digital vein": ("vena digitale", "f", "la"),
    "thoracic aorta": ("aorta toracica", "f", "l'"), "oesophageal branches": ("rami esofagei", "mp", "i"),
    "thumb": ("pollice", "m", "il"), "index finger": ("indice", "m", "l'"), "middle finger": ("medio", "m", "il"),
    "ring finger": ("anulare", "m", "l'"), "little finger": ("mignolo", "m", "il"), "big toe": ("alluce", "m", "l'"),
    "second toe": ("secondo dito del piede", "m", "il"), "third toe": ("terzo dito del piede", "m", "il"),
    "fourth toe": ("quarto dito del piede", "m", "il"), "little toe": ("quinto dito del piede", "m", "il"),
    "phalanx": ("falange", "f", "la"), "costal cartilage": ("cartilagine costale", "f", "la"),
    "metacarpal bone": ("osso metacarpale", "m", "l'"), "metatarsal bone": ("osso metatarsale", "m", "l'"),
    "intervertebral disk": ("disco intervertebrale", "m", "il"), "lumbrical": ("muscolo lombricale", "m", "il"),
    "plantar interosseous": ("muscolo interosseo plantare", "m", "l'"),
}
for n, (r_it, code) in {"cervical": ("cervicale", "C"), "thoracic": ("toracica", "T"), "lumbar": ("lombare", "L")}.items():
    NOUN[f"{n} vertebra"] = (f"vertebra {r_it}", "f", "la")

MANUAL = {
    "anterior superior pancreaticoduodenal artery": "Arteria pancreaticoduodenale superiore anteriore",
    "anterolateral head of lateral papillary muscle of ventricle": "Capo anterolaterale del muscolo papillare laterale del ventricolo",
    "caudate lobe branch of hepatic artery": "Ramo dell'arteria epatica per il lobo caudato",
    "caudate lobe branch of portal vein": "Ramo della vena porta per il lobo caudato",
    "caudate lobe tributary of hepatic biliary tree": "Affluente dell'albero biliare epatico dal lobo caudato",
    "central canal of spinal cord": "Canale centrale del midollo spinale",
    "proximal part of ileum": "Parte prossimale dell'ileo", "proximal part of jejunum": "Parte prossimale del digiuno",
    "(Communicating branch of median nerve with ulnar nerve)": "Ramo comunicante del nervo mediano con il nervo ulnare",
    "communicating branch of nasociliary nerve with ciliary ganglion": "Ramo comunicante del nervo nasociliare con il ganglio ciliare",
    "accessory hemiazygos vein": "Vena emiazygos accessoria", "hemiazygos vein": "Vena emiazygos", "adductor minimus": "Muscolo adduttore minimo",
    "arteria princeps pollicis": "Arteria principale del pollice", "arteria radialis indicis": "Arteria radiale dell'indice",
    "aryepiglotticus": "Muscolo ariepiglottico", "brachiocephalic artery": "Tronco brachiocefalico", "celiac artery": "Tronco celiaco",
    "celiac trunk": "Tronco celiaco", "capitate": "Osso capitato", "hamate": "Osso uncinato", "lunate": "Osso semilunare",
    "pisiform": "Osso pisiforme", "scaphoid": "Osso scafoide", "trapezium": "Osso trapezio", "trapezoid": "Osso trapezoide",
    "triquetral": "Osso piramidale", "navicular bone of foot": "Osso navicolare del piede", "sesamoid bone of foot": "Osso sesamoide del piede",
    "cervical rotator": "Muscoli rotatori del collo", "thoracic rotator": "Muscoli rotatori del torace", "lumbar rotator": "Muscoli rotatori dei lombi",
    "conus artery": "Arteria del cono", "conus branch of anterior interventricular branch of coronary artery": "Ramo del cono del ramo interventricolare anteriore dell'arteria coronaria",
    "descending thoracic aorta": "Aorta toracica discendente", "external oblique": "Muscolo obliquo esterno dell'addome",
    "flexor accessorius": "Muscolo quadrato della pianta", "flexor digiti minimi brevis of foot": "Muscolo flessore breve del quinto dito del piede",
    "flexor digiti minimi brevis of hand": "Muscolo flessore breve del mignolo", "opponens digiti minimi of foot": "Muscolo opponente del quinto dito del piede",
    "opponens digiti minimi of hand": "Muscolo opponente del mignolo", "gastro-epiploic artery": "Arteria gastroepiploica",
    "gastroepiploic vein": "Vena gastroepiploica", "gemellus inferior": "Muscolo gemello inferiore", "gemellus superior": "Muscolo gemello superiore",
    "hair of head": "Capelli", "hepatic artery proper": "Arteria epatica propria", "hepatic duct": "Dotto epatico",
    "ileocecal junction": "Giunzione ileocecale", "ileocolic vein": "Vena ileocolica", "iliocostalis cervicis": "Muscolo ileocostale del collo",
    "interspinalis thoracis": "Muscoli interspinosi del torace", "lacrimal lake": "Lago lacrimale", "lateral lumbar intertransversarius": "Muscoli intertrasversari laterali dei lombi",
    "medial lumbar intertransversarius": "Muscoli intertrasversari mediali dei lombi", "lateral nasal cartilage": "Cartilagine nasale laterale",
    "septal nasal cartilage": "Cartilagine del setto nasale", "longissimus cervicis": "Muscolo lunghissimo del collo", "marginal artery of colon": "Arteria marginale del colon",
    "marginal vein": "Vena marginale", "medial brachial vein": "Vena brachiale mediale", "mesoappendix": "Mesoappendice",
    "obliquus capitis inferior": "Muscolo obliquo inferiore della testa", "obliquus capitis superior": "Muscolo obliquo superiore della testa",
    "portal vein": "Vena porta", "pre-hepatic portal vein": "Vena porta, tratto preepatico", "puborectalis": "Muscolo puborettale",
    "rectus capitis anterior": "Muscolo retto anteriore della testa", "rectus capitis lateralis": "Muscolo retto laterale della testa",
    "rectus capitis posterior major": "Muscolo grande retto posteriore della testa", "rectus capitis posterior minor": "Muscolo piccolo retto posteriore della testa",
    "renal vein": "Vena renale", "semispinalis cervicis": "Muscolo semispinale del collo", "spinalis": "Muscolo spinale",
    "splenius cervicis": "Muscolo splenio del collo", "set of anterior cervical intertransversarii": "Muscoli intertrasversari anteriori del collo",
    "set of posterior cervical intertransversarii": "Muscoli intertrasversari posteriori del collo", "set of dorsal digital arteries": "Arterie digitali dorsali",
    "set of dorsal digital veins": "Vene digitali dorsali", "set of dorsal interossei of hand": "Muscoli interossei dorsali della mano",
    "set of palmar interossei of hand": "Muscoli interossei palmari della mano", "set of interspinales cervicis": "Muscoli interspinosi del collo",
    "set of interspinales lumborum": "Muscoli interspinosi dei lombi", "set of levatores costarum breves": "Muscoli elevatori brevi delle coste",
    "set of levatores costarum longi": "Muscoli elevatori lunghi delle coste", "set of lumbricals of hand": "Muscoli lombricali della mano",
    "set of perforating arteries": "Arterie perforanti", "set of plantar digital arteries proper": "Arterie digitali plantari proprie",
    "set of oesophageal branches of thoracic aorta": "Rami esofagei dell'aorta toracica", "superficial palmar arterial arch": "Arcata palmare superficiale",
    "superficial palmar venous arch": "Arcata venosa palmare superficiale", "deep palmar venous arch": "Arcata venosa palmare profonda",
    "plantar venous arch of foot": "Arcata venosa plantare", "taenia libera": "Tenia libera del colon", "taenia mesocolica": "Tenia mesocolica",
    "taenia omentalis": "Tenia omentale", "uvular muscle": "Muscolo dell'ugola", "intervertebral disk": "Dischi intervertebrali",
    "superficial dorsal vein of penis": "Vena dorsale superficiale del pene", "spinal part of deltoid": "Muscolo deltoide, parte spinale",
    "abdominal part of pectoralis major": "Muscolo grande pettorale, parte addominale", "clavicular part of pectoralis major": "Muscolo grande pettorale, parte clavicolare",
    "sternocostal part of pectoralis major": "Muscolo grande pettorale, parte sternocostale", "humeral head of pronator teres": "Muscolo pronatore rotondo, capo omerale",
    "ulnar head of pronator teres": "Muscolo pronatore rotondo, capo ulnare", "inferior oblique part of longus colli": "Muscolo lungo del collo, parte obliqua inferiore",
    "superior oblique part of longus colli": "Muscolo lungo del collo, parte obliqua superiore", "vertical intermediate part of longus colli": "Muscolo lungo del collo, parte verticale",
    "superficial cervical artery": "Arteria cervicale superficiale", "superficial medial plantar artery": "Arteria plantare mediale, ramo superficiale",
    "upper lobar artery": "Arteria lobare superiore", "ureteric segment of renal artery": "Ramo ureterale dell'arteria renale",
    "caudal pancreatic artery": "Arteria della coda del pancreas", "lobe branch of hepatic artery": "Ramo lobare dell'arteria epatica",
    "bronchial branch of arch of aorta": "Ramo bronchiale dell'arco aortico", "marginal colic artery": "Arteria marginale del colon",
}
for n in ("ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"):
    MANUAL[f"hepatovenous segment {n}"] = f"Segmento epatico {n.upper()} (territorio venoso)"

CONTRACT = {"il": "del", "lo": "dello", "la": "della", "l'": "dell'", "i": "dei", "le": "delle", "gli": "degli"}


def noun_phrase(text):
    """'anterior basal segmental artery' -> ('arteria segmentale basale anteriore', 'f', "l'") or None."""
    words = text.split()
    for i in range(len(words)):  # longest known noun phrase at the end
        head = " ".join(words[i:])
        if head in NOUN:
            it, g, art = NOUN[head]
            adjs = words[:i]
            if any(a not in ADJ for a in adjs):
                return None
            fem = g.startswith("f")
            # ordinals go before the noun in Italian, the other adjectives after it (nearest to the noun first)
            pre = [ADJ[a][fem] for a in adjs if a in ORD_M]
            post = [ADJ[a][fem] for a in reversed(adjs) if a not in ORD_M]
            if pre:
                art = "la" if fem else "il"
                if pre[0][0] in "aeiou":
                    art = "l'"
            return " ".join(pre + [it] + post), g, art
    return None


def translate(en):
    if en in MANUAL:
        return MANUAL[en]
    m = re.fullmatch(r"(upper|lower) (?:(central|lateral|first|second) )?secondary (incisor|canine|molar|premolar) tooth", en)
    if m:
        kind = {"incisor": "Incisivo", "canine": "Canino", "molar": "molare", "premolar": "premolare"}[m.group(3)]
        mod = {"central": " centrale", "lateral": " laterale", None: ""}.get(m.group(2), "")
        if m.group(2) in ("first", "second"):
            kind = f"{ORD_M[m.group(2)].capitalize()} {kind}"
        return f"{kind}{mod} {'superiore' if m.group(1) == 'upper' else 'inferiore'} permanente"
    m = re.fullmatch(r"(proximal|middle|distal) phalanx of (.+)", en)
    if m and m.group(2) in NOUN:
        it, _, art = NOUN[m.group(2)]
        sep = "" if art.endswith("'") else " "
        return f"Falange {{'proximal': 'prossimale', 'middle': 'media', 'distal': 'distale'}}".format() if False else \
            f"Falange {dict(proximal='prossimale', middle='media', distal='distale')[m.group(1)]} {CONTRACT[art]}{sep}{it}"
    parts = en.split(" of ")
    out = []
    for i, p in enumerate(parts):
        np_ = noun_phrase(p)
        if not np_:
            return None
        it, _, art = np_
        if i == 0:
            out.append(it)
        else:
            out.append(CONTRACT[art] + ("" if art.endswith("'") else " ") + it)
    s = " ".join(out)
    return s[0].upper() + s[1:]


def main():
    norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", re.sub(r"\(.*?\)", "", s.lower()).replace("-", " ")).strip())
    ta = {}
    for line in open(TA2, encoding="utf-8-sig"):
        p = line.strip().strip('"').split(";")
        if len(p) >= 7 and p[0].isdigit() and p[6].strip():
            ta.setdefault(norm(p[1]), (p[6].strip(), p[2].strip() or None))
    manifest = json.loads((ROOT / "assets-pipeline/build/manifest.json").read_text())
    names = json.loads((ROOT / "content/names.json").read_text())
    stats = dict(kept=0, ta2=0, manual=0, rule=0)
    missing = []
    for mesh in manifest["meshes"]:
        sid = mesh["structure"]
        if sid in names or sid.startswith("cerebellar-lobule"):
            continue
        en = re.sub(r"\b(left|right)\b ?", "", mesh["labelEn"]).strip()
        k = norm(en)
        cands = [k, k + " muscle", re.sub(r" muscle$", "", k), k + "s", re.sub(r"artery$", "arteries", k), re.sub(r"vein$", "veins", k),
                 re.sub(r"branch", "branches", k, count=1), re.sub(r"nerve$", "nerves", k), re.sub(r"^set of ", "", k), re.sub(r" proper$", "", k)]
        hit = next((ta[c] for c in cands if c in ta), None)
        if hit and en not in MANUAL:
            names[sid] = [hit[0], hit[1]]; stats["ta2"] += 1
            continue
        it = translate(en)
        if it:
            names[sid] = [it, None]; stats["manual" if en in MANUAL else "rule"] += 1
        else:
            missing.append(en)
    (ROOT / "content/names.json").write_text(json.dumps(names, ensure_ascii=False, indent=1) + "\n")
    print(stats, "missing:", len(missing))
    for en in sorted(set(missing)):
        print("  MISSING", en)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
