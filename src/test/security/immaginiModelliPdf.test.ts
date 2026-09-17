/**
 * Immagini dei modelli PDF (17/09/2026). Gli editor di Serramenti e Fotovoltaico
 * caricano logo, copertina, foto «Chi siamo», foto delle recensioni e galleria
 * lavori nei bucket privati sr-progetti e fv-progetti, e salvavano nel modello un
 * link firmato valido un anno. Allo scadere le immagini sparivano da preventivi
 * e anteprime. In produzione c'erano 9 link in sr_template_pdf, di 5 aziende, e il
 * primo scadeva il 12/05/2027.
 *
 * Nessun bucket è diventato pubblico: nel modello va il percorso del file, che si
 * firma al momento dell'uso. Si prova che:
 * - nessun editor salvi più un link firmato;
 * - chi mostra o genera le immagini le firmi prima;
 * - il salvataggio riporti a percorso i vecchi link;
 * - le edge function firmino solo i file nella cartella dell'azienda del modello.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAMPI_IMMAGINE_FOTOVOLTAICO,
  CAMPI_IMMAGINE_SERRAMENTI,
  firmaImmaginiModello,
  normalizzaImmaginiModello,
  riconosciImmagineModello,
  riferimentoImmagine,
  type Firmatario,
} from "../../../supabase/functions/_shared/immaginiModelloPdf";
import { BUCKET_RISERVATI, eRiferimentoNudo, riconosciFile } from "@/lib/storage/fileRiservati";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const editorSerramenti = leggi("src/components/serramenti/SerramentiTemplateEditor.tsx");
const editorFotovoltaico = leggi("src/components/fotovoltaico/FotovoltaicoTemplateEditor.tsx");
const galleria = leggi("src/components/shared/GalleryLavoriEditor.tsx");

/** Il blocco `{ … }` che si apre con l'ultima graffa di `intestazione`. */
function bloccoDopo(sorgente: string, intestazione: string): string {
  const pos = sorgente.indexOf(intestazione);
  if (pos < 0) throw new Error(`${intestazione} non trovata`);
  const apertura = sorgente.lastIndexOf("{", pos + intestazione.length);
  let profondita = 0;
  for (let i = apertura; i < sorgente.length; i++) {
    if (sorgente[i] === "{") profondita++;
    else if (sorgente[i] === "}" && --profondita === 0) return sorgente.slice(apertura, i + 1);
  }
  throw new Error(`il blocco dopo ${intestazione} non si chiude`);
}

/** Il corpo di `const nome = async (…) => { … }`. */
function corpoDi(sorgente: string, nome: string): string {
  const inizio = sorgente.indexOf(`const ${nome} = async`);
  if (inizio < 0) throw new Error(`${nome} non trovata`);
  return bloccoDopo(sorgente.slice(inizio), "=> {");
}

const quante = (testo: string, cosa: string) => testo.split(cosa).length - 1;

describe("gli editor salvano il percorso del file, mai un link firmato", () => {
  it("nessun editor di modello chiede un link firmato", () => {
    for (const sorgente of [editorSerramenti, editorFotovoltaico, galleria]) {
      expect(sorgente).not.toMatch(/createSignedUrls?\(/);
    }
  });

  it("i caricamenti di Serramenti scrivono il percorso nel bucket sr-progetti", () => {
    for (const nome of [
      "handleLogoUpload",
      "handleChiSiamoUpload",
      "handleTestimonianzaFotoUpload",
      "handleCoverUpload",
      "handleCoverLogoUpload",
    ]) {
      expect(corpoDi(editorSerramenti, nome)).toContain('riferimentoImmagine("sr-progetti", storagePath)');
    }
  });

  it("i caricamenti del Fotovoltaico scrivono il percorso, nella cartella dell'azienda su cui si lavora", () => {
    // Le policy di fv-progetti guardano l'azienda effettiva: con quella del
    // profilo un utente multi-azienda caricava nella cartella sbagliata.
    expect(editorFotovoltaico).toContain("const companyId = useEffectiveCompanyId();");
    for (const nome of ["handleLogoUpload", "handleCoverLogoUpload", "handleCoverUpload", "uploadTemplateImage"]) {
      const corpo = corpoDi(editorFotovoltaico, nome);
      expect(corpo).toContain('riferimentoImmagine("fv-progetti", storagePath)');
      expect(corpo).toContain("const storagePath = `${companyId}/");
      expect(corpo).not.toContain('from("profiles"');
    }
  });

  it("la galleria lavori salva il percorso nei bucket riservati e l'indirizzo pubblico negli altri", () => {
    const corpo = corpoDi(galleria, "handleFiles");
    expect(corpo).toContain("(BUCKET_RISERVATI as readonly string[]).includes(bucket)");
    expect(corpo).toContain("riferimentoImmagine(bucket, path)");
    expect(corpo).toContain("getPublicUrl(path)");
  });

  it("le miniature delle immagini del modello passano da ImgRiservata", () => {
    const campoImmagine = /src=\{[^}]*(logo_url|chi_siamo_foto_url|pdf_cover_image_url|pdf_cover_logo_url|foto_team_url|foto_url|coverLogo|item\.url)/;
    for (const sorgente of [editorSerramenti, editorFotovoltaico, galleria]) {
      const tagImg = sorgente.match(/<img\b[\s\S]*?\/>/g) ?? [];
      expect(tagImg.filter((tag) => campoImmagine.test(tag))).toEqual([]);
    }
    // e un percorso nudo non arriva mai a un src
    expect(leggi("src/hooks/useFileRiservati.ts")).toContain('eRiferimentoNudo(v) ? "" : v');
  });
});

describe("chi mostra o genera le immagini le firma prima", () => {
  it("il PDF Serramenti firma modello e logo prima di convertirli", () => {
    const corpo = bloccoDopo(
      leggi("src/hooks/useSerramentoPDF.ts"),
      "async function enrichForPdf(opts: SerramentoPdfPayload): Promise<SerramentoPdfEnriched> {",
    );
    const firma = corpo.indexOf("firmaImmaginiModello(templateSalvato, CAMPI_IMMAGINE_SERRAMENTI)");
    expect(firma).toBeGreaterThan(-1);
    expect(corpo).toContain("firmaImmagine(opts.company?.logo_url)");
    expect(corpo.indexOf("toDataUrl(template?.logo_url")).toBeGreaterThan(firma);
    // il modello non firmato si usa solo per firmarlo
    expect(quante(corpo, "templateSalvato")).toBe(2);
    expect(quante(corpo, "opts.template")).toBe(1);
  });

  it("l'anteprima con dati di esempio firma prima di convertire", () => {
    const corpo = bloccoDopo(leggi("src/lib/serramenti/mockPdfData.ts"), "}): Promise<SerramentoPdfEnriched> {");
    expect(corpo).toContain("firmaImmaginiModello(opts.template ?? null, CAMPI_IMMAGINE_SERRAMENTI)");
    expect(corpo).toContain("firmaImmagine(opts.companyLogoUrl)");
    expect(quante(corpo, "opts.template")).toBe(1);
    expect(quante(corpo, "opts.companyLogoUrl")).toBe(1);
  });

  it("il PDF salta le foto della galleria rimaste senza indirizzo", () => {
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toContain(".filter((item) => Boolean(item?.url))");
  });

  it.each([
    "src/components/fotovoltaico/FvLivePreviewPanel.tsx",
    "src/components/fotovoltaico/FvTemplatePreviewDialog.tsx",
  ])("%s compone l'HTML con il modello firmato", (file) => {
    const sorgente = leggi(file);
    expect(sorgente).toMatch(/const form = useImmaginiModelloFirmate\([^;]*CAMPI_IMMAGINE_FOTOVOLTAICO\);/);
    expect(sorgente).toMatch(/const logoUrl = useFileRiservato\([^;]*\) \|\| null;/);
    // le props grezze servono solo per firmare
    expect(quante(sorgente, "formSalvato")).toBe(2);
    expect(quante(sorgente, "logoSalvato")).toBe(2);
  });
});

describe("il salvataggio riporta i vecchi link a percorso", () => {
  it("Serramenti", () => {
    const corpo = bloccoDopo(
      leggi("src/lib/serramenti/api.ts"),
      "export async function upsertTemplatePdf(patch: Partial<SrTemplatePdfRow>, companyId: string): Promise<void> {",
    );
    expect(corpo).toContain(
      "normalizzaImmaginiModello({ ...patch, company_id: companyId }, CAMPI_IMMAGINE_SERRAMENTI, companyId)",
    );
    expect(corpo).toContain(".upsert(riga, {");
  });

  it("Fotovoltaico", () => {
    const corpo = bloccoDopo(leggi("src/lib/fotovoltaico/queries.ts"), "export function useUpsertTemplatePdf() {");
    expect(corpo).toContain(
      "normalizzaImmaginiModello({ ...input, company_id: companyId }, CAMPI_IMMAGINE_FOTOVOLTAICO, companyId)",
    );
    expect(corpo).toContain(".upsert(riga as never, {");
  });
});

describe("le edge function firmano solo i file dell'azienda del modello", () => {
  it.each([
    ["supabase/functions/sr-genera-pdf/index.ts", "CAMPI_IMMAGINE_SERRAMENTI"],
    ["supabase/functions/sr-public-progetto/index.ts", "CAMPI_IMMAGINE_SERRAMENTI"],
    ["supabase/functions/fv-genera-pdf/index.ts", "CAMPI_IMMAGINE_FOTOVOLTAICO"],
  ])("%s", (file, campi) => {
    const sorgente = leggi(file);
    expect(sorgente).toContain('from "../_shared/immaginiModelloPdf.ts"');
    expect(sorgente).toMatch(
      new RegExp(`firmaImmaginiModello\\(\\s*[^,]+,\\s*${campi},\\s*firmatarioStorage\\([^)]*\\),\\s*prog\\.company_id,\\s*\\)`),
    );
  });

  it("sr-genera-pdf non rifirma più il logo con un percorso qualsiasi del bucket", () => {
    expect(leggi("supabase/functions/sr-genera-pdf/index.ts")).not.toContain("refreshSrProgettiUrl(data.azienda_logo_url");
  });

  it("fv-genera-pdf prende la galleria cantieri dal modello firmato", () => {
    const sorgente = leggi("supabase/functions/fv-genera-pdf/index.ts");
    expect(sorgente).toContain("(template as Record<string, unknown>).cantieri_galleria");
    expect(sorgente).not.toContain("templateRes.data as Record<string, unknown> | null)?.cantieri_galleria");
  });
});

describe("regole del percorso", () => {
  const AZIENDA = "11111111-1111-4111-8111-111111111111";
  const ALTRA = "22222222-2222-4222-8222-222222222222";
  const linkFirmato = (bucket: string, path: string) =>
    `https://progetto.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=eyJhbGciOi.eyJ1cmwiOi.firma`;

  it("riconosce percorso e link dei due bucket dei modelli, e nient'altro", () => {
    expect(riconosciImmagineModello(`sr-progetti/${AZIENDA}/template-logos/a.png`)).toEqual({
      bucket: "sr-progetti",
      path: `${AZIENDA}/template-logos/a.png`,
    });
    expect(riconosciImmagineModello(linkFirmato("fv-progetti", `${AZIENDA}/template-team/b.jpg`))).toEqual({
      bucket: "fv-progetti",
      path: `${AZIENDA}/template-team/b.jpg`,
    });
    expect(riconosciImmagineModello("/templates/serramenti/covers/villa.webp")).toBeNull();
    expect(riconosciImmagineModello("https://images.unsplash.com/photo-1")).toBeNull();
    expect(riconosciImmagineModello("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
    expect(riconosciImmagineModello("https://progetto.supabase.co/storage/v1/object/public/company-logos/l.webp")).toBeNull();
    expect(riconosciImmagineModello("campo-firme/a/b.png")).toBeNull();
    expect(riconosciImmagineModello(null)).toBeNull();
  });

  it("il browser tratta il percorso come un file riservato da firmare", () => {
    const rif = riferimentoImmagine("sr-progetti", `${AZIENDA}/template-logos/a.png`);
    expect(riconosciFile(rif)).toEqual({ bucket: "sr-progetti", path: `${AZIENDA}/template-logos/a.png` });
    expect(BUCKET_RISERVATI).toEqual(expect.arrayContaining(["sr-progetti", "fv-progetti"]));
    expect(eRiferimentoNudo(rif)).toBe(true);
    expect(eRiferimentoNudo(linkFirmato("sr-progetti", `${AZIENDA}/x.png`))).toBe(false);
    expect(eRiferimentoNudo("/templates/serramenti/covers/villa.webp")).toBe(false);
    expect(eRiferimentoNudo("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });

  it("al salvataggio tornano percorso i link della propria cartella, quelli altrui restano", () => {
    const modello = {
      company_id: AZIENDA,
      logo_url: linkFirmato("sr-progetti", `${AZIENDA}/template-logos/a.png`),
      chi_siamo_foto_url: linkFirmato("sr-progetti", `${ALTRA}/template-chi-siamo/b.jpg`),
      pdf_cover_image_url: "https://images.unsplash.com/photo-1",
      testimonianze_default: [
        { autore: "Anna", foto_url: linkFirmato("sr-progetti", `${AZIENDA}/template-recensioni/c.jpg`) },
        { autore: "Luca" },
      ],
      gallery_lavori: [{ id: "1", url: `sr-progetti/${AZIENDA}/gallery-lavori/d.jpg` }],
    };
    const salvato = normalizzaImmaginiModello(modello, CAMPI_IMMAGINE_SERRAMENTI, AZIENDA);
    expect(salvato.logo_url).toBe(`sr-progetti/${AZIENDA}/template-logos/a.png`);
    expect(salvato.chi_siamo_foto_url).toBe(modello.chi_siamo_foto_url);
    expect(salvato.pdf_cover_image_url).toBe(modello.pdf_cover_image_url);
    expect(salvato.testimonianze_default[0].foto_url).toBe(`sr-progetti/${AZIENDA}/template-recensioni/c.jpg`);
    expect(salvato.testimonianze_default[1]).toBe(modello.testimonianze_default[1]);
    expect(salvato.gallery_lavori).toBe(modello.gallery_lavori);
    // Un modello già a posto resta lo stesso oggetto.
    expect(normalizzaImmaginiModello(salvato, CAMPI_IMMAGINE_SERRAMENTI, AZIENDA)).toBe(salvato);
  });

  it("firma una volta per bucket, solo nella cartella dell'azienda, e ripiega su null", async () => {
    const chiamate: [string, string[]][] = [];
    const firma: Firmatario = async (bucket, percorsi) => {
      chiamate.push([bucket, percorsi]);
      return percorsi.map((p) => (p.includes("mancante") ? null : `https://firmato/${bucket}/${p}?token=nuovo`));
    };
    const modello = {
      logo_url: `fv-progetti/${AZIENDA}/template-logos/a.png`,
      pdf_cover_image_url: linkFirmato("fv-progetti", `${ALTRA}/template-covers/c.jpg`),
      pdf_cover_logo_url: `fv-progetti/${AZIENDA}/template-logos/mancante.png`,
      foto_team_url: `fv-progetti/${ALTRA}/template-team/b.jpg`,
      recensioni: [{ nome: "Anna", foto_url: `fv-progetti/${AZIENDA}/template-recensioni/d.jpg` }],
    };
    const firmato = await firmaImmaginiModello(modello, CAMPI_IMMAGINE_FOTOVOLTAICO, firma, AZIENDA);

    expect(chiamate).toEqual([
      [
        "fv-progetti",
        [
          `${AZIENDA}/template-logos/a.png`,
          `${AZIENDA}/template-logos/mancante.png`,
          `${AZIENDA}/template-recensioni/d.jpg`,
        ],
      ],
    ]);
    expect(firmato.logo_url).toBe(`https://firmato/fv-progetti/${AZIENDA}/template-logos/a.png?token=nuovo`);
    expect(firmato.recensioni[0].foto_url).toBe(
      `https://firmato/fv-progetti/${AZIENDA}/template-recensioni/d.jpg?token=nuovo`,
    );
    // Percorso di un'altra azienda: nessuna firma, e non si mostra.
    expect(firmato.foto_team_url).toBeNull();
    // Firma non riuscita: null, così scatta il ripiego.
    expect(firmato.pdf_cover_logo_url).toBeNull();
    // Vecchio link di un'altra cartella: non si rifirma, resta finché vale.
    expect(firmato.pdf_cover_image_url).toBe(modello.pdf_cover_image_url);
    // Il modello di partenza non cambia.
    expect(modello.logo_url).toBe(`fv-progetti/${AZIENDA}/template-logos/a.png`);
  });

  it("senza immagini riservate non chiama lo storage e restituisce lo stesso modello", async () => {
    let chiamato = false;
    const firma: Firmatario = async (_bucket, percorsi) => {
      chiamato = true;
      return percorsi.map((): string | null => null);
    };
    const modello = {
      logo_url: "https://progetto.supabase.co/storage/v1/object/public/company-logos/l.webp",
      gallery_lavori: [] as { id: string; url: string }[],
    };
    expect(await firmaImmaginiModello(modello, CAMPI_IMMAGINE_SERRAMENTI, firma, AZIENDA)).toBe(modello);
    expect(chiamato).toBe(false);
  });
});
