import { disegnaPdfPos, type MotorePdf, type ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";

/**
 * pdfmake 0.3.9 e i suoi font (Roboto), caricati solo quando c'è un PDF del POS da disegnare: circa 0,8 MB compressi
 * che non pesano su nessun'altra pagina. È lo stesso pdfmake, alla stessa versione, della funzione genera-pos, con lo
 * stesso codice di layout: il PDF del browser ha l'aspetto di quello che prima disegnava il server.
 *
 * Questo è il ripiego nel thread principale, per dove il Worker non c'è (ambienti di prova, browser molto vecchi): il
 * Worker vero (posPdf.worker.ts) importa le stesse librerie in modo statico, perché un Worker di produzione è un file unico.
 */
let motore: Promise<MotorePdf> | null = null;

function caricaMotore(): Promise<MotorePdf> {
  motore ??= (async () => {
    const [m, f] = await Promise.all([import("pdfmake/build/pdfmake.min.js"), import("pdfmake/build/vfs_fonts.js")]);
    // Un modulo UMD arriva come «default» nel browser e nei test: si accettano entrambe le forme.
    const pdfMake = (m as { default?: typeof m.default }).default ?? (m as unknown as typeof m.default);
    pdfMake.addVirtualFileSystem((f as { default?: typeof f.default }).default ?? (f as unknown as typeof f.default));
    return pdfMake as MotorePdf;
  })();
  // Un caricamento andato male (rete) si può ritentare alla richiesta dopo.
  motore.catch(() => { motore = null; });
  return motore;
}

export async function disegnaConPdfmake(p: ParametriDisegnoPos): Promise<Uint8Array> {
  return disegnaPdfPos(await caricaMotore(), p);
}
