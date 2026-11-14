/**
 * «Importa le fasi» della commessa (14/11/2026).
 *
 * Il computo diventa le fasi della commessa: un capitolo, una fase; una riga, una sottofase con
 * quantità, unità e importo, pronte per i SAL. I file li legge la finestra «Importa voci»; qui
 * c'è l'altra strada, i documenti già nel gestionale: computi e preventivi in un elenco solo
 * (per il titolare sono la stessa cosa), con la ricerca. Scelto un documento, le sue voci
 * finiscono nella stessa schermata di scelta dei file, voce per voce e per capitolo.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { conAvvisi, type VoceImportata } from "@/lib/computo/importaVoci";
import type { RiepilogoComputoCloud } from "@/lib/computo/cloudComputo";
import {
  filtraDocumenti, vociDaPreventivo, type DocumentoGestionale, type RigaPreventivo, type fasiPerIlDatabase,
} from "@/lib/orders/fasiDaComputo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface EsitoImportFasi { aggiunte: number; saltate: number; voci: number; con_importi: boolean }

/** Scrive le fasi scelte nella commessa (RPC commessa_importa_fasi) e dice com'è andata. */
export async function importaFasiNelDatabase(orderId: string, fasi: ReturnType<typeof fasiPerIlDatabase>, origine: "computo" | "preventivo", codice: string | null): Promise<EsitoImportFasi> {
  if (!fasi.length) throw new Error("Nessuna fase nuova da importare: quelle scelte ci sono già.");
  const { data, error } = await db.rpc("commessa_importa_fasi", { p_order_id: orderId, p_fasi: fasi, p_origine: origine, p_codice: codice });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("L'import nelle fasi non è ancora attivo: serve un aggiornamento del database.");
    throw error;
  }
  return data as EsitoImportFasi;
}

/** Il messaggio dopo l'import, uguale da ogni fonte. */
export function avvisaEsitoImport(r: EsitoImportFasi) {
  const parti = [`${r.aggiunte} ${r.aggiunte === 1 ? "fase aggiunta" : "fasi aggiunte"} con ${r.voci} ${r.voci === 1 ? "riga" : "righe"}`];
  if (r.saltate) parti.push(`${r.saltate} già presenti, saltate`);
  toast.success(parti.join(" · "), {
    description: r.con_importi ? undefined : "Gli importi non sono stati scritti: servono «Venduto e importi». Chiedi al titolare dell'azienda di darti l'accesso.",
  });
}

export interface FonteGestionale { nome: string; tipo: "computo" | "preventivo" }

const STATI: Record<string, string> = {
  draft: "Bozza", bozza: "Bozza", sent: "Inviato", inviato: "Inviato", viewed: "Visto", accepted: "Accettato",
  accettato: "Accettato", signed: "Firmato", firmato: "Firmato", rejected: "Rifiutato", refused: "Rifiutato", expired: "Scaduto",
};
const dataBreve = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "");

/** Le voci di un documento del gestionale, già pronte per la schermata di scelta. */
async function vociDelDocumento(companyId: string, d: DocumentoGestionale): Promise<VoceImportata[]> {
  if (d.tipo === "computo") {
    const c = await (await import("@/lib/computo/cloudComputo")).leggiComputoCloud(companyId, d.id);
    if (!c) throw new Error("Questo computo non si trova più.");
    return c.bozza.voci.filter((v) => v.descrizione.trim()).map((v) => conAvvisi(v, d.titolo));
  }
  const { data, error } = await db.from("quote_items")
    .select("name, description, quantity, unit_of_measure, unit_price, line_total, is_optional, custom_field_values")
    .eq("quote_id", d.id).order("sort_order");
  if (error) throw error;
  return vociDaPreventivo((data ?? []) as RigaPreventivo[], d.titolo);
}

export function DocumentiDelGestionale({ companyId, mostraImporti, onScelto }: {
  companyId: string;
  /** «Venduto e importi»: senza, i totali dei documenti non si vedono. */
  mostraImporti: boolean;
  onScelto: (voci: VoceImportata[], fonte: FonteGestionale) => void;
}) {
  const [testo, setTesto] = useState("");
  const [tipo, setTipo] = useState<"tutti" | DocumentoGestionale["tipo"]>("tutti");
  const [apro, setApro] = useState<string | null>(null);

  const documenti = useQuery({
    queryKey: ["importa-fasi", "documenti", companyId],
    queryFn: async (): Promise<DocumentoGestionale[]> => {
      const [computi, preventivi] = await Promise.all([
        (await import("@/lib/computo/cloudComputo")).elencaComputiCloud(companyId).catch((): RiepilogoComputoCloud[] => []),
        db.from("quotes").select("id, quote_number, title, client_name, status, total, updated_at")
          .eq("company_id", companyId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(300),
      ]);
      if (preventivi.error) throw preventivi.error;
      return [
        // Un computo senza voci non ha niente da importare: non si propone.
        ...computi.filter((c) => c.numeroVoci > 0).map((c): DocumentoGestionale => ({
          id: c.id, tipo: "computo", titolo: c.titolo || "Computo senza titolo", cliente: c.committente, numero: null, stato: null,
          voci: c.numeroVoci, totale: c.totale, aggiornato: c.updatedAt,
        })),
        ...((preventivi.data ?? []) as Array<{ id: string; quote_number: string | null; title: string | null; client_name: string | null; status: string | null; total: number | null; updated_at: string | null }>)
          .map((q): DocumentoGestionale => ({
            id: q.id, tipo: "preventivo", titolo: q.title?.trim() || `Preventivo ${q.quote_number ?? ""}`.trim(), cliente: q.client_name ?? "",
            numero: q.quote_number, stato: q.status, voci: null, totale: q.total == null ? null : Number(q.total), aggiornato: q.updated_at,
          })),
      ];
    },
  });

  const tutti = documenti.data ?? [];
  const mostrati = useMemo(() => filtraDocumenti(tutti, testo, tipo), [tutti, testo, tipo]);
  const conta = (t: DocumentoGestionale["tipo"]) => tutti.filter((d) => d.tipo === t).length;

  const scegli = async (d: DocumentoGestionale) => {
    setApro(d.id);
    try {
      const voci = await vociDelDocumento(companyId, d);
      if (!voci.length) { toast.error("Nessuna voce da importare", { description: `«${d.titolo}» non ha righe con una descrizione.` }); return; }
      onScelto(voci, { nome: d.numero ? `Preventivo ${d.numero}` : d.titolo, tipo: d.tipo });
    } catch (e) {
      toast.error("Documento non aperto", { description: userErrorMessage(e, e instanceof Error ? e.message : "Riprova.") });
    } finally { setApro(null); }
  };

  return (
    <section className="space-y-2" aria-label="Documenti del gestionale">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Oppure da un computo o preventivo del gestionale</p>
        {!!tutti.length && <span className="text-xs text-muted-foreground tabular-nums">{tutti.length} documenti</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca per titolo, cliente o numero"
            aria-label="Cerca un computo o un preventivo" className="h-9 pl-8" />
        </div>
        <div className="flex gap-1" role="group" aria-label="Tipo di documento">
          {([["tutti", `Tutti`], ["computo", `Computi ${conta("computo")}`], ["preventivo", `Preventivi ${conta("preventivo")}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}
              className={`h-9 rounded-md border px-2.5 text-xs font-medium transition-colors ${tipo === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <ul aria-label="Computi e preventivi" className="max-h-64 divide-y overflow-y-auto rounded-lg border bg-card">
        {documenti.isLoading && <li className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />Carico computi e preventivi…</li>}
        {documenti.isError && <li role="alert" className="p-3 text-sm text-destructive">{userErrorMessage(documenti.error, "Non riesco a leggere computi e preventivi.")}</li>}
        {!documenti.isLoading && !documenti.isError && !mostrati.length && (
          <li className="p-3 text-sm text-muted-foreground">{tutti.length ? "Nessun documento con questa ricerca." : "Nel gestionale non ci sono ancora computi o preventivi: importa un file qui sopra."}</li>
        )}
        {mostrati.map((d) => {
          const Icona = d.tipo === "computo" ? Calculator : FileText;
          const dettagli = [d.cliente, d.numero && `n. ${d.numero}`, d.stato && (STATI[d.stato] ?? d.stato), d.voci != null && `${d.voci} voci`, dataBreve(d.aggiornato)].filter(Boolean);
          return (
            <li key={`${d.tipo}-${d.id}`}>
              <button type="button" disabled={!!apro} onClick={() => void scegli(d)} aria-label={`Importa da ${d.tipo} ${d.titolo}`}
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none disabled:opacity-60">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${d.tipo === "computo" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                  <Icona className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{d.titolo}</span>
                    <span className="shrink-0 rounded-full border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{d.tipo}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{dettagli.join(" · ")}</span>
                </span>
                {mostraImporti && d.totale != null && <span className="shrink-0 text-sm tabular-nums">{formatCurrency(d.totale)}</span>}
                {apro === d.id
                  ? <Loader2 className="h-4 w-4 shrink-0 text-primary motion-safe:animate-spin" aria-label="Apro il documento" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
