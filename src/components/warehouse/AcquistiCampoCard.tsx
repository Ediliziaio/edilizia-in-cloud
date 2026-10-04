/**
 * Merce presa in negozio dagli operai (ufficio).
 *
 * L'operaio fotografa bolla o scontrino e dice come ha preso la merce; qui l'ufficio verifica:
 *   · «Registra» crea UN costo diretto sulla commessa (e, se l'ha pagata l'operaio, il rimborso
 *     nello scadenzario) — oppure, per un ritiro d'ordine, collega l'ordine d'acquisto e NON crea
 *     costi: il costo è già nell'ordine, farne un altro lo conterebbe due volte;
 *   · «Rifiuta» avvisa l'operaio col motivo;
 *   · «Segna rimborsato» chiude il rimborso a chi ha pagato di tasca.
 * Senza niente da verificare la scheda non compare.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Banknote, Building2, Calendar, Check, FileImage, Loader2, ShoppingBag, User, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODALITA, euro, type ModalitaAcquisto, type RigaAcquisto, type StatoAcquisto, type StatoRimborso } from "@/lib/campo/acquisti";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";

interface AcquistoUfficio {
  id: string;
  created_at: string;
  order_id: string | null;
  modalita: ModalitaAcquisto;
  fornitore: string | null;
  numero_documento: string | null;
  totale: number | null;
  righe: RigaAcquisto[] | null;
  foto_path: string | null;
  purchase_order_id: string | null;
  stato: StatoAcquisto;
  rimborso_stato: StatoRimborso;
  note: string | null;
  operaio: { first_name: string | null; last_name: string | null } | null;
  order: { order_code: string | null } | null;
}
interface OdaAperto { id: string; oda_number: string | null; status: string; suppliers: { name: string | null } | null }

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const NESSUN_ORDINE = "__nessuno__";

export function AcquistiCampoCard() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id ?? null;
  const [aperto, setAperto] = useState<string | null>(null);

  const { data: acquisti = [], isLoading } = useQuery({
    queryKey: ["acquisti-campo-ufficio", companyId],
    enabled: !!companyId,
    staleTime: 15_000,
    queryFn: async (): Promise<AcquistoUfficio[]> => {
      // Tabella nuova, non ancora nei tipi generati.
      const { data, error } = await supabase
        .from("campo_acquisti" as never)
        .select("id, created_at, order_id, modalita, fornitore, numero_documento, totale, righe, foto_path, purchase_order_id, stato, rimborso_stato, note, operaio:profiles(first_name, last_name), order:orders(order_code)" as never)
        .eq("company_id" as never, companyId as never)
        .or("stato.eq.da_verificare,and(stato.eq.registrato,rimborso_stato.eq.da_rimborsare)" as never)
        .order("created_at" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AcquistoUfficio[];
    },
  });
  const daVerificare = acquisti.filter(a => a.stato === "da_verificare");
  const daRimborsare = acquisti.filter(a => a.stato === "registrato" && a.rimborso_stato === "da_rimborsare");

  const azione = useMutation({
    mutationFn: async (v: { id: string; azione: "registra" | "rifiuta" | "rimborsato"; totale?: number | null; ordineAcquisto?: string | null; motivo?: string }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
      const { data, error } = await rpc("campo_acquisto_verifica", {
        p_id: v.id,
        p_azione: v.azione,
        p_totale: v.totale ?? null,
        p_purchase_order_id: v.ordineAcquisto ?? null,
        p_motivo: v.motivo ?? null,
      });
      if (error) throw error;
      return data as { messaggio?: string } | null;
    },
    onSuccess: (data, v) => {
      void qc.invalidateQueries({ queryKey: ["acquisti-campo-ufficio"] });
      void qc.invalidateQueries({ queryKey: ["company-costs"] });
      void qc.invalidateQueries({ queryKey: ["ordine-marginalita"] });
      setAperto(null);
      toast.success(v.azione === "registra" ? "Registrata" : v.azione === "rifiuta" ? "Rifiutata: l’operaio è avvisato" : "Rimborso segnato", {
        description: v.azione === "registra" ? data?.messaggio : undefined,
      });
    },
    onError: (e: unknown) => toast.error("Operazione non riuscita", { description: messaggioErrore(e, "Riprova.") }),
  });

  if (!isLoading && acquisti.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-5 w-5 text-orange-600" aria-hidden="true" />
          Merce presa in negozio
          <Badge className="bg-orange-100 text-orange-700">{acquisti.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {daVerificare.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Da verificare</p>
                {daVerificare.map(a => (
                  <Verifica key={a.id} a={a} aperto={aperto === a.id} onApri={() => setAperto(aperto === a.id ? null : a.id)}
                    occupato={azione.isPending && azione.variables?.id === a.id}
                    onRegistra={(totale, ordine) => azione.mutate({ id: a.id, azione: "registra", totale, ordineAcquisto: ordine })}
                    onRifiuta={motivo => azione.mutate({ id: a.id, azione: "rifiuta", motivo })} />
                ))}
              </div>
            )}
            {daRimborsare.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Da rimborsare agli operai</p>
                {daRimborsare.map(a => (
                  <div key={a.id} className="rounded-xl border p-3">
                    <Testa a={a} />
                    <Button size="sm" className="mt-3 w-full gap-1.5" disabled={azione.isPending && azione.variables?.id === a.id}
                      onClick={() => azione.mutate({ id: a.id, azione: "rimborsato" })}>
                      <Banknote className="h-4 w-4" aria-hidden="true" />Segna rimborsato · {euro(a.totale)}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function nomeOperaio(a: AcquistoUfficio) {
  return [a.operaio?.first_name, a.operaio?.last_name].filter(Boolean).join(" ") || "Operaio";
}

function Testa({ a }: { a: AcquistoUfficio }) {
  const modalita = MODALITA.find(m => m.key === a.modalita)?.titolo ?? a.modalita;
  const [apertura, setApertura] = useState(false);
  const vediFoto = async () => {
    if (!a.foto_path) return;
    setApertura(true);
    const { data, error } = await supabase.storage.from("campo-rapportini").createSignedUrl(a.foto_path, 600);
    setApertura(false);
    if (error || !data?.signedUrl) { toast.error("Non riesco ad aprire la foto."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold">{a.fornitore || "Negozio"}{a.numero_documento ? ` · n. ${a.numero_documento}` : ""}</p>
        <span className="shrink-0 text-sm font-bold tabular-nums">{euro(a.totale)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden="true" />{nomeOperaio(a)}</span>
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden="true" />{format(new Date(a.created_at), "d MMM HH:mm", { locale: it })}</span>
        {a.order?.order_code && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" aria-hidden="true" />{a.order.order_code}</span>}
        <Badge variant="outline" className="text-[11px]">{modalita}</Badge>
      </div>
      {(a.righe ?? []).length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {(a.righe ?? []).slice(0, 6).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{r.descrizione}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">× {r.quantita}{r.unita ? ` ${r.unita}` : ""}</span>
            </li>
          ))}
          {(a.righe ?? []).length > 6 && <li className="text-xs text-muted-foreground">+ {(a.righe ?? []).length - 6} altri prodotti</li>}
        </ul>
      )}
      {a.note && <p className="mt-1 text-xs text-muted-foreground">Nota: {a.note}</p>}
      {a.foto_path && (
        <button type="button" onClick={() => void vediFoto()} disabled={apertura} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs text-primary underline">
          {apertura ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <FileImage className="h-3 w-3" aria-hidden="true" />}Vedi il documento
        </button>
      )}
    </>
  );
}

function Verifica({ a, aperto, onApri, occupato, onRegistra, onRifiuta }: {
  a: AcquistoUfficio; aperto: boolean; onApri: () => void; occupato: boolean;
  onRegistra: (totale: number | null, ordineAcquisto: string | null) => void;
  onRifiuta: (motivo: string) => void;
}) {
  const [totale, setTotale] = useState(a.totale != null ? String(a.totale).replace(".", ",") : "");
  const [ordine, setOrdine] = useState(a.purchase_order_id ?? NESSUN_ORDINE);
  const [rifiuto, setRifiuto] = useState(false);
  const [motivo, setMotivo] = useState("");

  const { data: ordini = [] } = useQuery({
    queryKey: ["acquisti-campo-oda-aperti", a.order_id],
    enabled: aperto && a.modalita === "ritiro_ordine" && !!a.order_id,
    queryFn: async (): Promise<OdaAperto[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, suppliers(name)")
        .eq("order_id", a.order_id as string)
        .in("status", ["inviato", "confermato", "parziale"]);
      if (error) throw error;
      return (data ?? []) as unknown as OdaAperto[];
    },
  });
  const importo = useMemo(() => {
    const n = Number(totale.replace(",", "."));
    return totale.trim() !== "" && Number.isFinite(n) ? n : null;
  }, [totale]);
  const collegaOrdine = a.modalita === "ritiro_ordine" && ordine !== NESSUN_ORDINE;

  return (
    <div className="rounded-xl border p-3">
      <Testa a={a} />
      {!aperto ? (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onApri}>Verifica</Button>
      ) : (
        <div className="mt-3 space-y-3 border-t pt-3">
          {a.modalita === "ritiro_ordine" && (
            <div className="space-y-1">
              <label htmlFor={`oda-${a.id}`} className="text-xs font-semibold">A quale ordine d’acquisto corrisponde?</label>
              <select id={`oda-${a.id}`} value={ordine} onChange={e => setOrdine(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-2 text-sm">
                <option value={NESSUN_ORDINE}>Nessuno: registra come costo diretto</option>
                {ordini.map(o => <option key={o.id} value={o.id}>{o.oda_number ?? "Ordine"} · {o.suppliers?.name ?? "Fornitore"} · {o.status}</option>)}
                {a.purchase_order_id && !ordini.some(o => o.id === a.purchase_order_id) && <option value={a.purchase_order_id}>Ordine proposto</option>}
              </select>
              {collegaOrdine && <p className="text-xs text-muted-foreground">Il costo è già nell’ordine: non si crea un costo nuovo. La merce si carica dall’arrivo merce dell’ordine.</p>}
            </div>
          )}
          {!collegaOrdine && (
            <div className="space-y-1">
              <label htmlFor={`tot-${a.id}`} className="text-xs font-semibold">Totale da registrare (€, IVA inclusa)</label>
              <input id={`tot-${a.id}`} inputMode="decimal" value={totale} onChange={e => setTotale(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" />
              <p className="text-xs text-muted-foreground">
                {a.modalita === "pagato_da_me" ? "Diventa un costo del cantiere e il rimborso all’operaio nello scadenzario." : "Diventa un costo del cantiere, da pagare entro 30 giorni."}
              </p>
            </div>
          )}
          {rifiuto ? (
            <div className="space-y-2">
              <input aria-label="Motivo del rifiuto" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (l’operaio lo legge)" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setRifiuto(false)}>Annulla</Button>
                <Button size="sm" variant="destructive" className="flex-1" disabled={occupato} onClick={() => onRifiuta(motivo.trim())}>Rifiuta</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-destructive" disabled={occupato} onClick={() => setRifiuto(true)}>
                <X className="h-4 w-4" aria-hidden="true" />Rifiuta
              </Button>
              <Button size="sm" className="flex-1 gap-1.5" disabled={occupato}
                onClick={() => onRegistra(collegaOrdine ? null : importo, collegaOrdine ? ordine : null)}>
                {occupato ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Registra
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
