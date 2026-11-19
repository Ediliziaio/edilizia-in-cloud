/**
 * Il modello del «Preventivo con computo» di un'azienda (29/10/2026): la veste
 * del PDF (colori, copertina, logo, premessa, firma, piè di pagina) e le
 * condizioni che ogni computo nuovo trova già scritte. Si imposta in
 * Impostazioni → Modelli preventivi → Preventivo generico → Computo metrico;
 * vive in `computo_modelli`, una riga per azienda.
 *
 * Un campo che manca prende il valore di serie: un modello salvato prima di un
 * campo nuovo resta valido, e un'azienda senza modello stampa come prima.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { BozzaComputo } from "./editorNativo";
import { testoPiano, type Clausola } from "@/lib/condizioni/archivio";
import { condizioniStandard } from "@/lib/condizioniStandard";
import { FONT_DOCUMENTO_IDS } from "./fontDocumento";

const colore = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const testo = (max: number) => z.string().max(max).default("");
const carattere = z.enum(FONT_DOCUMENTO_IDS);
const percorsoAsset = z.string().max(500).refine(s => !s || /^[\w-]+\/[\w./-]+$/.test(s) && !s.includes(".."), "File non valido").default("");
export const campoModelloSchema = z.object({
  chiave: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/), etichetta: z.string().min(1).max(80),
  valore: z.string().max(3000).default(""), mostraNelDocumento: z.boolean().default(true),
});

export const modelloComputoSchema = z.object({
  /** Vuoto = il colore del marchio dell'azienda. */
  colorePrimario: colore.or(z.literal("")).default(""),
  /** La copertina della prima pagina: fascia piena col colore, banda sottile, oppure sobria senza colore. */
  copertina: z.enum(["piena", "editoriale", "fascia", "sobria"]).default("piena"),
  fontFamiglia: carattere.default("helvetica"),
  fontTitoli: carattere.nullable().default(null),
  dimensioneTitolo: z.number().min(18).max(48).default(34),
  dimensioneSottotitoli: z.number().min(9).max(20).default(11),
  dimensioneTesto: z.number().min(8).max(12).default(9.5),
  fontPersonalizzato: z.object({ nome: z.string().min(1).max(100), file: percorsoAsset, fileGrassetto: percorsoAsset }).nullable().default(null),
  immagineCopertina: percorsoAsset,
  logoPersonalizzato: percorsoAsset,
  logoLarghezza: z.number().min(15).max(150).default(60),
  logoAllineamento: z.enum(["sinistra", "centro", "destra"]).default("sinistra"),
  logoFondoBianco: z.boolean().default(true),
  mostraIntestazione: z.boolean().default(true),
  campiPersonalizzati: z.array(campoModelloSchema).max(30).refine(campi => new Set(campi.map(c => c.chiave)).size === campi.length, "Usa codici diversi per i campi").default([]),
  /** Il modello della libreria da cui è stata copiata la veste; nessuna modifica all'offerta originale. */
  modelloOffertaId: z.string().uuid().nullable().default(null),
  mostraNumeriPagina: z.boolean().default(true),
  sezioni: z.object({
    copertina: z.boolean().default(true), premessa: z.boolean().default(true), indice: z.boolean().default(true),
    lavorazioni: z.boolean().default(true), riepilogo: z.boolean().default(true), cronoprogramma: z.boolean().default(true),
    pagamenti: z.boolean().default(true), detrazione: z.boolean().default(true), contrattuali: z.boolean().default(true),
    firme: z.boolean().default(true),
  }).prefault({}),
  mostraLogo: z.boolean().default(true),
  scalaLogo: z.number().int().min(25).max(250).default(100),
  /** Sopra il titolo, in maiuscolo. Vuoto = «Preventivo / Computo metrico estimativo». */
  sopratitolo: testo(120),
  /** Prima del piano dei lavori: chi siamo, come si legge il documento. */
  premessa: testo(3000),
  mostraFirma: z.boolean().default(true),
  firmatario: testo(160),
  /** Riga a piè di ogni pagina, accanto al numero. Vuoto = il nome dell'azienda. */
  piePagina: testo(200),
  formatoPredefinito: z.enum(["cliente", "tecnico", "senza-prezzi", "riepilogo", "elenco-prezzi"]).default("cliente"),
  /** Le condizioni con cui parte ogni computo nuovo: si cambiano poi nel singolo preventivo. */
  condizioni: testo(12000), inclusioni: testo(6000), esclusioni: testo(6000), tempi: testo(3000), pagamenti: testo(3000),
  riferimentoPrezzi: testo(2000),
  /** Le condizioni contrattuali di ogni computo nuovo (titoli «#», righe «- »), come nelle offerte del preventivo classico. */
  condizioniContrattuali: testo(100000),
  /** Le clausole da approvare con una seconda firma (artt. 1341-1342 c.c.), una per riga. */
  clausoleDaApprovare: testo(12000),
  /** Il modello di «Contratti e condizioni» che usa il computo. Vuoto = il predefinito (07/11/2026). */
  condizioniModelloId: z.string().uuid().nullable().default(null),
  contrattoOrigine: z.object({ id: z.string(), nome: z.string(), versione: z.number() }).nullable().default(null),
  /** Quanti giorni vale l'offerta: va nella pagina di accettazione e nella firma online. */
  giorniValidita: z.number().int().min(1).max(365).default(30),
  ivaModalita: z.enum(["da-definire", "applicata", "non-applicabile"]).default("da-definire"),
  ivaAliquota: z.string().max(40).default("22"),
});
export type ModelloComputo = z.infer<typeof modelloComputoSchema>;
export const modelloComputoDiSerie = (): ModelloComputo => modelloComputoSchema.parse({});

/** Un jsonb salvato da un'altra versione: si tiene quello che è valido, il resto torna di serie. */
export function leggiModelloComputo(dato: unknown): ModelloComputo {
  const grezzo = dato && typeof dato === "object" && !Array.isArray(dato) ? dato as Record<string, unknown> : {};
  const pulito: Record<string, unknown> = {};
  const forma = modelloComputoSchema.shape;
  for (const [chiave, valore] of Object.entries(grezzo)) {
    if (!(chiave in forma)) continue;
    const campo = forma[chiave as keyof typeof forma].safeParse(valore);
    if (campo.success) pulito[chiave] = campo.data;
  }
  const modello = modelloComputoSchema.parse(pulito);
  // I modelli precedenti esprimevano la larghezza in percentuale dei 60 mm di serie.
  if (!("logoLarghezza" in grezzo) && typeof grezzo.scalaLogo === "number") modello.logoLarghezza = 60 * modello.scalaLogo / 100;
  // La precedente prova caricava Garamond nel modello; ora è già incluso nell'app.
  if (/^EBGaramond[- ]Regular$/i.test(modello.fontPersonalizzato?.nome ?? "")) {
    if (modello.fontFamiglia === "personalizzato") modello.fontFamiglia = "garamond";
    if (modello.fontTitoli === "personalizzato") modello.fontTitoli = "garamond";
  }
  return modello;
}

/** La parte del modello che serve al PDF. */
export type VesteComputo = Pick<ModelloComputo, "copertina" | "mostraLogo" | "sopratitolo" | "premessa" | "mostraFirma" | "firmatario" | "piePagina"> & Partial<Pick<ModelloComputo, "scalaLogo" | "clausoleDaApprovare" | "giorniValidita" | "fontFamiglia" | "fontTitoli" | "dimensioneTitolo" | "dimensioneSottotitoli" | "dimensioneTesto" | "fontPersonalizzato" | "immagineCopertina" | "logoPersonalizzato" | "logoLarghezza" | "logoAllineamento" | "logoFondoBianco" | "mostraIntestazione" | "campiPersonalizzati" | "mostraNumeriPagina" | "sezioni">> & {
  /** Il logo già letto (data URL PNG o JPEG): jsPDF non scarica immagini da solo. */
  logo?: { dati: string; formato: "PNG" | "JPEG"; larghezza: number; altezza: number } | null;
  /** TTF validati e letti prima del rendering, mai salvati nel JSON del modello. */
  fontCaricato?: { normale: string; grassetto?: string };
  fontSistemaCaricati?: Record<string, { normale: string; grassetto?: string }>;
};
export const vesteDalModello = (m: ModelloComputo): VesteComputo => ({
  copertina: m.copertina, mostraLogo: m.mostraLogo, scalaLogo: m.scalaLogo, sopratitolo: m.sopratitolo, premessa: m.premessa,
  mostraFirma: m.mostraFirma, firmatario: m.firmatario, piePagina: m.piePagina,
  clausoleDaApprovare: m.clausoleDaApprovare, giorniValidita: m.giorniValidita,
  fontFamiglia: m.fontFamiglia, mostraNumeriPagina: m.mostraNumeriPagina, sezioni: m.sezioni,
  fontTitoli: m.fontTitoli, dimensioneTitolo: m.dimensioneTitolo, dimensioneSottotitoli: m.dimensioneSottotitoli, dimensioneTesto: m.dimensioneTesto,
  fontPersonalizzato: m.fontPersonalizzato, immagineCopertina: m.immagineCopertina, logoPersonalizzato: m.logoPersonalizzato,
  logoLarghezza: m.logoLarghezza, logoAllineamento: m.logoAllineamento, logoFondoBianco: m.logoFondoBianco,
  mostraIntestazione: m.mostraIntestazione, campiPersonalizzati: m.campiPersonalizzati,
});

/**
 * Le condizioni del computo dall'archivio «Contratti e condizioni» (07/11/2026): il modello associato, o il
 * predefinito dei preventivi. Il PDF del computo legge righe («#» titoli, «- » punti), quindi il testo
 * arriva semplice, una clausola per titolo. Senza un modello nell'archivio il computo resta col suo testo:
 * chi non usa l'archivio non vede differenze. Le clausole da approvare a parte sono quelle segnate lì.
 */
export interface ContrattoDelModello { id: string; ambito: string; nome?: string; versione?: number; predefinito?: boolean | null; attivo?: boolean | null; clausole?: Clausola[] | null }

export function contrattoDelModello(m: Pick<ModelloComputo, "condizioniModelloId">, modelliArchivio: ReadonlyArray<ContrattoDelModello>) {
  const attivi = modelliArchivio.filter((x) => x.attivo !== false && x.ambito === "preventivo" && x.clausole?.some(c => c && (testoPiano(c.testo) || c.titolo?.trim())));
  return attivi.find((x) => x.id === m.condizioniModelloId) ?? attivi.find((x) => x.predefinito) ?? null;
}

export function conCondizioniDellArchivio(m: ModelloComputo, modelliArchivio: ReadonlyArray<ContrattoDelModello>): ModelloComputo {
  const scelto = contrattoDelModello(m, modelliArchivio);
  const clausole = (scelto?.clausole ?? []).filter((c) => c && (testoPiano(c.testo) || (c.titolo ?? "").trim()));
  if (!scelto || !clausole.length) return { ...m, contrattoOrigine: null, condizioniContrattuali: m.condizioniContrattuali.trim() || condizioniStandard("generico") };
  const righe = clausole.map((c) => {
    const titolo = (c.titolo ?? "").trim();
    const corpo = testoPiano((c.testo ?? "").replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, livello: string, testo: string) => `\n${"#".repeat(Math.min(3, Number(livello)))} ${testoPiano(testo)}\n`));
    // Un contratto intero importato si apre già col suo titolo: non se ne aggiunge un altro.
    const apreColTitolo = /^#{1,6}\s/.test(corpo);
    return [titolo && !(clausole.length === 1 && apreColTitolo) ? `# ${titolo}` : "", corpo].filter(Boolean).join("\n");
  });
  return {
    ...m,
    contrattoOrigine: { id: scelto.id, nome: scelto.nome ?? "Condizioni contrattuali", versione: scelto.versione ?? 1 },
    condizioniContrattuali: righe.join("\n\n"),
    clausoleDaApprovare: clausole.filter((c) => c.vessatoria).map((c) => (c.titolo ?? "").trim() || testoPiano(c.testo).split("\n")[0]).filter(Boolean).join("\n"),
  };
}

/** Un computo nuovo parte col formato, le condizioni e l'IVA del modello. */
export function bozzaDalModello(bozza: BozzaComputo, m: ModelloComputo): BozzaComputo {
  return {
    ...bozza, formatoPdf: m.formatoPredefinito,
    condizioni: m.condizioni, inclusioni: m.inclusioni, esclusioni: m.esclusioni, tempi: m.tempi, pagamenti: m.pagamenti,
    riferimentoPrezzi: m.riferimentoPrezzi, ivaModalita: m.ivaModalita, ivaAliquota: m.ivaAliquota,
    condizioniContrattuali: m.condizioniContrattuali,
    contrattoOrigine: m.contrattoOrigine,
    sezioniPdf: { ...m.sezioni, firme: m.sezioni.firme && m.mostraFirma },
  };
}

/** Il logo dell'azienda come data URL per jsPDF, con le proporzioni. Se non si legge, il PDF esce senza. */
export async function leggiLogoPerPdf(url: string | null | undefined): Promise<VesteComputo["logo"]> {
  if (!url) return null;
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    const blob = await risposta.blob();
    if (blob.size > 3 * 1024 * 1024) return null;
    const bitmap = await createImageBitmap(blob);
    // Si ridisegna in PNG: copre SVG, WebP e GIF, che jsPDF non legge, e toglie i profili colore strani.
    const scala = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    const tela = document.createElement("canvas");
    tela.width = Math.max(1, Math.round(bitmap.width * scala)); tela.height = Math.max(1, Math.round(bitmap.height * scala));
    tela.getContext("2d")?.drawImage(bitmap, 0, 0, tela.width, tela.height);
    return { dati: tela.toDataURL("image/png"), formato: "PNG", larghezza: tela.width, altezza: tela.height };
  } catch { return null; }
}

/** Una foto ritagliata alle proporzioni della copertina (larghezza/altezza), in JPEG per jsPDF. */
export async function fotoPerCopertina(blob: Blob | null | undefined, proporzione: number): Promise<{ dati: string; larghezza: number; altezza: number } | null> {
  if (!blob || !blob.type.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(blob);
    let sw = bmp.width, sh = bmp.width / proporzione;
    if (sh > bmp.height) { sh = bmp.height; sw = sh * proporzione; }
    const sx = (bmp.width - sw) / 2, sy = (bmp.height - sh) / 2;
    const w = Math.min(1600, Math.round(sw)), h = Math.round(w / proporzione);
    const tela = document.createElement("canvas"); tela.width = w; tela.height = h;
    tela.getContext("2d")?.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    return { dati: tela.toDataURL("image/jpeg", 0.85), larghezza: w, altezza: h };
  } catch { return null; }
}

const chiave = (companyId: string | null | undefined) => ["computo-modello", companyId] as const;

export function useModelloComputo(companyId: string | null | undefined) {
  return useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ modello: ModelloComputo; salvato: boolean }> => {
      const { data, error } = await supabase.from("computo_modelli" as never).select("impostazioni").eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      const riga = data as { impostazioni?: unknown } | null;
      return { modello: leggiModelloComputo(riga?.impostazioni), salvato: !!riga };
    },
  });
}

export function useSalvaModelloComputo(companyId: string | null | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (modello: ModelloComputo) => {
      if (!companyId) throw new Error("Azienda non riconosciuta: ricarica la pagina.");
      const valido = modelloComputoSchema.parse(modello);
      if ((valido.fontFamiglia === "personalizzato" || valido.fontTitoli === "personalizzato") && !valido.fontPersonalizzato?.file) throw new Error("Carica il file del carattere personalizzato prima di salvare.");
      for (const percorso of [valido.immagineCopertina, valido.logoPersonalizzato, valido.fontPersonalizzato?.file, valido.fontPersonalizzato?.fileGrassetto]) {
        if (percorso && !percorso.startsWith(`${companyId}/`)) throw new Error("Uno dei file appartiene a un'altra azienda. Caricalo nuovamente in questo modello.");
      }
      const { data: utente } = await supabase.auth.getUser();
      const { error } = await supabase.from("computo_modelli" as never)
        .upsert({ company_id: companyId, impostazioni: valido, updated_at: new Date().toISOString(), updated_by: utente.user?.id ?? null } as never, { onConflict: "company_id" });
      if (error) throw new Error(error.code === "42501" ? "Non hai il permesso di modificare i modelli dei preventivi." : "Modello non salvato: riprova tra qualche secondo.");
      return valido;
    },
    onSuccess: modello => { client.setQueryData(chiave(companyId), { modello, salvato: true }); },
  });
}
