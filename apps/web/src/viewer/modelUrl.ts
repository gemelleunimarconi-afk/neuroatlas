import type { LayerId } from '@/content/schema';

// Dove l'hosting non serve file .glb (anteprima pubblicata) i modelli sono incapsulati in JSON: { "glb": "<base64>" }.
export const WRAPPED = import.meta.env.VITE_MODEL_FORMAT === 'json';
declare const __MODELS_VERSION__: string;
export const modelUrl = (layer: LayerId, lod: string) =>
  `${import.meta.env.BASE_URL}models/${layer}.${lod}.${WRAPPED ? 'json' : `glb?v=${__MODELS_VERSION__}`}`;

