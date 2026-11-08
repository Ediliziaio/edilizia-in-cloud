/**
 * Il controllo del documento del fornitore, lato pagina: testi e riepiloghi.
 * Il confronto vero sta in supabase/functions/_shared/confrontoDocumentoFornitore.ts.
 */
import type { Esito, RigaConfronto } from "../../../supabase/functions/_shared/confrontoDocumentoFornitore";

export type { Esito, RigaConfronto };

export interface ControlloDocumento {
  id: string;
  company_id: string;
  purchase_order_id: string | null;
  rfq_supplier_id: string | null;
  tipo: "offerta" | "conferma";
  file_path: string | null;
  file_nome: string | null;
  stato: "in_lettura" | "letto";
  esito: Esito | null;
  righe: RigaConfronto[];
  accettato_motivo: string | null;
  accettato_il: string | null;
  created_at: string;
}

export const ESITO_LABEL: Record<Esito, string> = {
  verde: "Giusto",
  giallo: "Da guardare",
  rosso: "Errore",
  da_controllare: "Da controllare",
};

export const ESITO_CLASSI: Record<Esito, string> = {
  verde: "bg-emerald-100 text-emerald-800",
  giallo: "bg-amber-100 text-amber-800",
  rosso: "bg-red-100 text-red-800",
  da_controllare: "bg-sky-100 text-sky-800",
};

export function etichettaConteggio(esito: Esito, n: number): string {
  const nome = esito === "rosso" ? (n === 1 ? "errore" : "errori")
    : esito === "verde" ? (n === 1 ? "giusta" : "giuste")
    : esito === "giallo" ? "da guardare" : "da controllare";
  return `${n} ${nome}`;
}

export function contaEsiti(righe: RigaConfronto[]): Record<Esito, number> {
  const c: Record<Esito, number> = { verde: 0, giallo: 0, rosso: 0, da_controllare: 0 };
  for (const r of righe) c[r.esito] += 1;
  return c;
}

/** Per passare a «confermato» non devono restare errori o letture incerte, salvo «Accetto» col motivo. */
export function confermaPossibile(c: Pick<ControlloDocumento, "stato" | "esito" | "accettato_il">): boolean {
  if (c.stato !== "letto" || !c.esito) return false;
  return c.esito === "verde" || c.esito === "giallo" || !!c.accettato_il;
}

export function motivoObbligatorio(esito: Esito | null): boolean {
  return esito === "rosso" || esito === "da_controllare";
}

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Solo gli errori veri e propri: il testo lo prepara il sistema, lo manda l'utente. */
export function righeDaCorreggere(righe: RigaConfronto[]): RigaConfronto[] {
  return righe.filter((r) => r.esito === "rosso");
}

export function emailCorrezione(d: { numero: string; fornitore?: string | null; azienda?: string | null; righe: RigaConfronto[] }) {
  const elenco = righeDaCorreggere(d.righe).map((r) => {
    const nome = [r.riferimento, r.descrizione].filter(Boolean).join(" — ");
    if (r.stato === "mancante") return `<li><strong>${esc(nome)}</strong>: nel Vostro documento manca questa posizione.</li>`;
    if (r.stato === "in_piu") return `<li><strong>${esc(nome)}</strong>: riga non presente nel nostro ordine.</li>`;
    const errori = r.campi.filter((c) => c.esito === "rosso")
      .map((c) => `${esc(c.campo)}: richiesto ${esc(c.chiesto ?? "—")}, indicato ${esc(c.letto ?? "—")}`).join("; ");
    return `<li><strong>${esc(nome)}</strong>: ${errori}.</li>`;
  }).join("");
  return {
    oggetto: `Correzioni al documento per ${d.numero}`,
    corpo: `<p>Spett.le <strong>${esc(d.fornitore || "Fornitore")}</strong>,</p>
<p>controllando il Vostro documento relativo a <strong>${esc(d.numero)}</strong> abbiamo riscontrato queste differenze rispetto a quanto richiesto:</p>
<ul>${elenco}</ul>
<p>Vi chiediamo di verificare e di inviarci il documento corretto prima di procedere con la produzione.</p>
<p>Cordiali saluti${d.azienda ? `,<br>${esc(d.azienda)}` : ""}</p>`,
  };
}

export async function fileInBase64(file: Blob): Promise<string> {
  return await new Promise((ok, ko) => {
    const lettore = new FileReader();
    lettore.onload = () => ok(String(lettore.result));
    lettore.onerror = () => ko(new Error("File non leggibile"));
    lettore.readAsDataURL(file);
  });
}
