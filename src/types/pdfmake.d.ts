// pdfmake non porta i tipi e il client usa solo i punti d'ingresso che usa anche la funzione genera-pos:
// il bundle di pdfmake (createPdf) e i font, che si registrano con addVirtualFileSystem (i file) e addFonts (i nomi):
// i Roboto incorporati e, nel ramo del design, il mini-font delle caselle (registraFontPos).
declare module "pdfmake/build/pdfmake.min.js" {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, Record<string, string>>): void;
    createPdf(definizione: never): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}
declare module "pdfmake/build/vfs_fonts.js" {
  const vfs: Record<string, string>;
  export default vfs;
}
