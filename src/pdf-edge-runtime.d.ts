/** Il renderer dei rapportini è condiviso con la Edge Function; Vite usa il pacchetto locale. */
declare module "https://esm.sh/pdf-lib@1.17.1" {
  export * from "pdf-lib";
}

/** fontkit 2 per il piè in EB Garamond del rapportino (10/11/2026): nella edge da esm.sh, in Vite il pacchetto locale. */
declare module "https://esm.sh/fontkit@2.0.4" {
  export function create(buffer: Uint8Array, postscriptName?: string): unknown;
}
