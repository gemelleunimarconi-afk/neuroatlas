import { z } from 'zod';

export const LAYER_IDS = [
  'cortex', 'sulci', 'white-matter', 'basal-ganglia', 'diencephalon', 'limbic',
  'brainstem', 'cerebellum', 'ventricles', 'cranial-nerves', 'vessels', 'meninges',
  'body-skin', 'body-muscles', 'body-skeleton', 'body-ligaments', 'body-heart', 'body-arteries', 'body-veins',
  'body-nerves', 'body-spinal-cord', 'body-respiratory', 'body-digestive', 'body-urogenital', 'body-endocrine', 'body-sense',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Scheda anatomica: un file JSON per struttura in /content/structures. `id` = id struttura del manifest dei modelli. */
export const structureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  names: z.object({
    it: z.string().min(1),
    la: z.string().min(1),
    en: z.string().min(1),
    synonyms: z.array(z.string()).default([]),
  }),
  parent: z.string().nullable(),
  layer: z.enum(LAYER_IDS),
  side: z.enum(['bilateral', 'midline']),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  location: z.string().min(1),
  relations: z.array(z.object({ direction: z.string(), structureId: z.string().optional(), text: z.string() })),
  function: z.string().min(1),
  connections: z.array(z.object({
    type: z.enum(['afferent', 'efferent', 'reciprocal']),
    targetId: z.string().optional(),
    via: z.string().optional(),
    text: z.string(),
  })),
  bloodSupply: z.array(z.object({ arteryId: z.string().optional(), text: z.string() })),
  clinical: z.array(z.object({ title: z.string(), text: z.string() })),
  pathways: z.array(z.string()).default([]),
  brodmann: z.array(z.number().int()).default([]),
  tags: z.array(z.string()).default([]),
  sources: z.array(z.string()).min(1),
  review: z.enum(['draft', 'reviewed']),
});
export type StructureCard = z.infer<typeof structureSchema>;

export interface ManifestMesh {
  id: string;
  structure: string;
  side: 'L' | 'R' | 'M';
  layer: LayerId;
  labelEn: string;
  source: string;
  sourceId: string;
  registration: 'native' | 'affine-approx';
  color: [number, number, number];
  triangles: number;
  centroid: [number, number, number];
  bbox: [[number, number, number], [number, number, number]];
}
export interface ManifestSource { name: string; license: string; licenseUrl: string; url: string; attribution: string }
export interface Manifest {
  space: string;
  sources: Record<string, ManifestSource>;
  layers: Record<string, { meshes: number; triangles: number; files: Record<string, { file: string; bytes: number; triangles: number }> }>;
  meshes: ManifestMesh[];
}

/** Punto di una via: baricentro di una struttura (o un suo estremo), con uno spostamento opzionale in mm [sinistra, alto, avanti]. */
export const pathwayPointSchema = z.object({
  ref: z.string(),
  side: z.enum(['L', 'R', 'M']),
  at: z.enum(['bottom', 'top']).optional(),
  shift: z.tuple([z.number(), z.number(), z.number()]).optional(),
  label: z.string().optional(),
  note: z.string().optional(),
});
/** Via nervosa. `kind: "schematic"` = percorso disegnato tra strutture reali, non un dato di trattografia. */
export const pathwaySchema = z.object({
  id: z.string(),
  names: z.object({ it: z.string(), la: z.string().optional(), en: z.string() }),
  kind: z.literal('schematic'),
  summary: z.string(),
  tracks: z.array(z.object({ label: z.string(), color: z.string(), points: z.array(pathwayPointSchema).min(2) })).min(1),
  sources: z.array(z.string()),
  review: z.enum(['draft', 'reviewed']),
});
export type Pathway = z.infer<typeof pathwaySchema>;
export type PathwayPoint = z.infer<typeof pathwayPointSchema>;
