import Dexie, { type Table } from 'dexie';
import { create } from 'zustand';

/** Dati personali dello studente, salvati solo in questo browser (IndexedDB). */
export interface Note { structureId: string; text: string; updatedAt: number }
export interface Bookmark { structureId: string; createdAt: number }

class UserDb extends Dexie {
  notes!: Table<Note, string>;
  bookmarks!: Table<Bookmark, string>;
  constructor() {
    super('neuroatlas-user');
    this.version(1).stores({ notes: 'structureId, updatedAt', bookmarks: 'structureId, createdAt' });
  }
}
const db = new UserDb();

interface UserState {
  notes: Record<string, Note>;
  bookmarks: Record<string, Bookmark>;
  /** false se il browser non permette il salvataggio: i dati restano solo fino alla chiusura della pagina */
  persistent: boolean;
  load: () => Promise<void>;
  setNote: (structureId: string, text: string) => void;
  toggleBookmark: (structureId: string) => void;
}

export const useUser = create<UserState>((set, get) => ({
  notes: {},
  bookmarks: {},
  persistent: true,
  load: async () => {
    try {
      const [notes, bookmarks] = await Promise.all([db.notes.toArray(), db.bookmarks.toArray()]);
      set({
        notes: Object.fromEntries(notes.map((n) => [n.structureId, n])),
        bookmarks: Object.fromEntries(bookmarks.map((b) => [b.structureId, b])),
      });
    } catch {
      set({ persistent: false });
    }
  },
  setNote: (structureId, text) => {
    const notes = { ...get().notes };
    if (text.trim()) {
      notes[structureId] = { structureId, text, updatedAt: Date.now() };
      db.notes.put(notes[structureId]).catch(() => set({ persistent: false }));
    } else {
      delete notes[structureId];
      db.notes.delete(structureId).catch(() => set({ persistent: false }));
    }
    set({ notes });
  },
  toggleBookmark: (structureId) => {
    const bookmarks = { ...get().bookmarks };
    if (bookmarks[structureId]) {
      delete bookmarks[structureId];
      db.bookmarks.delete(structureId).catch(() => set({ persistent: false }));
    } else {
      bookmarks[structureId] = { structureId, createdAt: Date.now() };
      db.bookmarks.put(bookmarks[structureId]).catch(() => set({ persistent: false }));
    }
    set({ bookmarks });
  },
}));
