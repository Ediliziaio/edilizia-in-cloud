/**
 * «Registra arrivo merce» dal magazzino — una porta sola.
 *
 * Prima il magazzino e l'ordine a fornitore avevano due arrivi diversi: dal
 * magazzino si faceva un carico di giacenza che non toccava l'ordine, non
 * creava la bolla e non sapeva dire che cosa mancava; dall'ordine si registrava
 * l'arrivo riga per riga. Chi entrava dalla porta sbagliata lasciava l'ordine
 * aperto per sempre senza accorgersene.
 *
 * Ora la domanda arriva prima del gesto: «di quale ordine è questa merce?».
 * Se l'ordine c'è si apre il foglio con le righe e il residuo (e da lì la
 * commessa e il ticket si aggiornano da soli); se la merce arriva senza ordine
 * resta il carico libero di sempre.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PackageSearch, Search, ArrowDownToLine, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Un ordine è «aperto» finché non è arrivato tutto o non è stato annullato. */
const STATI_APERTI = ["bozza", "inviato", "confermato", "parziale"];

interface OdaAperto {
  id: string;
  oda_number: string | null;
  status: string;
  expected_delivery_date: string | null;
  fornitore: string | null;
  commessa: string | null;
  ticketId: string | null;
  righeMancanti: number;
  senzaRighe: boolean;
}

export function ArrivoMerceEntryDialog({
  open,
  onOpenChange,
  companyId,
  onSelectOda,
  onCaricoLibero,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onSelectOda: (odaId: string) => void;
  onCaricoLibero: () => void;
}) {
  const t = useT();
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [ricerca, setRicerca] = useState("");

  const { data: ordini = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["arrivo-merce-ordini-aperti", companyId],
    enabled: open && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<OdaAperto[]> => {
      const data = await readAllOrderRows<Record<string, unknown>>((from, to) => supabase
        .from("purchase_orders")
        .select(
          "id, oda_number, status, expected_delivery_date, ticket_id, " +
            "supplier:suppliers!purchase_orders_supplier_id_fkey(name), " +
            "commessa:orders!purchase_orders_order_id_fkey(order_code, client_name)",
        )
        .eq("company_id", companyId)
        .in("status", STATI_APERTI)
        .order("expected_delivery_date", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>);

      const righe = (data ?? []) as unknown as Array<{
        id: string;
        oda_number: string | null;
        status: string;
        expected_delivery_date: string | null;
        ticket_id: string | null;
        supplier: { name: string | null } | null;
        commessa: { order_code: string | null; client_name: string | null } | null;
      }>;
      if (righe.length === 0) return [];

      // Quante righe mancano davvero: è l'unica informazione che aiuta a
      // scegliere l'ordine giusto quando ce ne sono diversi dello stesso fornitore.
      const items: Array<{ purchase_order_id: string; quantity: number | null; quantity_received: number | null }> = [];
      for (let start = 0; start < righe.length; start += 50) {
        const batch = await readAllOrderRows<{ purchase_order_id: string; quantity: number | null; quantity_received: number | null }>((from, to) => supabase.from("purchase_order_items")
          .select("id,purchase_order_id,quantity,quantity_received").in("purchase_order_id", righe.slice(start, start + 50).map((r) => r.id)).order("id").range(from, to));
        items.push(...batch);
      }

      const conteggio = new Map<string, { mancanti: number; totali: number }>();
      for (const it of (items ?? []) as Array<{
        purchase_order_id: string;
        quantity: number | null;
        quantity_received: number | null;
      }>) {
        const acc = conteggio.get(it.purchase_order_id) ?? { mancanti: 0, totali: 0 };
        acc.totali += 1;
        if (Number(it.quantity ?? 0) - Number(it.quantity_received ?? 0) > 0) acc.mancanti += 1;
        conteggio.set(it.purchase_order_id, acc);
      }

      return righe.map((r) => {
        const c = conteggio.get(r.id) ?? { mancanti: 0, totali: 0 };
        return {
          id: r.id,
          oda_number: r.oda_number,
          status: r.status,
          expected_delivery_date: r.expected_delivery_date,
          fornitore: r.supplier?.name ?? null,
          commessa: r.commessa?.order_code ?? r.commessa?.client_name ?? null,
          ticketId: r.ticket_id,
          righeMancanti: c.mancanti,
          senzaRighe: c.totali === 0,
        };
      });
    },
  });

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return ordini.filter((o) => (includeDrafts || o.status !== "bozza") && (!q ||
      [o.oda_number, o.fornitore, o.commessa].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
  }, [ordini, ricerca, includeDrafts]);
  // 26/11/2026: prima gli ordini con righe da ricevere; quelli senza righe (non c'è niente da
  // precompilare) in fondo, chiusi sotto un titolo. Prima la lista era fatta solo di «senza righe».
  const conRighe = filtrati.filter((o) => !o.senzaRighe);
  const senzaRighe = filtrati.filter((o) => o.senzaRighe);
  const [mostraSenzaRighe, setMostraSenzaRighe] = useState(false);
  const oggi = new Date().toISOString().slice(0, 10);

  const scegli = (odaId: string) => {
    onOpenChange(false);
    onSelectOda(odaId);
  };

  const libero = () => {
    onOpenChange(false);
    onCaricoLibero();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent struttura="scorrevole" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5" /> {t("Registra arrivo merce")}
          </DialogTitle>
          <DialogDescription>
            {t("Di quale ordine è questa merce? Le righe si compilano da sole con quello che mancava.")}
          </DialogDescription>
        </DialogHeader>

        {/* Ricerca, bozze e carico libero su una riga: il carico libero prima stava in fondo, sotto la lista. */}
        <div className="flex flex-wrap items-center gap-2">
          {ordini.length > 6 && (
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder={t("Cerca per numero, fornitore o commessa")}
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
              />
            </div>
          )}
          {ordini.some((order) => order.status === "bozza") && <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs aria-pressed:border-orange-200 aria-pressed:bg-orange-50 aria-pressed:text-orange-700" aria-pressed={includeDrafts} onClick={() => setIncludeDrafts((current) => !current)}>{includeDrafts ? t("Nascondi bozze") : t("Mostra anche le bozze ({n})", { n: ordini.filter((order) => order.status === "bozza").length })}</Button>}
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={libero}>
            {t("Non c'è un ordine — carico libero")}
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">{t("Non è stato possibile caricare gli ordini.")} <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Riprova ordini")}</Button></div> : filtrati.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {ordini.length === 0 ? t("Nessun ordine a fornitore aperto") : t("Nessun ordine trovato")}
            </p>
            <p className="text-xs text-muted-foreground">{t("Se la merce è arrivata senza un ordine, registrala come carico libero.")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conRighe.length > 0 && <div className="divide-y overflow-hidden rounded-lg border">{conRighe.map((o: typeof filtrati[number]) => {
              const inRitardo = !!o.expected_delivery_date && o.expected_delivery_date.slice(0, 10) < oggi;
              return (
              <button
                key={o.id}
                type="button"
                onClick={() => scegli(o.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <span className="w-32 shrink-0 truncate text-sm font-medium">{o.oda_number || t("Ordine senza numero")}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {o.fornitore || "—"}
                  {o.commessa && <> · {t("Commessa {commessa}", { commessa: String(o.commessa ?? "") })}</>}
                  {o.ticketId && <> {t("· Assistenza")}</>}
                </span>
                <span className={`shrink-0 text-xs tabular-nums ${inRitardo ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                  {o.expected_delivery_date
                    ? t("Attesa {valore}", { valore: format(new Date(o.expected_delivery_date), "d MMM yyyy", { locale: dateFnsCampo() }) })
                    : t("Senza data attesa")}
                </span>
                {o.senzaRighe ? (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">{t("senza righe")}</Badge>
                ) : (
                  <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[11px] font-medium ${o.status === "parziale" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    {t("{righeMancanti} da ricevere", { righeMancanti: String(o.righeMancanti ?? "") })}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              );
            })}</div>}
            {senzaRighe.length > 0 && (conRighe.length === 0 || mostraSenzaRighe ? (
              <div className="space-y-1">
                {conRighe.length > 0 && <p className="px-1 text-xs text-muted-foreground">{t("senza righe")} · {senzaRighe.length}</p>}
                <div className="divide-y overflow-hidden rounded-lg border">{senzaRighe.map((o: typeof filtrati[number]) => {
              const inRitardo = !!o.expected_delivery_date && o.expected_delivery_date.slice(0, 10) < oggi;
              return (
              <button
                key={o.id}
                type="button"
                onClick={() => scegli(o.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <span className="w-32 shrink-0 truncate text-sm font-medium">{o.oda_number || t("Ordine senza numero")}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {o.fornitore || "—"}
                  {o.commessa && <> · {t("Commessa {commessa}", { commessa: String(o.commessa ?? "") })}</>}
                  {o.ticketId && <> {t("· Assistenza")}</>}
                </span>
                <span className={`shrink-0 text-xs tabular-nums ${inRitardo ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                  {o.expected_delivery_date
                    ? t("Attesa {valore}", { valore: format(new Date(o.expected_delivery_date), "d MMM yyyy", { locale: dateFnsCampo() }) })
                    : t("Senza data attesa")}
                </span>
                {o.senzaRighe ? (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">{t("senza righe")}</Badge>
                ) : (
                  <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[11px] font-medium ${o.status === "parziale" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    {t("{righeMancanti} da ricevere", { righeMancanti: String(o.righeMancanti ?? "") })}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              );
            })}</div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setMostraSenzaRighe(true)}>
                {t("senza righe")} · {senzaRighe.length}
              </Button>
            ))}
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
