import type { Mesh3D, PosizioneModello3D } from "./tipi";

export type GeometriaModello = Pick<Mesh3D, "posizioni" | "normali">;

/** Le posizioni già trasformate sono quelle del visore. Nel GLB le istanze possono condividere la sorgente. */
export const istanzeGlb = new WeakMap<Mesh3D["posizioni"], {
  geometria: GeometriaModello;
  posa: PosizioneModello3D<string>;
}>();
