/**
 * Costanti UI condivise per lo stato dei progetti serramenti.
 * Estratto da SerramentiIndex per riuso in SerramentiWizard (status badge
 * con azioni inline) e altri consumer.
 */
import type { SrStatoProgetto } from "@/types/serramenti";

export const STATI_LABEL: Record<SrStatoProgetto, { label: string; className: string }> = {
  bozza:           { label: "Bozza",          className: "bg-slate-100 text-slate-700 border-slate-200" },
  da_consegnare:   { label: "Da consegnare",  className: "bg-amber-100 text-amber-800 border-amber-200" },
  consegnato:      { label: "Consegnato",     className: "bg-sky-100 text-sky-800 border-sky-200" },
  in_valutazione:  { label: "In valutazione", className: "bg-blue-50 text-[#173b67] border-blue-200" },
  accettato:       { label: "Accettato",      className: "bg-orange-100 text-orange-700 border-orange-200" },
  rifiutato:       { label: "Rifiutato",      className: "bg-rose-100 text-rose-700 border-rose-200" },
  scaduto:         { label: "Scaduto",        className: "bg-slate-100 text-slate-500 border-slate-200" },
  archiviato:      { label: "Archiviato",     className: "bg-slate-100 text-slate-400 border-slate-200" },
};

export const STATI_APERTI: SrStatoProgetto[] = ["bozza", "da_consegnare", "consegnato", "in_valutazione"];
export const STATI_VINTI: SrStatoProgetto[] = ["accettato"];
export const STATI_PERSI: SrStatoProgetto[] = ["rifiutato", "scaduto"];

/**
 * Transizioni di stato consentite. Forniamo solo le azioni "naturali" del
 * workflow commerciale; chi vuole forzare uno stato edge-case può sempre
 * editare manualmente da admin tooling.
 */
export const TRANSIZIONI_STATO: Record<SrStatoProgetto, Array<{ next: SrStatoProgetto; label: string }>> = {
  bozza: [
    { next: "consegnato",     label: "Marca come Consegnato al cliente" },
    { next: "da_consegnare",  label: "Pronto da consegnare" },
  ],
  da_consegnare: [
    { next: "consegnato",     label: "Marca come Consegnato al cliente" },
    { next: "bozza",          label: "Torna a Bozza" },
  ],
  consegnato: [
    { next: "in_valutazione", label: "Cliente sta valutando" },
    { next: "accettato",      label: "✅ Accettato dal cliente" },
    { next: "rifiutato",      label: "❌ Rifiutato dal cliente" },
  ],
  in_valutazione: [
    { next: "accettato",      label: "✅ Accettato dal cliente" },
    { next: "rifiutato",      label: "❌ Rifiutato dal cliente" },
  ],
  accettato: [
    { next: "consegnato",     label: "Riapri (revoca accettazione)" },
  ],
  rifiutato: [
    { next: "consegnato",     label: "Riapri (nuova proposta)" },
  ],
  scaduto: [
    { next: "consegnato",     label: "Estendi validità (riproponi)" },
    { next: "bozza",          label: "Torna a Bozza" },
  ],
  archiviato: [],
};
