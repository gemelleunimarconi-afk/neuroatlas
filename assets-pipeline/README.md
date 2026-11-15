# NeuroAtlas — pipeline dei modelli 3D

Converte le fonti aperte in file `.glb` per livello anatomico, in tre livelli di dettaglio.

```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy trimesh
npm install
./fetch_sources.sh     # scarica le fonti in .cache/ (circa 700 MB)
npm run build          # build/raw/*.glb -> build/models/*.lod{0,1,2}.glb + build/manifest.json
python3 -m http.server 8765   # poi apri http://localhost:8765/preview.html?view=inferior
```

## Fonti e licenze

| Fonte | Contenuto usato | Licenza | Attribuzione |
|---|---|---|---|
| SPL-PNL Brain Atlas (Open Anatomy Project), commit `bec24db` | Encefalo: corteccia, solchi, nuclei, diencefalo, tronco, cervelletto, ventricoli | 3D Slicer License | Halle M. et al., Surgical Planning Laboratory / Psychiatry Neuroimaging Laboratory, Brigham and Women's Hospital, Harvard Medical School |
| BodyParts3D 4.0 (albero IS-A, riduzione 99%) e 3.0 (polmoni, fegato) | Tutto il corpo: è lo spazio di riferimento. Per l'encefalo: arterie, nervi III e IV e V1, tentorio, capsula interna | CC BY 4.0 (pagina della licenza aggiornata il 27/02/2025; le intestazioni dei file OBJ riportano ancora CC BY-SA 2.1 JP) | BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International |

| Z-Anatomy, commit `6c7f901` | Nervi periferici e cranici, sistema autonomo, midollo spinale con i fasci, falce cerebrale, dura spinale; tabella dei termini TA2 | CC BY-SA 4.0 | Z-Anatomy (Gauthier Kervyn, Lluís Vinent et al.), derivato da BodyParts3D |

Z-Anatomy è distribuito in FBX: `fbx_to_glb.cjs` lo converte in GLB con three.js in Chromium headless (serve Playwright). Ha rimodellato il corpo di BodyParts3D in una posa leggermente diversa, quindi i nervi vengono riportati sul nostro corpo con una trasformazione affine stimata su 109 ossa in comune, più una correzione locale che segue lo spostamento residuo delle ossa vicine.

## Passi

1. `build_models.py` legge VTK (SPL), OBJ (BodyParts3D 4.0) e STL (BodyParts3D 3.0), assegna ogni mesh a un livello e scrive un GLB grezzo per livello.
   Spazio: quello del corpo BodyParts3D, assi glTF (+X sinistra del soggetto, +Y superiore con 0 al pavimento, +Z anteriore), metri.
2. **Corpo**: tutte le parti di BodyParts3D 4.0 fuori dall'encefalo, classificate per apparato dalle classi IS-A (`BODY_RULES`). Restano nella posizione originale.
3. **Encefalo**: l'atlante SPL-PNL è un altro individuo. Viene adattato al cranio del corpo con una trasformazione affine
   (minimi quadrati sui baricentri di 36 strutture omologhe, poi ICP sulle superfici): le sue mesh hanno `registration: "affine-approx"`.
4. **Polmoni e fegato**: la 4.0 ne contiene solo bronchi e vasi, quindi le superfici vengono dalla 3.0, spostate della differenza
   di posa misurata su ossa e organi vicini presenti in entrambe le versioni (anche queste `affine-approx`).
5. `optimize.mjs` salda i vertici, semplifica (meshoptimizer) a tre livelli e comprime con Meshopt. I livelli del corpo hanno un
   tetto di triangoli per livello. I nomi dei nodi sono gli `id` del manifest e restano invariati.
