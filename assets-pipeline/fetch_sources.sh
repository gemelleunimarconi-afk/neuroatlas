#!/usr/bin/env bash
# Downloads the open source datasets into .cache/ (not versioned). Re-runnable.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p .cache && cd .cache

# 1) SPL-PNL Brain Atlas (Open Anatomy Project) — 3D Slicer License, pinned commit
SPL_COMMIT=bec24db25aad5f7600e2df3becfb1f883e61ff56
if [ ! -d spl-brain-atlas/slicer/models ]; then
  git clone --filter=blob:none --no-checkout https://github.com/mhalle/spl-brain-atlas.git
  git -C spl-brain-atlas checkout "$SPL_COMMIT" -- slicer/models labelinfo LICENSE.md README.md
fi

# 2) BodyParts3D 4.0, IS-A tree, 99% polygon set — CC BY 4.0 (licence page updated 2025-02-27)
BP=https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST
mkdir -p bodyparts3d && cd bodyparts3d
for f in isa_parts_list_e.txt isa_element_parts.txt isa_inclusion_relation_list.txt partof_element_parts.txt isa_BP3D_4.0_obj_99.zip; do
  [ -f "$f" ] || curl -fsSL -O "$BP/$f"
done
[ -d isa_BP3D_4.0_obj_99 ] || unzip -q isa_BP3D_4.0_obj_99.zip

# 3) BodyParts3D 3.0 whole-organ surfaces missing from 4.0 (lungs, liver), from the STL mirror of the 20110915 release
cd ..; mkdir -p bodyparts3d_v3 && cd bodyparts3d_v3
# organ surfaces, then the landmark structures used to align them
for f in FMA7197 FMA7333 FMA7337 FMA7383 FMA7370 FMA7371 FMA13072 FMA13322 FMA13323 FMA13395 FMA13396 FMA7148 FMA7196 FMA7202 FMA7204 FMA7205 FMA7394 FMA7487 FMA7987 FMA8533 FMA9165 FMA9968; do
  [ -f "$f.stl" ] || curl -fsSL -o "$f.stl" "https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/stl/$f.stl"
done

# 4) Z-Anatomy (CC BY-SA 4.0): nervous system and skeleton (the latter only to align the former), plus the TA2 term table
cd ..; mkdir -p z-anatomy && cd z-anatomy
ZA=https://raw.githubusercontent.com/LluisV/Z-Anatomy/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX
for f in NervousSystem100 SkeletalSystem100; do [ -f "$f.fbx" ] || curl -fsSL -o "$f.fbx" "$ZA/$f.fbx"; done
[ -f TA2.csv ] || curl -fsSL -o TA2.csv https://raw.githubusercontent.com/Z-Anatomy/The-blend/main/TA2.csv
[ -f NervousSystem100.glb ] || (cd ../.. && node fbx_to_glb.cjs NervousSystem100 SkeletalSystem100)
