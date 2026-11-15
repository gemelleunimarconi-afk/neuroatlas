import names from '@content/names.json';
import brodmann from '@content/brodmann.json';
import { pathwaySchema, type Pathway } from './schema';
import { buildCatalog, type Catalog, type NameTable } from './catalog';
import { structureSchema, type Manifest, type StructureCard } from './schema';

const files = import.meta.glob('@content/structures/*.json', { eager: true, import: 'default' });

export function loadCards(): StructureCard[] {
  return Object.entries(files).map(([path, raw]) => {
    const parsed = structureSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Scheda non valida ${path}: ${parsed.error.message}`);
    return parsed.data;
  });
}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}models/manifest.json`);
  if (!res.ok) throw new Error(`Manifest dei modelli non trovato (${res.status}). Esegui "npm run sync-models".`);
  return buildCatalog((await res.json()) as Manifest, names as unknown as NameTable, loadCards(), brodmann.areas);
}

const pathwayFiles = import.meta.glob('@content/pathways/*.json', { eager: true, import: 'default' });
/** Vie nervose, nell'ordine dei moduli di studio. */
const ORDER = ['corticospinal', 'medial-lemniscus', 'spinothalamic', 'basal-ganglia-direct', 'basal-ganglia-indirect', 'papez', 'visual', 'auditory', 'cerebellar'];
export const PATHWAYS: Pathway[] = Object.values(pathwayFiles)
  .map((raw) => pathwaySchema.parse(raw))
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
