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
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
  const [ricerca, setRicerca] = useState("");

  const { data: ordini = [], isLoading } = useQuery({
    queryKey: ["arrivo-merce-ordini-aperti", companyId],
    enabled: open && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<OdaAperto[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "id, oda_number, status, expected_delivery_date, ticket_id, " +
            "supplier:suppliers!purchase_orders_supplier_id_fkey(name), " +
            "commessa:orders!purchase_orders_order_id_fkey(order_code, client_name)",
        )
        .eq("company_id", companyId)
        .in("status", STATI_APERTI)
        .order("expected_delivery_date", { ascending: true, nullsFirst: false })
        .limit(60);
      if (error) throw error;

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
      const { data: items, error: itemsErr } = await supabase
        .from("purchase_order_items")
        .select("purchase_order_id, quantity, quantity_received")
        .in("purchase_order_id", righe.map((r) => r.id));
      if (itemsErr) throw itemsErr;

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
    if (!q) return ordini;
    return ordini.filter((o) =>
      [o.oda_number, o.fornitore, o.commessa].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [ordini, ricerca]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5" /> Registra arrivo merce
          </DialogTitle>
          <DialogDescription>
            Di quale ordine è questa merce? Le righe si compilano da sole con quello che mancava.
          </DialogDescription>
        </DialogHeader>

        {ordini.length > 6 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cerca per numero, fornitore o commessa"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtrati.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {ordini.length === 0 ? "Nessun ordine a fornitore aperto" : "Nessun ordine trovato"}
            </p>
            <p className="text-xs text-muted-foreground">
              Se la merce è arrivata senza un ordine, registrala come carico libero.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrati.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => scegli(o.id)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.oda_number || "Ordine senza numero"}
                    {o.fornitore && <span className="text-muted-foreground"> · {o.fornitore}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.expected_delivery_date
                      ? `Attesa ${format(new Date(o.expected_delivery_date), "d MMM", { locale: it })}`
                      : "Senza data attesa"}
                    {o.commessa && <> · Commessa {o.commessa}</>}
                    {o.ticketId && <> · Assistenza</>}
                  </p>
                </div>
                {o.senzaRighe ? (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    senza righe
                  </Badge>
                ) : (
                  <Badge
                    className={`shrink-0 text-xs ${
                      o.status === "parziale" ? "bg-red-100 text-red-800" : "bg-muted text-foreground"
                    }`}
                  >
                    {o.righeMancanti} da ricevere
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={libero}>
          Non c&apos;è un ordine — carico libero
        </Button>
      </DialogContent>
    </Dialog>
  );
}
