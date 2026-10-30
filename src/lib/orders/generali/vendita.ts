// src/lib/orders/generali/vendita.ts
// Il modulo «Unità e vendite» come strumento di vendita: il materiale dell'unità (planimetria,
// capitolato, foto o render), la scheda vendita da dare all'acquirente e il listino disponibilità
// di tutta l'operazione.
//
// Regola di fondo: quello che esce di qui va in mano a chi compra. Nessun costo, margine,
// provvigione, acquirente o incasso: i dati si copiano campo per campo, mai l'unità intera.
// Il prezzo c'è solo se chi genera vede gli importi e lo sceglie, ed è sempre quello di listino
// (il prezzo trattato è un accordo con un acquirente, non si mostra a un altro).
//
// I file stanno nell'archivio della commessa dell'unità (order_attachments) e si riconoscono con
// le voci della checklist documenti (documenti.ts): quale file è la planimetria lo dice la stessa
// regola della scheda Documenti. Solo parole e conti, senza React né database.
import type { AziendaDossier } from "@/lib/orders/generali/rendiconto";
import {
  calcolaChecklist,
  type AllegatoCommessa, type SegnoDocumento, type VoceDocumento,
} from "@/lib/orders/generali/documenti";
import {
  etichettaPiano, raggruppaTabellone,
  type StatoVendita, type UnitaGenerale,
} from "@/lib/orders/generali/unita";

// ── Il materiale dell'unità ──────────────────────────────────────────────────

/** Le voci documento del materiale di vendita, su ogni unità (documenti.ts). */
export const VOCI_VENDITA = {
  planimetria: "planimetria",
  capitolato: "capitolato_unita",
  foto: "foto_render",
} as const;
export type MaterialeVendita = keyof typeof VOCI_VENDITA;

export const NOMI_MATERIALE: Record<MaterialeVendita, string> = {
  planimetria: "Planimetria",
  capitolato: "Capitolato e finiture",
  foto: "Foto o render",
};

export type TipoAnteprima = "immagine" | "pdf" | null;

/** Si vede in anteprima (e va nella scheda) un'immagine o un PDF, prima pagina. */
export function tipoAnteprima(a: Pick<AllegatoCommessa, "file_name" | "file_type">): TipoAnteprima {
  const mime = (a.file_type ?? "").toLowerCase();
  const ext = (a.file_name.split(".").pop() ?? "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  // HEIC e TIFF i browser non li disegnano: niente anteprima, si apre il file.
  if (["heic", "heif", "tif", "tiff"].includes(ext) || /heic|heif|tiff/.test(mime)) return null;
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"].includes(ext)) return "immagine";
  return null;
}

export type FileVendita = Record<MaterialeVendita, AllegatoCommessa[]>;

/**
 * I file di vendita di un'unità, con le regole della checklist: un file segnato per la voce o
 * riconosciuto dal nome («Planimetria A1.pdf»). Le tre voci valgono qui anche se l'azienda le ha
 * tolte dalla checklist o spostate sull'operazione: la vendita le cerca comunque sull'unità.
 */
export function fileVenditaUnita(p: {
  voci: readonly VoceDocumento[];
  orderId: string;
  allegati: readonly AllegatoCommessa[];
  segni: readonly SegnoDocumento[];
  oggi: string;
}): FileVendita {
  const chiavi = Object.values(VOCI_VENDITA) as string[];
  const voci = p.voci
    .filter((v) => chiavi.includes(v.id))
    .map((v) => ({ ...v, ambito: "figlia" as const, tolta: false }));
  // Le altre voci sull'unità restano nel conto: un file che è il preliminare non diventa una foto.
  const altre = p.voci.filter((v) => !chiavi.includes(v.id) && v.ambito === "figlia" && !v.tolta);
  const c = calcolaChecklist({
    voci: [...altre, ...voci],
    generaleId: `vendita-${p.orderId}`,
    figlie: [{ id: p.orderId, incassato: null }],
    allegati: p.allegati.filter((a) => a.order_id === p.orderId),
    segni: p.segni.filter((s) => s.order_id === p.orderId),
    oggi: p.oggi,
  });
  const di = (chiave: string) => c.figlie.find((g) => g.voce.id === chiave)?.caselle[0]?.documenti.map((d) => d.allegato) ?? [];
  return {
    planimetria: di(VOCI_VENDITA.planimetria),
    capitolato: di(VOCI_VENDITA.capitolato),
    foto: di(VOCI_VENDITA.foto),
  };
}

/** La voce documento del materiale (con il nome che le ha dato l'azienda), per caricare un file. */
export function voceMateriale(voci: readonly VoceDocumento[], m: MaterialeVendita): Pick<VoceDocumento, "id" | "nome"> {
  const v = voci.find((x) => x.id === VOCI_VENDITA[m]);
  return { id: VOCI_VENDITA[m], nome: v?.nome ?? NOMI_MATERIALE[m] };
}

// ── Stati per chi compra ─────────────────────────────────────────────────────

/** Chi compra non vede compromesso e rogito: vede venduta. */
export type StatoListino = "libera" | "prenotata" | "venduta";

export const NOMI_STATO_LISTINO: Record<StatoListino, string> = {
  libera: "Libera",
  prenotata: "Prenotata",
  venduta: "Venduta",
};

export const statoListino = (s: StatoVendita): StatoListino =>
  s === "libera" ? "libera" : s === "prenotata" ? "prenotata" : "venduta";

// ── La scheda vendita dell'unità ─────────────────────────────────────────────

/** I dati dell'azienda che vanno in testa e in fondo alla carta: chi vende e come contattarlo. */
export interface AziendaVendita {
  nome: string;
  indirizzo: string | null;
  telefono: string | null;
  email: string | null;
  partitaIva: string | null;
  logo: string | null;
}

export const aziendaVendita = (a: AziendaDossier): AziendaVendita => ({
  nome: a.nome, indirizzo: a.indirizzo, telefono: a.telefono, email: a.email, partitaIva: a.partitaIva, logo: a.logo,
});

export interface DatiSchedaVendita {
  azienda: AziendaVendita;
  operazione: string;
  data: string;
  unita: {
    sigla: string;
    tipologia: string | null;
    edificio: string | null;
    piano: string | null;
    mq: number | null;
    stato: StatoListino;
  };
  /** Prezzo di listino; null = non si mette. */
  prezzo: number | null;
  /** Immagine (data URL) della planimetria, prima pagina se era un PDF. */
  planimetria: string | null;
  foto: string[];
  /** Il capitolato in breve: una voce per riga. */
  capitolato: string[];
}

/** Al massimo sei foto: la scheda resta di due pagine e leggera per un'email. */
export const MAX_FOTO_SCHEDA = 6;

/** «Pavimenti in gres\n\n- Infissi in PVC» → due voci pulite, senza trattini o pallini in testa. */
export function righeCapitolato(testo: string): string[] {
  return testo
    .split(/\r?\n/)
    .map((r) => r.replace(/^\s*(?:[-–•*·]|\d+[.)])\s*/, "").trim())
    .filter((r) => r.length > 0)
    .slice(0, 20);
}

export function componiSchedaVendita(p: {
  azienda: AziendaVendita;
  operazione: string;
  unita: UnitaGenerale;
  /** Chi genera vede gli importi e vuole il prezzo. */
  conPrezzo: boolean;
  planimetria: string | null;
  foto: readonly string[];
  capitolato: string;
  data: string;
}): DatiSchedaVendita {
  const u = p.unita;
  return {
    azienda: { ...p.azienda },
    operazione: p.operazione,
    data: p.data,
    unita: {
      sigla: u.sigla,
      tipologia: u.tipologia,
      edificio: u.edificio,
      piano: u.piano ? etichettaPiano(u.piano) : null,
      mq: u.mq,
      stato: statoListino(u.stato),
    },
    prezzo: p.conPrezzo && u.listino !== null && u.listino > 0 ? u.listino : null,
    planimetria: p.planimetria,
    foto: p.foto.slice(0, MAX_FOTO_SCHEDA),
    capitolato: righeCapitolato(p.capitolato),
  };
}

// ── Il listino disponibilità ─────────────────────────────────────────────────

export interface RigaListino {
  edificio: string | null;
  piano: string | null;
  sigla: string;
  tipologia: string | null;
  mq: number | null;
  /** Il listino: solo sulle unità libere, e solo se si mettono i prezzi. */
  prezzo: number | null;
  stato: StatoListino;
}

export interface DatiListino {
  azienda: AziendaVendita;
  operazione: string;
  data: string;
  conPrezzi: boolean;
  /** Ci sono più edifici: la colonna serve. */
  conEdifici: boolean;
  righe: RigaListino[];
  conteggi: Record<StatoListino, number>;
  mqLiberi: number;
}

/**
 * Il listino di tutta l'operazione, nell'ordine del tabellone (edificio, piani dall'alto,
 * sigla). Le unità divise non ci sono: ci sono le loro parti. Il prezzo di un'unità prenotata
 * o venduta non si scrive: non è più in vendita, e il suo prezzo è un accordo con qualcuno.
 */
export function componiListino(p: {
  azienda: AziendaVendita;
  operazione: string;
  unita: UnitaGenerale[];
  conPrezzi: boolean;
  data: string;
}): DatiListino {
  const edifici = raggruppaTabellone(p.unita);
  const righe: RigaListino[] = [];
  // Nel listino si legge dal basso in alto: piano terra prima dell'attico.
  for (const e of edifici) {
    for (const piano of [...e.piani].reverse()) {
      for (const u of piano.unita) {
        const stato = statoListino(u.stato);
        righe.push({
          edificio: u.edificio,
          piano: u.piano ? etichettaPiano(u.piano) : null,
          sigla: u.sigla,
          tipologia: u.tipologia,
          mq: u.mq,
          prezzo: p.conPrezzi && stato === "libera" && u.listino !== null && u.listino > 0 ? u.listino : null,
          stato,
        });
      }
    }
  }
  const conteggi: Record<StatoListino, number> = { libera: 0, prenotata: 0, venduta: 0 };
  for (const r of righe) conteggi[r.stato]++;
  return {
    azienda: { ...p.azienda },
    operazione: p.operazione,
    data: p.data,
    conPrezzi: p.conPrezzi,
    conEdifici: edifici.length > 1 || edifici.some((e) => e.edificio !== null),
    righe,
    conteggi,
    mqLiberi: righe.filter((r) => r.stato === "libera").reduce((t, r) => t + (r.mq ?? 0), 0),
  };
}

// ── Parole e nomi dei file ───────────────────────────────────────────────────

const pulito = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "operazione";

export const nomeFileScheda = (d: Pick<DatiSchedaVendita, "operazione" | "unita" | "data">) =>
  `Scheda-${pulito(d.unita.sigla)}-${pulito(d.operazione)}-${d.data}.pdf`;

export const nomeFileListino = (d: Pick<DatiListino, "operazione" | "data">, estensione: "pdf" | "xlsx" = "pdf") =>
  `Listino-${pulito(d.operazione)}-${d.data}.${estensione}`;

/** «Appartamento · 2° piano · 95 m²»: quello che si legge sotto la sigla. */
export function descrizioneUnita(u: DatiSchedaVendita["unita"]): string {
  const mq = u.mq !== null ? `${u.mq.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²` : null;
  return [u.tipologia, u.edificio, u.piano, mq].filter(Boolean).join(" · ");
}

/** I contatti dell'azienda in una riga: indirizzo, telefono, email. */
export const contattiAzienda = (a: AziendaVendita) =>
  [a.indirizzo, a.telefono ? `Tel. ${a.telefono}` : null, a.email].filter(Boolean).join(" · ");
