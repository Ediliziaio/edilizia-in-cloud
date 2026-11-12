// src/components/settings/CommesseGeneraliConfig.tsx
// Impostazioni → Commesse generali: quali tipi l'azienda usa. Spento = la scelta non compare
// da nessuna parte; le generali già create restano visibili e si possono ancora usare.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, KeyRound, Landmark, Plus, ShoppingCart, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NuovaGeneraleDialog } from "@/components/orders/generali/NuovaGeneraleDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioGenerale, useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { DEFINIZIONI_MODELLI, MODELLI_GENERALE, isModelloGenerale, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le generali dell'azienda: quante per tipo (spegnendo un tipo usato, si dice che restano) e le ultime. */
function useGeneraliAzienda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commesse-generali-per-modello", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ conti: Partial<Record<ModelloGenerale, number>>; ultime: GeneraleElenco[] }> => {
      try {
        const { data, error } = await db.from("commesse_generali").select("order_id, modello, created_at").eq("company_id", companyId!).order("created_at", { ascending: false });
        if (error) throw error;
        const righe = (data ?? []) as { order_id: string; modello: unknown }[];
        const { data: ordini, error: e2 } = await db.from("orders").select("id, order_code, description").is("deleted_at", null).in("id", righe.map((r) => r.order_id));
        if (e2) throw e2;
        const vive = new Map(((ordini ?? []) as { id: string; order_code: string | null; description: string | null }[]).map((o) => [o.id, o]));
        const conti: Partial<Record<ModelloGenerale, number>> = {};
        const ultime: GeneraleElenco[] = [];
        for (const r of righe) {
          const o = vive.get(r.order_id);
          if (!o || !isModelloGenerale(r.modello)) continue;
          conti[r.modello] = (conti[r.modello] ?? 0) + 1;
          ultime.push({ id: o.id, codice: o.order_code, nome: o.description ?? "Commessa generale", modello: r.modello });
        }
        return { conti, ultime };
      } catch {
        return { conti: {}, ultime: [] };
      }
    },
  });
}

interface GeneraleElenco { id: string; codice: string | null; nome: string; modello: ModelloGenerale }

const ICONE: Record<ModelloGenerale, LucideIcon> = { appalto: Landmark, sviluppo: Building2, compravendita: KeyRound };

/** Cosa si vede dentro: una barra d'esempio, per capire il tipo senza doverlo provare. */
const ANTEPRIMA: Record<ModelloGenerale, { titolo: string; righe: [string, number][] }> = {
  appalto: { titolo: "Il contratto che scala", righe: [["Assegnato", 85], ["A SAL", 55], ["Incassato", 40]] },
  sviluppo: { titolo: "Le unità che si vendono", righe: [["Prenotate", 70], ["Rogitate", 35], ["Incassato", 45]] },
  compravendita: { titolo: "L'operazione", righe: [["Lavori", 80], ["Venduto", 50], ["Incassato", 30]] },
};

export default function CommesseGeneraliConfig({ puoModificare, evidenziata = false }: { puoModificare: boolean; evidenziata?: boolean }) {
  const { modelli, disponibile, isLoading, salva, commessaCliente, salvaCommessaCliente } = useImpostazioniCommesseGenerali();
  const { data } = useGeneraliAzienda();
  const conti = data?.conti ?? {};
  const ultime = data?.ultime ?? [];
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  // Appena acceso un tipo si può creare la prima generale da qui, senza cercare dove.
  const puoCreare = !!permissions.canEditOrders && !isMobile;
  const [nuova, setNuova] = useState<ModelloGenerale | null>(null);

  const cambia = (m: ModelloGenerale, acceso: boolean) => {
    const scelti = acceso ? [...modelli, m] : modelli.filter((x) => x !== m);
    salva.mutate(scelti, {
      onSuccess: () => toast.success(acceso ? `«${DEFINIZIONI_MODELLI[m].nome}» è attivo` : `«${DEFINIZIONI_MODELLI[m].nome}» è spento`),
      onError: (e) => toast.error(messaggioGenerale(e, "questa impostazione")),
    });
  };

  // Spegnere la commessa cliente senza nessuna generale accesa lascerebbe
  // l'azienda senza niente da creare: il database lo rifiuta, qui non si offre.
  const puoSpegnereCliente = modelli.length > 0;
  const cambiaCliente = (attiva: boolean) => {
    salvaCommessaCliente.mutate(attiva, {
      onSuccess: () => toast.success(attiva ? "«Commessa cliente» è attiva" : "«Commessa cliente» è spenta"),
      onError: (e) => toast.error(messaggioGenerale(e, "questa impostazione")),
    });
  };

  return (
    <SezioneImpostazione
      id="tipi"
      titolo="Come lavori?"
      descrizione="Accendi quello che fai: una commessa generale raccoglie più commesse e ne somma i numeri. Quello che resta spento non compare da nessuna parte."
      ambito={<AmbitoImpostazione>Tutta l'azienda</AmbitoImpostazione>}
      azione={<span>Si salva subito</span>}
      evidenziata={evidenziata}
    >
      {!disponibile && (
        <div className="px-4 py-3">
          <Alert>
            <AlertDescription>Le commesse generali non sono ancora disponibili per la tua azienda. Riprova più tardi.</AlertDescription>
          </Alert>
        </div>
      )}
      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-3">
        {MODELLI_GENERALE.map((m) => {
          const def = DEFINIZIONI_MODELLI[m];
          const Icona = ICONE[m];
          const acceso = modelli.includes(m);
          const esistenti = conti[m] ?? 0;
          const anteprima = ANTEPRIMA[m];
          return (
            <article key={m} className={cn("flex flex-col rounded-lg border p-3 transition-colors sm:p-4", acceso ? "border-primary/40 bg-primary/[0.03]" : "bg-card")}>
              <div className="flex items-start gap-2.5">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", acceso ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Icona className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-tight">{def.nome}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground max-sm:hidden">{def.perChi}</p>
                </div>
                <Switch
                  id={`modello-generale-${m}`}
                  aria-label={def.nome}
                  checked={acceso}
                  disabled={!puoModificare || !disponibile || isLoading || salva.isPending}
                  onCheckedChange={(v) => cambia(m, v)}
                />
              </div>

              <div className="mt-3 rounded-md border bg-background px-2.5 py-2 max-sm:hidden" aria-hidden="true">
                <p className="text-[11px] font-medium text-muted-foreground">{anteprima.titolo} · esempio</p>
                <div className="mt-1.5 space-y-1">
                  {anteprima.righe.map(([etichetta, parte]) => (
                    <div key={etichetta} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{etichetta}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${parte}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <ul className="mt-2.5 flex flex-wrap gap-1 max-sm:hidden">
                {def.comprende.split(" · ").map((voce) => (
                  <li key={voce} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{voce}</li>
                ))}
              </ul>

              {!acceso && esistenti > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {esistenti === 1 ? "Hai già una commessa generale di questo tipo: resta visibile." : `Hai già ${esistenti} commesse generali di questo tipo: restano visibili.`}
                </p>
              )}

              {acceso && (
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 sm:pt-3">
                  {puoCreare && (
                    <Button type="button" size="sm" variant={esistenti > 0 ? "outline" : "default"} className="h-8" onClick={() => setNuova(m)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> {esistenti > 0 ? "Creane un'altra" : "Crea la prima"}
                    </Button>
                  )}
                  {esistenti > 0 && (
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                      <Link to="/azienda/ordini?generali=solo">
                        {esistenti === 1 ? "Vedi quella che hai" : `Vedi le ${esistenti} che hai`} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* L'azienda che fa SOLO operazioni immobiliari non ha commesse per un cliente:
          qui si toglie anche quella, l'unica scheda che prima era sempre presente. */}
      <div className="border-t px-3 py-3 sm:px-4">
        <div className="flex items-start gap-2.5">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", commessaCliente ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <ShoppingCart className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight">Commessa cliente</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Un lavoro per un cliente, privato o azienda. Spenta, non compare più in «Nuova Commessa»: resta solo quello che hai acceso qui sopra.
              Le unità di una commessa generale si creano comunque.
            </p>
            {!commessaCliente && (
              <p className="mt-1 text-xs text-muted-foreground">Le commesse cliente già create restano visibili e si possono ancora usare.</p>
            )}
            {commessaCliente && !puoSpegnereCliente && (
              <p className="mt-1 text-xs text-muted-foreground">Per spegnerla accendi prima un tipo di commessa generale: altrimenti non resterebbe niente da creare.</p>
            )}
          </div>
          <Switch
            id="commessa-cliente-attiva"
            aria-label="Commessa cliente"
            checked={commessaCliente}
            disabled={!puoModificare || !disponibile || isLoading || salvaCommessaCliente.isPending || (commessaCliente && !puoSpegnereCliente)}
            onCheckedChange={cambiaCliente}
          />
        </div>
      </div>

      {ultime.length > 0 && (
        <section aria-labelledby="generali-ultime-titolo" className="border-t px-3 py-3 sm:px-4">
          <h3 id="generali-ultime-titolo" className="text-xs font-medium text-muted-foreground">Le tue commesse generali</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {ultime.slice(0, 9).map((g) => {
              const Icona = ICONE[g.modello];
              return (
                <li key={g.id}>
                  <Link to={`/azienda/ordini/${g.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Icona className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {g.codice && <span className="shrink-0 text-xs text-muted-foreground">{g.codice}</span>}
                    <span className="min-w-0 truncate">{g.nome}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {puoCreare && (
        <NuovaGeneraleDialog
          open={nuova !== null}
          onOpenChange={(aperta) => { if (!aperta) setNuova(null); }}
          modelli={modelli}
          iniziale={nuova}
        />
      )}
    </SezioneImpostazione>
  );
}
