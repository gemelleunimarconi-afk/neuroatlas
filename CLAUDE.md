# NeuroAtlas: note per chi continua il lavoro

Atlante 3D del corpo umano con l'encefalo in dettaglio, per uno studente universitario italiano (esami di neuroanatomia, fisiologia, psicobiologia). L'utente non usa il terminale: va guidato con passaggi nel browser e gli va dato un link da aprire. Tutta l'interfaccia e i contenuti sono in italiano.

## Dove sta cosa

- `apps/web`: app React + TypeScript + React Three Fiber. Stato in `src/store/atlas.ts`; visualizzatore in `src/viewer`; pannelli in `src/features`; tutor in `src/tutor`; quiz e ripetizione dilazionata in `src/study`.
- `content`: contenuti separati dal codice. `structures/<id>.json` (schede), `names.json` (nomi it/la di tutte le strutture), `pathways/`, `cases.json`, `modules.json`, `brodmann.json`, `sources.json`.
- `assets-pipeline`: converte le fonti aperte in `.glb`. Il risultato già pronto è versionato in `apps/web/public/models` (con `manifest.json`): non serve rilanciare la pipeline per lavorare su app e contenuti. `assets-pipeline/build` e `.cache` non sono versionati.

## Comandi (in `apps/web`)

```bash
npm ci
npm test            # schede, rimandi, ricerca, tutor, quiz, SM-2
npm run build       # tipi + build + service worker
npm run build:published   # versione in un solo file per la pagina dentro Claude
```

## Due pubblicazioni

1. **GitHub Pages** (`.github/workflows/pages.yml`): si aggiorna da sola a ogni push su `main`. Sito libero, installabile, offline; senza tutor.
2. **Pagina dentro Claude** (artifact, con la capacità `sample`): va ripubblicata a mano da `apps/web/dist-artifact/neuroatlas.html` con i file elencati in `dist-artifact/files.json`. Lì i `.glb` sono incapsulati in JSON perché l'hosting non serve file `.glb`. Il tutor funziona solo qui, con l'account Claude di chi guarda; l'utente non vuole chiavi API.

## Scrivere nuove schede

1. L'`id` deve essere una struttura con modello: cercarlo in `apps/web/public/models/manifest.json` (campo `structure`).
2. Scrivere la bozza nel formato compatto descritto in testa a `content/tools/build_cards.py` e convertirla con `python3 content/tools/build_cards.py bozze.txt` (usa `--force` per sovrascrivere). Lo script rifiuta rimandi a strutture inesistenti. Se manca `assets-pipeline/build/manifest.json`, copiarvi quello di `apps/web/public/models`.
3. `npm test`, poi build e pubblicazione.

Regole per i contenuti:

- Livello universitario, italiano, termini latini in `*corsivo*`.
- Mai inventare connessioni, numeri, eponimi o riferimenti. Nel dubbio omettere o dichiarare l'incertezza nel testo.
- Tutte le schede hanno `review: "draft"`: sono scritte da un modello e non verificate da un docente. Non portarle a `reviewed` senza una verifica umana sui testi in `content/sources.json`.
- Quando una struttura dell'atlante rappresenta solo una parte (es. un lembo valvolare) ma la scheda descrive l'insieme, dirlo nella posizione.
- Le vie nervose sono schemi didattici, non trattografia: l'app lo dichiara e deve continuare a farlo.

## Fonti dei modelli e licenze

SPL-PNL Brain Atlas (3D Slicer License), BodyParts3D (CC BY 4.0), Z-Anatomy (CC BY-SA 4.0, per nervi, midollo, falce, dura spinale e tabella dei termini). Le attribuzioni sono nel manifest e nell'app (pulsante ⓘ). Non aggiungere modelli senza licenza aperta verificata alla fonte.

## Limiti noti

- Le schede coprono circa 205 strutture su 1.258; le altre hanno solo nome e modello.
- Encefalo (SPL) e corpo (BodyParts3D) sono individui diversi: l'encefalo è adattato al cranio con una trasformazione affine. Nervi e midollo (Z-Anatomy) sono riposizionati seguendo le ossa.
- Manca un modello del nervo accessorio (XI), dell'anatomia femminile e del sistema linfatico.
- Fluidità su dispositivi reali e comportamento del tutor con il Claude vero non sono stati misurati in modo sistematico.
