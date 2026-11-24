/**
 * «Ho usato un altro mezzo» (24/11/2026): il mezzo preso dal deposito senza che l'ufficio l'abbia assegnato.
 * Si sceglie dall'elenco dell'azienda (`campo_mezzi_azienda`); se è libero passa a questo cantiere e l'ufficio
 * riceve un avviso (`campo_mezzo_al_volo`), poi si segna come usato. Se è assegnato altrove non si sposta niente.
 * Con l'etichetta QR basta inquadrarla (24/11): «ho preso questo», senza cercarlo nell'elenco.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ScanLine, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PILLOLA } from "@/lib/campo/stileCampo";
import { corrisponde } from "@/lib/campo/sceltaRapida";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { leggiCodiceScansionato } from "@/types/mezzi";
import { cercaCodiceMezzo } from "@/hooks/useMezzi";

interface MezzoAzienda { id: string; nome: string; tipo: string; targa: string | null; libero: boolean; dove: string | null }

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

export function MezzoAlVolo({ orderId, onUsato }: { orderId: string; onUsato: (mezzoId: string) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [cercoCodice, setCercoCodice] = useState(false);
  const [cerca, setCerca] = useState("");
  const rpc = supabase.rpc as unknown as Rpc;
  const elenco = useQuery({
    queryKey: ["campo-mezzi-azienda", orderId],
    enabled: aperto,
    staleTime: 60_000,
    queryFn: async (): Promise<MezzoAzienda[]> => {
      const { data, error } = await rpc("campo_mezzi_azienda", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as MezzoAzienda[];
    },
  });
  const sposta = useMutation({
    mutationFn: async (m: MezzoAzienda) => {
      const { data, error } = await rpc("campo_mezzo_al_volo", { p_order_id: orderId, p_mezzo_id: m.id });
      if (error) throw error;
      return { m, esito: (data as { esito?: string })?.esito };
    },
    onSuccess: ({ m, esito }) => {
      if (esito === "spostato" || esito === "gia_qui") {
        void qc.invalidateQueries({ queryKey: ["campo-mezzi-giornata", orderId] });
        void qc.invalidateQueries({ queryKey: ["campo-mezzi-azienda", orderId] });
        onUsato(m.id);
        toast.success(t("«{nome}» segnato come usato. L'ufficio è avvisato.", { nome: m.nome }));
        setAperto(false);
        setCerca("");
      } else {
        toast.error(esito === "assegnato_altrove"
          ? t("«{nome}» è assegnato altrove: chiedi all'ufficio di spostarlo.", { nome: m.nome })
          : t("Questo mezzo non è disponibile."));
      }
    },
    onError: () => toast.error(t("Non sono riuscito a segnare il mezzo. Riprova.")),
  });

  const letto = async (testo: string) => {
    setScanner(false);
    const c = leggiCodiceScansionato(testo);
    if (!c) { toast.error(t("Non riconosco questo codice.")); return; }
    setCercoCodice(true);
    try {
      const esito = await cercaCodiceMezzo(c.codice, c.companyId);
      if (esito.esito !== "trovato") { toast.error(t("Questa etichetta non è collegata a un mezzo.")); return; }
      const nome = esito.vista === "campo" ? esito.mezzo.nome : c.codice;
      sposta.mutate({ id: esito.id, nome, tipo: "", targa: null, libero: true, dove: null });
    } catch {
      toast.error(t("Non sono riuscito a leggere il mezzo. Riprova."));
    } finally {
      setCercoCodice(false);
    }
  };

  const visti = (elenco.data ?? []).filter(m => m.dove !== "questo_cantiere" && (!cerca.trim() || corrisponde(`${m.nome} ${m.targa ?? ""}`, cerca)));

  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setScanner(true)} disabled={cercoCodice || sposta.isPending} className={cn(PILLOLA, "w-full")}>
          {cercoCodice ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <ScanLine className="size-4 shrink-0" aria-hidden="true" />}
          {t("Scansiona il QR")}
        </button>
        <button type="button" onClick={() => setAperto(true)} className={cn(PILLOLA, "w-full")}>
          <Plus className="size-4 shrink-0" aria-hidden="true" />{t("Un altro mezzo")}
        </button>
      </div>
      <BarcodeScanner open={scanner} onOpenChange={setScanner} onScan={(testo: string): void => { void letto(testo); }} />
      {aperto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={t("Scegli il mezzo usato")} className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
            <button type="button" onClick={() => setAperto(false)} aria-label={t("Chiudi")} className="flex size-11 items-center justify-center rounded-full active:bg-muted">
              <X className="size-5" aria-hidden="true" />
            </button>
            <p className="text-[15px] font-bold">{t("Scegli il mezzo usato")}</p>
          </div>
          <div className="space-y-2 p-3">
            <label className="flex min-h-11 items-center gap-2 rounded-full border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder={t("Cerca un mezzo")}
                aria-label={t("Cerca un mezzo")} className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            </label>
            <p className="text-xs text-muted-foreground">{t("Se è libero passa a questo cantiere e l'ufficio viene avvisato.")}</p>
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {elenco.isLoading && <li className="py-4 text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{t("Caricamento…")}</li>}
            {elenco.isError && <li className="py-4 text-sm">{t("Elenco non disponibile.")}</li>}
            {visti.map(m => (
              <li key={m.id}>
                <button type="button" disabled={!m.libero || sposta.isPending} onClick={() => sposta.mutate(m)}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left disabled:opacity-60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.nome}{m.targa ? ` · ${m.targa}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{m.libero ? t("Libero in deposito") : t("Assegnato: {dove}", { dove: m.dove ?? "" })}</span>
                  </span>
                  {m.libero && <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{t("Usato")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
