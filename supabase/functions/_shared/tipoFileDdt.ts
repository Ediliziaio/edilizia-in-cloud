/** Controlla il contenuto: rinominare un file .pdf non lo rende un DDT. */
export function tipoFileDdt(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const ascii = (a: number, b: number) =>
    new TextDecoder("latin1").decode(bytes.subarray(a, b));
  if (ascii(0, Math.min(1024, bytes.length)).includes("%PDF-"))
    return "application/pdf";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    bytes[0] === 137 &&
    ascii(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10
  )
    return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (
    ascii(4, 8) === "ftyp" &&
    /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(8, Math.min(bytes.length, 64)))
  )
    return "image/heic";
  return null;
}
