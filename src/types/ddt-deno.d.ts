// Queste dipendenze sono risolte da Deno sul server. I test Node ne controllano
// il chiamante senza scaricare moduli remoti durante il typecheck del frontend.
declare module "https://esm.sh/heic-to@1.6.7/src/lib/libheif-without-unsafe-eval.js?target=denonext" {
  const build: () => unknown;
  export default build;
}
declare module "npm:jpeg-js@0.4.4" {
  const jpeg: {
    encode(
      image: { data: Uint8Array; width: number; height: number },
      quality: number,
    ): { data: Uint8Array };
  };
  export default jpeg;
}
