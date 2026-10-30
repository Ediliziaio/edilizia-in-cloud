// pdfmake non porta i tipi e il client usa solo due punti d'ingresso, gli stessi che usa la funzione genera-pos:
// il bundle di pdfmake (createPdf) e i font incorporati (Roboto), che si registrano con addVirtualFileSystem.
declare module "pdfmake/build/pdfmake.min.js" {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(definizione: never): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}
declare module "pdfmake/build/vfs_fonts.js" {
  const vfs: Record<string, string>;
  export default vfs;
}
