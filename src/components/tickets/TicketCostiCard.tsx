/**
 * Quanto costa l'intervento e quanto ci resta.
 *
 * Serve a rispondere a due domande che oggi non hanno risposta: l'intervento a
 * pagamento è andato in guadagno? E quanto ci costa la garanzia, che è costo
 * puro? Si registrano i numeri di partenza (ore, costo orario, trasferta,
 * materiale); totale e margine sono sempre ricalcolati.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export interface TicketCosti {
  assigned_to?: string | null;
  durata_ore?: number | null;
  ore_effettive?: number | null;
  costo_orario_applicato?: number | null;
  costo_trasferta?: number | null;
  costo_materiale?: number | null;
  a_pagamento?: boolean | null;
  importo_finale?: number | null;
  importo_preventivato?: number | null;
}

export function TicketCostiCard({
  ticketId, ticket, companyId,
}: { ticketId: string; ticket: TicketCosti; companyId: string }) {
  const qc = useQueryClient();
  const [ore, setOre] = useState(
    (ticket.ore_effettive ?? ticket.durata_ore ?? "").toString(),
  );
  const [trasferta, setTrasferta] = useState((ticket.costo_trasferta ?? "").toString());
  const [materiale, setMateriale] = useState((ticket.costo_materiale ?? "").toString());

  // Costo orario del tecnico assegnato: si legge oggi, ma si SALVA sul ticket,
  // così un aumento di paga domani non riscrive il margine di ieri.
  const { data: costoOrarioTecnico } = useQuery({
    queryKey: ["costo-orario", ticket.assigned_to, companyId],
    enabled: !!ticket.assigned_to && !ticket.costo_orario_applicato,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees").select("costo_orario")
        .eq("user_id", ticket.assigned_to!).eq("company_id", companyId)
        .maybeSingle();
      return (data as { costo_orario: number | null } | null)?.costo_orario ?? null;
    },
  });

  const orario = ticket.costo_orario_applicato ?? costoOrarioTecnico ?? 0;
  const nOre = Number(ore) || 0;
  const manodopera = nOre * Number(orario || 0);
  const costoTotale = manodopera + (Number(trasferta) || 0) + (Number(materiale) || 0);
  const ricavo = ticket.a_pagamento
    ? Number(ticket.importo_finale ?? ticket.importo_preventivato ?? 0)
    : 0;
  const margine = ricavo - costoTotale;

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tickets").update({
        ore_effettive: ore ? Number(ore) : null,
        costo_orario_applicato: orario || null,
        costo_trasferta: trasferta ? Number(trasferta) : null,
        costo_materiale: materiale ? Number(materiale) : null,
      } as never).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      toast.success("Costi aggiornati");
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a salvare i costi"),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Costo dell'intervento</h3>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Ore</Label>
            <Input type="number" min="0" step="0.5" inputMode="decimal" className="h-9"
                   value={ore} onChange={(e) => setOre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trasferta €</Label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" className="h-9"
                   value={trasferta} onChange={(e) => setTrasferta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Materiale €</Label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" className="h-9"
                   value={materiale} onChange={(e) => setMateriale(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Manodopera {nOre ? `(${nOre} h × ${eur(Number(orario || 0))})` : ""}
            </span>
            <span className="font-medium">{eur(manodopera)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1">
            <span className="text-muted-foreground">Costo totale</span>
            <span className="font-semibold">{eur(costoTotale)}</span>
          </div>
          {ticket.a_pagamento ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Incasso previsto</span>
                <span className="font-medium">{eur(ricavo)}</span>
              </div>
              <div className={`flex items-center justify-between border-t border-border pt-1 font-bold ${margine >= 0 ? "text-green-700" : "text-red-600"}`}>
                <span className="flex items-center gap-1">
                  {margine >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  Margine
                </span>
                <span>{eur(margine)}</span>
              </div>
            </>
          ) : (
            costoTotale > 0 && (
              <p className="border-t border-border pt-1 text-amber-700">
                Intervento in garanzia: {eur(costoTotale)} è costo a carico nostro.
              </p>
            )
          )}
        </div>

        {!orario && ticket.assigned_to && (
          <p className="text-[11px] text-muted-foreground">
            Il tecnico assegnato non ha un costo orario nella sua scheda: la manodopera resta a zero.
          </p>
        )}

        <Button size="sm" variant="outline" className="w-full"
                onClick={() => salva.mutate()} disabled={salva.isPending}>
          {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva costi"}
        </Button>
      </CardContent>
    </Card>
  );
}
