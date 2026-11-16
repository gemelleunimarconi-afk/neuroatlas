"""Converts compact card drafts into content/structures/<id>.json and validates them.

Input format (one block per structure, blank line between blocks):
  @id | latin (or = to take it from names.json) | english | synonyms, comma separated | parent | level 1-3
  P: position
  R: direction > structureId or - > text ;; ...
  F: function
  C: A|E|R > targetId or - > via or - > text ;; ...      (afferent / efferent / reciprocal)
  V: arteryId or - > text ;; ...
  K: title :: text ;; ...
Italian name, layer and side come from names.json and the model manifest. Existing files are overwritten only with --force.
Usage: python3 content/tools/build_cards.py drafts.txt [--force]
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / "assets-pipeline/build/manifest.json").read_text())
names = json.loads((ROOT / "content/names.json").read_text())
brod = json.loads((ROOT / "content/brodmann.json").read_text())["areas"]
meshes = {}
for m in manifest["meshes"]:
    meshes.setdefault(m["structure"], []).append(m)
TYPE = {"A": "afferent", "E": "efferent", "R": "reciprocal"}


def items(line):
    return [[p.strip() for p in it.split(" > ")] for it in line.split(" ;; ") if it.strip()]


def ref(value, where, problems):
    if value in ("-", ""):
        return None
    if value not in meshes:
        problems.append(f"{where}: unknown structure '{value}'")
        return None
    return value


def main():
    force = "--force" in sys.argv
    text = Path(sys.argv[1]).read_text()
    problems, written = [], 0
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        head = [p.strip() for p in lines[0].lstrip("@").split("|")]
        sid, la, en, syn, parent, level = head
        if sid not in meshes:
            problems.append(f"{sid}: no mesh with this id"); continue
        f = {l[0]: l[2:].strip() for l in lines[1:] if re.match(r"^[PRFCVK]:", l)}
        missing = [k for k in "PFK" if not f.get(k)]
        if missing:
            problems.append(f"{sid}: missing fields {missing}"); continue
        named = names.get(sid)
        la = (named[1] if la == "=" else la) if isinstance(named, list) or la != "=" else None
        if not la:
            problems.append(f"{sid}: no Latin name"); continue
        card = {
            "id": sid,
            "names": {"it": named[0] if isinstance(named, list) else en, "la": la, "en": en, "synonyms": [s.strip() for s in syn.split(",") if s.strip() and s.strip() != "-"]},
            "parent": parent or None, "layer": meshes[sid][0]["layer"],
            "side": "bilateral" if {m["side"] for m in meshes[sid]} >= {"L", "R"} else "midline", "level": int(level),
            "location": f["P"],
            "relations": [dict(direction=d, **({"structureId": r} if (r := ref(s, sid, problems)) else {}), text=t) for d, s, t in items(f.get("R", ""))],
            "function": f["F"],
            "connections": [dict(type=TYPE[t], **({"targetId": r} if (r := ref(s, sid, problems)) else {}), **({"via": v} if v != "-" else {}), text=x) for t, s, v, x in items(f.get("C", ""))],
            "bloodSupply": [dict(**({"arteryId": r} if (r := ref(s, sid, problems)) else {}), text=t) for s, t in items(f.get("V", ""))],
            "clinical": [dict(title=k.split(" :: ")[0].strip(), text=k.split(" :: ")[1].strip()) for k in f["K"].split(" ;; ")],
            "pathways": [], "brodmann": brod.get(sid, []), "tags": [],
            "sources": ["standring", "kandel", "blumenfeld"], "review": "draft",
        }
        out = ROOT / "content/structures" / f"{sid}.json"
        if out.exists() and not force:
            problems.append(f"{sid}: card already exists (use --force)"); continue
        out.write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n")
        written += 1
    print(f"written {written} cards; {len(problems)} problems")
    for p in problems:
        print("  !", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
