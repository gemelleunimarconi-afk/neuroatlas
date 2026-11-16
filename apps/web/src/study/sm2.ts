/** Stato di ripetizione dilazionata di una struttura (algoritmo SM-2). */
export interface SrsItem {
  structureId: string;
  ease: number;      // fattore di facilità, minimo 1.3
  interval: number;  // giorni fino al prossimo ripasso
  reps: number;      // risposte corrette consecutive
  due: number;       // timestamp del prossimo ripasso
  lapses: number;    // quante volte è stata sbagliata
  seen: number;
  correct: number;
  lastQuality: number;
}
export const DAY = 86_400_000;

export function newItem(structureId: string): SrsItem {
  return { structureId, ease: 2.5, interval: 0, reps: 0, due: 0, lapses: 0, seen: 0, correct: 0, lastQuality: 0 };
}

/**
 * SM-2: `quality` da 0 a 5 (meno di 3 = risposta sbagliata). Una risposta sbagliata azzera la serie e
 * ripropone la struttura il giorno dopo; le corrette allungano l'intervallo: 1 giorno, 6 giorni, poi intervallo × facilità.
 */
export function review(item: SrsItem, quality: number, now: number): SrsItem {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const ease = Math.max(1.3, item.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  let reps: number, interval: number;
  if (q < 3) { reps = 0; interval = 1; }
  else { reps = item.reps + 1; interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(item.interval * ease); }
  return {
    ...item, ease, reps, interval, due: now + interval * DAY, lastQuality: q,
    lapses: item.lapses + (q < 3 ? 1 : 0), seen: item.seen + 1, correct: item.correct + (q >= 3 ? 1 : 0),
  };
}

export type Mastery = 'new' | 'learning' | 'mastered';
/** Padroneggiata: almeno due risposte corrette di fila e nessuna difficoltà marcata. */
export function mastery(item: SrsItem | undefined): Mastery {
  if (!item || item.seen === 0) return 'new';
  return item.reps >= 2 && item.ease >= 2.2 ? 'mastered' : 'learning';
}
