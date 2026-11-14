/**
 * «Da computo o preventivo» in «Aggiungi fasi» (14/11/2026).
 *
 * Il computo diventa le fasi della commessa: un capitolo, una fase; una riga, una sottofase con
 * quantità, unità e importo, pronte per i SAL. Le righe vengono da un file (Excel, PriMus,
 * XPWE, CSV, Word, PDF), da un computo del gestionale o da un preventivo. Prima di scrivere si
 * vede l'anteprima: le fasi già presenti si saltano, le altre si possono togliere.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { ACCEPT_IMPORTA_VOCI } from "@/lib/computo/importaVoci";
import {
  fasiDaRighe, fasiPerIlDatabase, righeDaPreventivo, righeDaVociComputo, MAX_FASI_IMPORT,
  type FaseDaImportare, type RigaPreventivo,
} from "@/lib/orders/fasiDaComputo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Fonte = "file" | "computo" | "preventivo";

export function ImportaFasiDaComputo({ orderId, companyId, userId, fasiEsistenti, mostraImporti, onFatto }: {
  orderId: string;
  companyId: string;
  userId: string;
  fasiEsistenti: readonly string[];
  /** «Venduto e importi»: senza, si importano fasi e quantità ma non gli importi. */
  mostraImporti: boolean;
  onFatto: () => void;
}) {
  const [fonte, setFonte] = useState<Fonte>("file");
  const [fasi, setFasi] = useState<FaseDaImportare[] | null>(null);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [codice, setCodice] = useState<string>("");
  const [lettura, setLettura] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [trascina, setTrascina] = useState(false);

  const mostra = (nuove: FaseDaImportare[], da: string) => {
    setErrore(null);
    if (!nuove.length) { setFasi(null); setErrore("Non ho trovato righe da importare."); return; }
    setFasi(nuove);
    setScelte(new Set(nuove.filter((f) => !f.presente).map((f) => f.nome)));
    setCodice(da);
  };

  const computi = useQuery({
    queryKey: ["importa-fasi", "computi", companyId],
    enabled: fonte === "computo",
    queryFn: async () => (await import("@/lib/computo/cloudComputo")).elencaComputiCloud(companyId),
  });
  const preventivi = useQuery({
    queryKey: ["importa-fasi", "preventivi", companyId],
    enabled: fonte === "preventivo",
    queryFn: async () => {
      const { data, error } = await db.from("quotes").select("id, quote_number, title, client_name, status")
        .eq("company_id", companyId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; quote_number: string; title: string | null; client_name: string | null; status: string }>;
    },
  });

  const leggiFile = async (file: File) => {
    setErrore(null); setFasi(null); setLettura("Apro il file…");
    try {
      const { leggiVociDaFile } = await import("@/lib/computo/leggiVoci");
      const letto = await leggiVociDaFile(file, {
        onAvanzamento: (a) => setLettura(a.dettaglio ?? (a.fase === "leggo" ? "Leggo le righe…" : a.fase === "riconosco" ? "Riconosco le voci…" : "Apro il file…")),
        server: async (f, onStato) => (await import("@/lib/computo/estrazioneServer")).estraiSulServer(f, { companyId, userId, onStato }),
      });
      mostra(fasiDaRighe(righeDaVociComputo(letto.voci), fasiEsistenti), file.name);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally { setLettura(null); }
  };

  const leggiComputo = async (id: string) => {
    setErrore(null); setFasi(null); setLettura("Apro il computo…");
    try {
      const c = await (await import("@/lib/computo/cloudComputo")).leggiComputoCloud(companyId, id);
      if (!c) throw new Error("Questo computo non si trova più.");
      mostra(fasiDaRighe(righeDaVociComputo(c.bozza.voci), fasiEsistenti), c.bozza.titolo || "Computo");
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLettura(null); }
  };

  const leggiPreventivo = async (id: string) => {
    setErrore(null); setFasi(null); setLettura("Apro il preventivo…");
    try {
      const p = preventivi.data?.find((q) => q.id === id);
      const { data, error } = await db.from("quote_items")
        .select("name, description, quantity, unit_of_measure, line_total, is_optional, custom_field_values")
        .eq("quote_id", id).order("sort_order");
      if (error) throw error;
      const titolo = p?.title?.trim() || `Preventivo ${p?.quote_number ?? ""}`.trim();
      mostra(fasiDaRighe(righeDaPreventivo((data ?? []) as RigaPreventivo[], titolo), fasiEsistenti), p ? `Preventivo ${p.quote_number}` : "Preventivo");
    } catch (e) { setErrore(userErrorMessage(e, "Non riesco ad aprire il preventivo.")); } finally { setLettura(null); }
  };

  const importa = useMutation({
    mutationFn: async () => {
      const daMandare = fasiPerIlDatabase(fasi ?? [], scelte);
      if (!daMandare.length) throw new Error("Scegli almeno una fase da importare.");
      const { data, error } = await db.rpc("commessa_importa_fasi", {
        p_order_id: orderId, p_fasi: daMandare, p_origine: fonte === "preventivo" ? "preventivo" : "computo", p_codice: codice || null,
      });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") throw new Error("L'import nelle fasi non è ancora attivo: serve un aggiornamento del database.");
        throw error;
      }
      return data as { aggiunte: number; saltate: number; voci: number; con_importi: boolean };
    },
    onSuccess: (r) => {
      const parti = [`${r.aggiunte} ${r.aggiunte === 1 ? "fase aggiunta" : "fasi aggiunte"} con ${r.voci} ${r.voci === 1 ? "riga" : "righe"}`];
      if (r.saltate) parti.push(`${r.saltate} già presenti, saltate`);
      toast.success(parti.join(" · "), {
        description: r.con_importi ? undefined : "Gli importi non sono stati scritti: servono «Venduto e importi». Chiedi al titolare dell'azienda di darti l'accesso.",
      });
      onFatto();
    },
    onError: (e) => toast.error("Fasi non importate", { description: userErrorMessage(e, e instanceof Error ? e.message : "Riprova.") }),
  });

  const scelteValide = (fasi ?? []).filter((f) => !f.presente && scelte.has(f.nome)).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" aria-label="Da dove importare">
        {([["file", "Da un file"], ["computo", "Da un computo"], ["preventivo", "Da un preventivo"]] as const).map(([k, l]) => (
          <Button key={k} type="button" size="sm" variant={fonte === k ? "default" : "outline"} aria-pressed={fonte === k}
            onClick={() => { setFonte(k); setFasi(null); setErrore(null); }}>{l}</Button>
        ))}
      </div>

      {fonte === "file" && (
        <div
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${trascina ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
          onDragOver={(e) => { e.preventDefault(); setTrascina(true); }}
          onDragLeave={() => setTrascina(false)}
          onDrop={(e) => { e.preventDefault(); setTrascina(false); const f = e.dataTransfer.files?.[0]; if (f) void leggiFile(f); }}
        >
          <FileUp className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm">Trascina qui il computo o il preventivo</p>
          <p className="text-xs text-muted-foreground">PDF, Excel, PriMus (XPWE), CSV o Word. Il file originale non viene modificato.</p>
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50">
            Scegli il file
            <input type="file" className="sr-only" accept={ACCEPT_IMPORTA_VOCI} aria-label="Computo o preventivo: PDF, Excel, PriMus, CSV o Word"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void leggiFile(f); }} />
          </label>
        </div>
      )}
      {fonte === "computo" && (
        <div className="space-y-1">
          <Label>Computo del gestionale</Label>
          <Select onValueChange={(v) => void leggiComputo(v)}>
            <SelectTrigger aria-label="Computo da importare"><SelectValue placeholder={computi.isLoading ? "Carico…" : computi.data?.length ? "Scegli un computo" : "Nessun computo salvato: usa «Da un file»"} /></SelectTrigger>
            <SelectContent>
              {(computi.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{[c.titolo || "Computo", c.committente, `${c.numeroVoci} voci`].filter(Boolean).join(" · ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {fonte === "preventivo" && (
        <div className="space-y-1">
          <Label>Preventivo</Label>
          <Select onValueChange={(v) => void leggiPreventivo(v)}>
            <SelectTrigger aria-label="Preventivo da importare"><SelectValue placeholder={preventivi.isLoading ? "Carico…" : preventivi.data?.length ? "Scegli un preventivo" : "Nessun preventivo nel gestionale"} /></SelectTrigger>
            <SelectContent>
              {(preventivi.data ?? []).map((q) => (
                <SelectItem key={q.id} value={q.id}>{[q.quote_number, q.title, q.client_name].filter(Boolean).join(" · ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {lettura && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{lettura}</p>}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}

      {fasi && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Ogni capitolo diventa una fase, ogni riga una sottofase con quantità e unità, pronte per i SAL.
            {fasi.length > MAX_FASI_IMPORT && ` Al massimo ${MAX_FASI_IMPORT} fasi per volta.`}
          </p>
          <ul aria-label="Fasi da importare" className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {fasi.map((f) => (
              <li key={f.nome} className="flex items-center gap-2 p-2 text-sm">
                <Checkbox aria-label={`Importa ${f.nome}`} disabled={f.presente} checked={!f.presente && scelte.has(f.nome)}
                  onCheckedChange={(v) => setScelte((s) => { const n = new Set(s); if (v === true) n.add(f.nome); else n.delete(f.nome); return n; })} />
                <span className="min-w-0 flex-1 truncate font-medium">{f.nome}</span>
                <span className="text-xs text-muted-foreground">{f.voci.length} {f.voci.length === 1 ? "riga" : "righe"}</span>
                {mostraImporti && <span className="text-xs tabular-nums">{formatCurrency(f.importo)}</span>}
                {f.presente && <span className="text-xs text-amber-700">già presente</span>}
              </li>
            ))}
          </ul>
          {!mostraImporti && <p className="text-xs text-muted-foreground">Gli importi non si importano: servono «Venduto e importi».</p>}
          <Button type="button" className="w-full" disabled={!scelteValide || importa.isPending} onClick={() => importa.mutate()}>
            {importa.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Importa {scelteValide} {scelteValide === 1 ? "fase" : "fasi"}
          </Button>
        </div>
      )}
    </div>
  );
}
