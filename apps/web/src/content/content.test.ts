import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCatalog, cerebellarName, searchStructures, type NameTable } from './catalog';
import { structureSchema, type Manifest } from './schema';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root + p, 'utf8'));
const manifest = json('apps/web/public/models/manifest.json') as Manifest;
const names = json('content/names.json') as NameTable;
const sources = json('content/sources.json') as Record<string, string>;
const cards = readdirSync(root + 'content/structures').map((f) => structureSchema.parse(json('content/structures/' + f)));
const catalog = buildCatalog(manifest, names, cards);

describe('contenuti anatomici', () => {
  it('ogni scheda corrisponde a una struttura con modello e cita fonti note', () => {
    for (const c of cards) {
      expect(catalog.byId.has(c.id), c.id).toBe(true);
      expect(catalog.byId.get(c.id)!.layer, c.id).toBe(c.layer);
      for (const s of c.sources) expect(sources[s], `${c.id}: fonte ${s}`).toBeTruthy();
    }
  });
  it('i rimandi tra schede puntano a strutture esistenti', () => {
    for (const c of cards) {
      const refs = [...c.relations.map((r) => r.structureId), ...c.connections.map((r) => r.targetId), ...c.bloodSupply.map((r) => r.arteryId)];
      for (const r of refs) if (r) expect(catalog.byId.has(r), `${c.id} -> ${r}`).toBe(true);
    }
  });
  it('ogni struttura con modello ha un nome italiano', () => {
    for (const s of catalog.structures) {
      expect(Array.isArray(names[s.id]) || cerebellarName(s.id) !== null, s.id).toBe(true);
    }
    for (const k of Object.keys(names)) if (k !== '_note') expect(catalog.byId.has(k), k).toBe(true);
  });
});

describe('ricerca', () => {
  it('trova per nome italiano, latino, inglese e sinonimo, senza accenti', () => {
    expect(searchStructures(catalog, 'ippoc')[0].id).toBe('hippocampus');
    expect(searchStructures(catalog, 'nucleus ruber')[0].id).toBe('red-nucleus');
    expect(searchStructures(catalog, 'pons')[0].id).toBe('pons');
    expect(searchStructures(catalog, 'corpo di luys')[0].id).toBe('subthalamic-nucleus');
    expect(searchStructures(catalog, 'talamo').length).toBeGreaterThan(3);
    expect(searchStructures(catalog, 'zzz')).toEqual([]);
  });
});

describe('vie nervose e aree di Brodmann', () => {
  const brodmann = json('content/brodmann.json').areas as Record<string, number[]>;
  it('ogni punto di ogni via si riferisce a una mesh esistente', async () => {
    const { pathwaySchema } = await import('./schema');
    const files = readdirSync(root + 'content/pathways');
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const f of files) {
      const p = pathwaySchema.parse(json('content/pathways/' + f));
      for (const t of p.tracks) for (const pt of t.points) {
        expect(catalog.byId.get(pt.ref)?.meshes.some((m) => m.side === pt.side), `${p.id}: ${pt.ref} ${pt.side}`).toBe(true);
      }
      for (const s of p.sources) expect(sources[s], `${p.id}: fonte ${s}`).toBeTruthy();
    }
  });
  it('le aree di Brodmann sono assegnate solo a strutture della corteccia', () => {
    for (const [id, areas] of Object.entries(brodmann)) {
      expect(catalog.byId.get(id)?.layer, id).toBe('cortex');
      expect(areas.every((a) => Number.isInteger(a) && a >= 1 && a <= 52), id).toBe(true);
    }
  });
});
