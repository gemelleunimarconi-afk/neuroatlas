# NeuroAtlas

Atlante 3D interattivo del corpo umano, con l'encefalo in grande dettaglio, per lo studio universitario dell'anatomia e della neuroanatomia.

Due ambiti, scelti con i pulsanti in alto a sinistra: **Corpo** (scheletro, muscoli, organi, vasi, nervi periferici, midollo spinale: circa 1.050 strutture) ed **Encefalo** (circa 210 strutture, con nervi cranici I–XII e le schede complete).

Strumenti (scheda "Strumenti"): piano di sezione sagittale, coronale o assiale; vista esplosa; etichette senza sovrapposizioni; aree di Brodmann (corrispondenza approssimata); nove vie nervose animate (schemi didattici); segnalibri e note personali salvati sul dispositivo.

Stato: tutte le milestone (M0–M5) completate.

## Studio (M4)

Scheda "Studio": riconosci la struttura evidenziata, trova una struttura sul modello, nomi latini, funzioni, dieci casi clinici con localizzazione della lesione (`content/cases.json`), ripasso programmato con l'algoritmo SM-2 (`apps/web/src/study/sm2.ts`), progressi per regione, punti deboli e storico delle sessioni. Funziona senza connessione e senza tutor; le domande aperte corrette dal tutor richiedono la versione dentro Claude. I progressi restano sul dispositivo (IndexedDB).

## App installabile e offline (M5)

`npm run build` genera anche il service worker (Workbox, `scripts/build-sw.mjs`): l'interfaccia è in precache, i modelli 3D entrano in cache alla prima apertura, e da Strumenti → Dispositivo si possono scaricare tutti per l'uso offline. Sempre lì si sceglie la qualità dei modelli (leggera, media, alta); la scelta iniziale è leggera su telefoni e dispositivi con poca memoria. Il motore 3D, il tutor e lo studio sono caricati a parte dall'interfaccia.

## Tutor AI

Il tutor (scheda "Tutor") usa l'account Claude di chi guarda la pagina, senza chiave API: funziona solo nella versione pubblicata dentro Claude (`npm run build:published` in `apps/web`, poi pubblicazione come artifact con la capacità `sample`). Sul sito GitHub Pages la scheda spiega che il tutor non è disponibile; tutto il resto funziona.

- Conosce lo stato dell'atlante (struttura selezionata, sezione, via, livelli) e riceve le schede pertinenti alla domanda (`apps/web/src/tutor/engine.ts`).
- Comanda il visualizzatore con sei strumenti: `search_structures`, `get_structure_card`, `highlight_structure`, `set_section_plane`, `show_pathway`, `focus_camera`.
- Percorsi guidati: otto moduli con obiettivi di apprendimento in `content/modules.json`.

## Avvio

```bash
cd apps/web
npm install
npm run sync-models   # copia i .glb e il manifest da assets-pipeline/build
npm run dev           # http://localhost:5173
```

Altri comandi, sempre in `apps/web`:

```bash
npm test              # valida le schede e la ricerca
npm run build         # controllo dei tipi + build di produzione in dist/ + service worker
npm run build:published  # versione in un solo file per la pagina dentro Claude
npm run preview       # serve dist/ su http://localhost:4173
```

I modelli si rigenerano dalle fonti con la pipeline in `assets-pipeline/` (vedi il suo README).
Parametri utili nell'URL: `?lod=lod0` (dettaglio massimo), `?lod=lod2` (dettaglio minimo).

## Struttura

| Cartella | Contenuto |
|---|---|
| `apps/web` | App React + TypeScript + React Three Fiber |
| `content/structures` | Schede anatomiche, un JSON per struttura (schema in `apps/web/src/content/schema.ts`) |
| `content/names.json` | Nomi italiano e latino di tutte le strutture con modello (generati in parte da `content/tools/translate_names.py`) |
| `content/pathways` | Vie nervose: tappe riferite a strutture reali |
| `content/brodmann.json` | Corrispondenza approssimata tra giri e aree di Brodmann |
| `content/sources.json` | Testi di riferimento citati dalle schede |
| `assets-pipeline` | Conversione delle fonti aperte in `.glb`, con licenze e attribuzioni |

## Come provare M1

1. Tocca o clicca un giro: si evidenzia e si apre la scheda. Un tocco sullo sfondo deseleziona.
2. Cerca "ippocampo" (o "hippocampus", "corno d'Ammone"): la struttura profonda resta visibile in trasparenza attraverso la corteccia.
3. "Isola" mostra solo la struttura selezionata; "Centra" la inquadra; "Sinistra/Destra" sceglie il lato.
4. In "Livelli" accendi Nuclei della base, Diencefalo e Arterie e porta l'opacità della corteccia al 20%: con un livello sotto il 50% i tocchi lo attraversano e selezionano ciò che sta dietro.
5. Su smartphone (o con la finestra stretta) scheda e livelli stanno nel pannello a scorrimento dal basso.

## Licenze dei modelli

Corpo: BodyParts3D 4.0, con polmoni e fegato dalla versione 3.0 (CC BY 4.0). Nervi, midollo spinale, falce cerebrale e dura spinale: Z-Anatomy (CC BY-SA 4.0, quindi i file derivati di questi livelli vanno ridistribuiti con la stessa licenza). Nomi italiani e latini: in parte dalla tabella TA2 di Z-Anatomy (CC BY-SA 4.0). Encefalo: SPL-PNL Brain Atlas (3D Slicer License), adattato al cranio del corpo. Attribuzioni complete nell'app (pulsante ⓘ) e in `assets-pipeline/README.md`.
