import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalog, type NameTable } from '@/content/catalog';
import { structureSchema, type Manifest } from '@/content/schema';
import { useAtlas } from '@/store/atlas';
import { DAY, mastery, newItem, review } from './sm2';
import { CASES, REGIONS, buildQuestions, pool, progress, useStudy } from './store';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root + p, 'utf8'));
const cards = readdirSync(root + 'content/structures').map((f) => structureSchema.parse(json('content/structures/' + f)));
const catalog = buildCatalog(json('apps/web/public/models/manifest.json') as Manifest, json('content/names.json') as NameTable, cards);
beforeAll(() => useAtlas.getState().setCatalog(catalog));

describe('SM-2', () => {
  it('le risposte corrette allungano l\'intervallo: 1 giorno, 6 giorni, poi × facilità', () => {
    let it0 = review(newItem('x'), 5, 0);
    expect([it0.reps, it0.interval, it0.due]).toEqual([1, 1, DAY]);
    it0 = review(it0, 5, 0); expect(it0.interval).toBe(6);
    it0 = review(it0, 5, 0); expect(it0.interval).toBe(Math.round(6 * it0.ease));
    expect(it0.ease).toBeCloseTo(2.8);
    expect(mastery(it0)).toBe('mastered');
  });
  it('una risposta sbagliata azzera la serie, ripropone il giorno dopo e abbassa la facilità (mai sotto 1.3)', () => {
    let x = review(review(newItem('x'), 4, 0), 4, 0);
    x = review(x, 2, 0);
    expect([x.reps, x.interval, x.lapses]).toEqual([0, 1, 1]);
    expect(x.ease).toBeLessThan(2.5);
    for (let i = 0; i < 20; i++) x = review(x, 0, 0);
    expect(x.ease).toBe(1.3);
    expect(mastery(x)).toBe('learning');
    expect(mastery(undefined)).toBe('new');
  });
});

describe('domande', () => {
  it('ogni regione ha abbastanza strutture e nessun lobulo cerebellare', () => {
    for (const r of REGIONS) {
      const p = pool(catalog, r.id);
      expect(p.length, r.id).toBeGreaterThanOrEqual(8);
      expect(p.some((e) => e.id.startsWith('cerebellar-lobule'))).toBe(false);
    }
  });
  it('le domande a scelta hanno 4 opzioni distinte, una sola corretta', () => {
    for (const mode of ['identify', 'latin', 'function'] as const) {
      const qs = buildQuestions(catalog, mode, 'deep', {}, 0);
      expect(qs.length, mode).toBeGreaterThanOrEqual(5);
      for (const q of qs) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options!.map((o) => o.label)).size).toBe(4);
        expect(q.options!.filter((o) => q.accepted.includes(o.id))).toHaveLength(1);
      }
    }
    const f = buildQuestions(catalog, 'function', 'all', {}, 0)[0];
    expect(f.detail!.toLowerCase()).not.toContain(catalog.byId.get(f.structureId)!.names.it.toLowerCase());
  });
  it('il ripasso propone solo le strutture in scadenza, la più vecchia per prima', () => {
    const srs = { pons: { ...newItem('pons'), seen: 1, due: 50 }, hippocampus: { ...newItem('hippocampus'), seen: 1, due: 10 }, amygdala: { ...newItem('amygdala'), seen: 1, due: 999 } };
    const qs = buildQuestions(catalog, 'review', 'all', srs, 100);
    expect(qs.map((q) => q.structureId)).toEqual(['hippocampus', 'pons']);
  });
  it('i casi clinici indicano strutture esistenti', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(10);
    for (const c of CASES) for (const a of c.answer) expect(catalog.byId.has(a), `${c.id}: ${a}`).toBe(true);
  });
});

describe('sessione', () => {
  it('"trova sul modello": il tocco è la risposta, il nome resta nascosto fino alla risposta, lo stato SM-2 viene aggiornato', () => {
    expect(useStudy.getState().start('locate', 'cortex')).toBeNull();
    const q = useStudy.getState().session!.questions[0];
    expect(useAtlas.getState().quiz).toEqual({ mode: 'locate', reveal: false });
    expect(useAtlas.getState().layers.cortex.visible).toBe(true);
    const wrong = pool(catalog, 'cortex').find((e) => e.id !== q.structureId)!;
    useAtlas.getState().select(wrong.id);                       // tocco sul modello
    expect(useAtlas.getState().selection).toBeNull();           // nessuna scheda rivelata
    useStudy.getState().answer(useAtlas.getState().quizTap!.structureId);
    expect(useStudy.getState().session!.answered).toMatchObject({ correct: false });
    expect(useAtlas.getState().selection!.structureId).toBe(q.structureId); // mostra la risposta giusta
    expect(useStudy.getState().srs[q.structureId]).toMatchObject({ lapses: 1, reps: 0 });
    const stats = progress(catalog, useStudy.getState().srs, Date.now() + 2 * DAY);
    expect(stats.weak[0].structureId).toBe(q.structureId);
    expect(stats.due).toBe(1);
    useStudy.getState().quit();
    expect(useAtlas.getState().quiz).toBeNull();
  });
});
