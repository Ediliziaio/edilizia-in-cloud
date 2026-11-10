/** Decoder fissato alla versione verificata; nessun invio del documento a servizi di conversione. */
interface HeifImage {
  is_primary(): boolean;
  get_width(): number;
  get_height(): number;
  display(
    rgba: { width: number; height: number; data: Uint8ClampedArray },
    callback: (value: unknown) => void,
  ): void;
  free(): void;
}
interface HeifModule {
  HeifDecoder: new () => {
    decode(bytes: Uint8Array): HeifImage[];
    decoder?: number;
  };
  heif_context_free(pointer: number): void;
}
export async function heicInJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: build } = await import(
    "https://esm.sh/heic-to@1.6.7/src/lib/libheif-without-unsafe-eval.js?target=denonext"
  );
  const { default: jpeg } = await import("npm:jpeg-js@0.4.4");
  const lib = build() as unknown as HeifModule;
  const decoder = new lib.HeifDecoder();
  let immagini: HeifImage[] = [];
  try {
    immagini = decoder.decode(bytes);
    const principale = immagini.find((i) => i.is_primary()) ?? immagini[0];
    if (!principale) throw new Error("HEIC illeggibile");
    const width = principale.get_width(),
      height = principale.get_height();
    if (width < 1 || height < 1 || width * height > 16000000)
      throw new Error(
        "Foto HEIC troppo grande: caricala dall’app per ridurla prima",
      );
    const rgba = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    };
    await new Promise<void>((resolve, reject) =>
      principale.display(rgba, (r: unknown) =>
        r ? resolve() : reject(new Error("Conversione HEIC non riuscita")),
      ),
    );
    const fattore = Math.min(1, 2560 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * fattore)),
      h = Math.max(1, Math.round(height * fattore));
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const origine =
          (Math.min(height - 1, Math.floor(y / fattore)) * width +
            Math.min(width - 1, Math.floor(x / fattore))) *
          4;
        const target = (y * w + x) * 4;
        data[target] = rgba.data[origine];
        data[target + 1] = rgba.data[origine + 1];
        data[target + 2] = rgba.data[origine + 2];
        data[target + 3] = 255;
      }
    return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 94).data);
  } finally {
    for (const i of immagini) i.free();
    if (decoder.decoder) lib.heif_context_free(decoder.decoder);
  }
}
