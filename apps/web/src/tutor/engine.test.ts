import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalog, type NameTable } from '@/content/catalog';
import { structureSchema, type Manifest } from '@/content/schema';
import { useAtlas } from '@/store/atlas';
import { MODULES, buildContext, buildInput, buildTools } from './engine';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root + p, 'utf8'));
const cards = readdirSync(root + 'content/structures').map((f) => structureSchema.parse(json('content/structures/' + f)));
const catalog = buildCatalog(json('apps/web/public/models/manifest.json') as Manifest, json('content/names.json') as NameTable, cards, json('content/brodmann.json').areas);
const pathwayIds = readdirSync(root + 'content/pathways').map((f) => f.replace('.json', ''));

beforeAll(() => useAtlas.getState().setCatalog(catalog));
const tool = (name: string, used: string[] = []) => buildTools(catalog, (a) => used.push(a)).find((t) => t.name === name)!;

describe('tutor: contesto', () => {
  it('i turni iniziano e finiscono con un turno utente e contengono regole, stato e scheda pertinente', () => {
    useAtlas.getState().select('hippocampus');
    const input = buildInput(catalog, [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }], 'Che cosa fa?', null);
    expect(input[0].role).toBe('user');
    expect(input.at(-1)!.role).toBe('user');
    expect(input[0].content).toContain('Non inventare');
    const last = input.at(-1)!.content;
    expect(last).toContain('Struttura selezionata: Ippocampo [hippocampus]');
    expect(last).toContain('via perforante'); // dalla scheda verificata
    expect(last).toContain('Che cosa fa?');
  });
  it('recupera la scheda di una struttura nominata nella domanda', () => {
    useAtlas.getState().clearSelection();
    expect(buildContext(catalog, 'Parlami della sostanza nera nel Parkinson', null)).toContain('[substantia-nigra]');
  });
  it('i percorsi guidati rimandano a strutture e vie esistenti', () => {
    expect(MODULES).toHaveLength(8);
    for (const m of MODULES) {
      for (const f of m.focus) expect(catalog.byId.has(f), `${m.id}: ${f}`).toBe(true);
      for (const p of m.pathways) expect(pathwayIds, `${m.id}: ${p}`).toContain(p);
      expect(m.objectives.length).toBeGreaterThanOrEqual(3);
    }
    expect(buildContext(catalog, 'Iniziamo', 'vie')).toContain('Obiettivi di apprendimento');
  });
});

describe('tutor: strumenti', () => {
  it('search_structures trova l\'id e highlight_structure seleziona la struttura e il lato', () => {
    const found = tool('search_structures').execute({ query: 'amigdala' }) as { id: string }[];
    expect(found[0].id).toBe('amygdala');
    const used: string[] = [];
    tool('highlight_structure', used).execute({ id: 'amygdala', side: 'left' });
    expect(useAtlas.getState().selection).toEqual({ structureId: 'amygdala', meshId: 'amygdala-l' });
    expect(used).toEqual(['Evidenziato: Amigdala']);
  });
  it('un id inventato produce un errore che spiega come rimediare', () => {
    expect(() => tool('highlight_structure').execute({ id: 'nucleo-inventato' })).toThrow(/search_structures/);
    expect(() => tool('show_pathway').execute({ id: 'via-inventata' })).toThrow(/Id validi/);
  });
  it('set_section_plane, show_pathway e focus_camera cambiano lo stato dell\'atlante', () => {
    tool('set_section_plane').execute({ plane: 'coronal', position: 2 });
    expect(useAtlas.getState().section).toEqual({ axis: 'coronal', position: 1, flip: false });
    tool('set_section_plane').execute({ plane: 'none' });
    expect(useAtlas.getState().section).toBeNull();
    tool('show_pathway').execute({ id: 'papez' });
    expect(useAtlas.getState().pathwayId).toBe('papez');
    expect(useAtlas.getState().layers.limbic.visible).toBe(true);
    tool('show_pathway').execute({ id: 'none' });
    expect(useAtlas.getState().pathwayId).toBeNull();
    tool('focus_camera').execute({ view: 'inferior', scope: 'brain' });
    expect(useAtlas.getState().cameraRequest).toMatchObject({ kind: 'view', view: 'inferior' });
    expect(tool('get_structure_card').execute({ id: 'pons' })).toContain('solco bulbopontino');
  });
});
