import { useEffect, useRef } from 'react';
import { useAtlas } from '@/store/atlas';
import { btn } from './util';

/** Attribuzioni e licenze, generate dal manifest dei modelli. */
export function Credits({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const manifest = useAtlas((s) => s.catalog)!.manifest;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="credits-title"
      className="m-auto w-[min(92vw,36rem)] rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <h2 id="credits-title" className="text-lg font-semibold text-slate-900 dark:text-white">Crediti e licenze</h2>
      <p className="mt-2 text-sm">I modelli 3D derivano da dati aperti, convertiti e semplificati per NeuroAtlas.</p>
      <ul className="mt-3 space-y-3 text-sm">
        {Object.values(manifest.sources).map((s) => (
          <li key={s.name}>
            <p className="font-medium text-slate-900 dark:text-white"><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></p>
            <p>{s.attribution}</p>
            <p>Licenza: <a className="underline" href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a></p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">Il corpo, le arterie e alcuni nervi provengono da BodyParts3D (un singolo individuo). L'encefalo dettagliato proviene dall'atlante SPL-PNL, un individuo diverso, ed è stato adattato alla cavità cranica del corpo con una trasformazione affine: i rapporti tra encefalo, vasi e cranio sono quindi indicativi. Nervi periferici e cranici, midollo spinale, falce cerebrale e dura spinale provengono da Z-Anatomy, che ha rimodellato lo stesso corpo in una posa leggermente diversa: sono stati riposizionati seguendo le ossa, con un errore residuo di alcuni millimetri.</p>
      <p className="mt-2 text-sm">Le schede anatomiche contrassegnate come bozza non sono ancora state revisionate. NeuroAtlas è uno strumento di studio e non sostituisce i testi di riferimento.</p>
      <div className="mt-4 text-right"><button type="button" className={btn} onClick={onClose}>Chiudi</button></div>
    </dialog>
  );
}
