/**
 * Fatture e costi → Subappaltatori: ditta per ditta quanto è maturato, pagato e da pagare e a che punto
 * sono i SAL. SAL, verbali, ritenute e pagamenti si gestiscono nella vera scheda dell'impresa, aperta in
 * popup: la commessa resta sotto, e le regole restano una sola.
 * In Cantiere → Lavorazioni la stessa lettura in una riga per ditta.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { righeSubappalti, statoRigaSubappalto, type ContrattoRiga, type RigaSubappalto, type SalRiga, type StatoSubappalto } from "@/lib/orders/subappaltiCommessa";
import { SchedaCommessaDialog } from "@/components/sicurezza/SchedaCommessaDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { useQuadroPagamenti } from "./QuadroPagamentiCommessa";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type TonoStato } from "./TabellaCommessa";

// Tabelle dei subappalti non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const TONO: Record<StatoSubappalto, TonoStato> = { problema: "rosso", daVerificare: "ambra", daPagare: "ambra", inRegola: "verde", nessuno: "grigio" };

function useRigheSubappalti(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const quadro = useQuadroPagamenti(orderId);
  const documenti = useQuery({
    queryKey: ["order-supplier-payments", "subappalti", companyId, orderId],
    enabled: !!companyId && !!orderId,
    queryFn: async (): Promise<{ contratti: ContrattoRiga[]; sal: SalRiga[] }> => {
      const [contratti, sal] = await Promise.all([
        db.from("contratti_subappalto").select("id, subappaltatore_id").eq("company_id", companyId).eq("order_id", orderId),
        db.from("sal_subappaltatori").select("id, contratto_id, subappaltatore_id, numero_sal, stato").eq("company_id", companyId).eq("order_id", orderId),
      ]);
      if (contratti.error) throw contratti.error;
      if (sal.error) throw sal.error;
      return { contratti: contratti.data ?? [], sal: sal.data ?? [] };
    },
  });
  const righe = useMemo(
    () => righeSubappalti(quadro.data?.uscite ?? [], documenti.data?.sal ?? [], documenti.data?.contratti ?? []),
    [quadro.data, documenti.data],
  );
  return { righe, companyId, isLoading: quadro.isLoading || documenti.isLoading, isError: quadro.isError || documenti.isError, riprova: () => { void quadro.refetch(); void documenti.refetch(); } };
}

const statoDi = (r: RigaSubappalto) => statoRigaSubappalto({ ...r, residuo: r.uscita.residuo });

function useSchedaImpresa(orderId: string, companyId: string | undefined) {
  const queryClient = useQueryClient();
  const [destinazione, setDestinazione] = useState<string | null>(null);
  const apri = (r: RigaSubappalto) => setDestinazione(`/azienda/subappaltatori/${r.subappaltatoreId}?tab=contabilita${r.contrattoId ? `&contratto=${r.contrattoId}` : ""}`);
  const scheda = destinazione && companyId ? (
    <SchedaCommessaDialog key={destinazione} destinazione={{ to: destinazione }} companyId={companyId} orderId={orderId}
      onClose={() => { setDestinazione(null); void queryClient.invalidateQueries({ queryKey: ["order-supplier-payments"] }); }} />
  ) : null;
  return { apri, scheda };
}

export function SubappaltatoriCommessa({ orderId, onApriCantiere }: { orderId: string; onApriCantiere: () => void }) {
  const permessi = usePermissions();
  const { righe, companyId, isLoading, isError, riprova } = useRigheSubappalti(orderId);
  const { apri, scheda } = useSchedaImpresa(orderId, companyId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [costoAperto, setCostoAperto] = useState<string | null>(null);
  const conta = (chiave: StatoSubappalto) => righe.filter((r) => statoDi(r).chiave === chiave).length;
  const visibili = filtro ? righe.filter((r) => statoDi(r).chiave === filtro) : righe;
  const residuo = righe.reduce((s, r) => s + r.uscita.residuo, 0);

  return (
    <>
      {scheda}
      {costoAperto && <ExpensePaymentDialog key={costoAperto} costId={costoAperto} onClose={() => setCostoAperto(null)} />}
      <RiquadroCommessa
        icona={<Users className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo="Subappaltatori e ditte" conteggio={righe.length}
        riassunto={residuo > 0 ? `${formatCurrency(residuo)} da pagare` : undefined}
        numeri={righe.length > 0 ? (
          <ContatoriFiltro etichetta="Ditte per stato" attivo={filtro} onScegli={setFiltro} voci={[
            { chiave: "problema", etichetta: "Contestati", valore: conta("problema"), avviso: true },
            { chiave: "daVerificare", etichetta: "SAL da verificare", valore: conta("daVerificare"), avviso: true },
            { chiave: "daPagare", etichetta: "Da pagare", valore: conta("daPagare") },
            { chiave: "inRegola", etichetta: "Saldati", valore: conta("inRegola") },
            { chiave: "nessuno", etichetta: "Senza SAL", valore: conta("nessuno") },
          ]} />
        ) : undefined}
      >
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere i subappalti. <button type="button" className="underline" onClick={riprova}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : righe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun subappaltatore su questa commessa. Ditte e contratti si assegnano in Cantiere → Lavorazioni.</p>
        ) : (
          <TabellaCommessa etichetta="Subappaltatori e ditte" righe={visibili} chiave={(r) => r.uscita.chiave} colonne={[
            { titolo: "Ditta", principale: true, cella: (r) => (
              <div className="min-w-0">
                <p className="font-medium">{r.uscita.controparte ?? "Senza nome"}</p>
                <p className="text-xs text-muted-foreground">{[r.uscita.riferimento, r.uscita.descrizione].filter(Boolean).join(" · ")}</p>
              </div>
            ) },
            { titolo: "Contratto", destra: true, cella: (r) => (r.uscita.contratto != null ? formatCurrency(r.uscita.contratto) : "—") },
            { titolo: "Maturato", destra: true, cella: (r) => (r.uscita.maturato_lordo != null ? formatCurrency(r.uscita.maturato_lordo) : "—") },
            { titolo: "Ritenute", destra: true, cella: (r) => (r.uscita.ritenute ? formatCurrency(r.uscita.ritenute) : "—") },
            { titolo: "Pagato", destra: true, cella: (r) => formatCurrency(r.uscita.pagato) },
            { titolo: "Resta", destra: true, cella: (r) => <span className="font-medium">{formatCurrency(r.uscita.residuo)}</span> },
            { titolo: "Stato", cella: (r) => { const s = statoDi(r); return <StatoPill tono={TONO[s.chiave]}>{s.testo}</StatoPill>; } },
            { titolo: "Azioni", destra: true, cella: (r) => r.subappaltatoreId ? (
              permessi.canViewSubappaltatori ? <Button size="sm" variant="outline" onClick={() => apri(r)}>SAL e pagamenti</Button> : null
            ) : r.uscita.origine_tipo === "costo" ? (
              <Button size="sm" variant="outline" onClick={() => setCostoAperto(r.uscita.origine_id)}>Pagamenti</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onApriCantiere}>Contratto</Button>
            ) },
          ]} />
        )}
      </RiquadroCommessa>
    </>
  );
}

/** Cantiere → Lavorazioni: a che punto sono le ditte coi soldi, senza gestirli qui. */
export function StatoSubappaltiCantiere({ orderId }: { orderId: string }) {
  const permessi = usePermissions();
  const { righe, companyId } = useRigheSubappalti(orderId);
  const { apri, scheda } = useSchedaImpresa(orderId, companyId);
  const conScheda = righe.filter((r) => r.subappaltatoreId);
  if (conScheda.length === 0) return null;
  return (
    <section aria-label="SAL e pagamenti delle ditte" className="rounded-xl border bg-white p-3">
      {scheda}
      <h3 className="mb-1.5 text-sm font-semibold">SAL e pagamenti delle ditte</h3>
      <ul className="divide-y">
        {conScheda.map((r) => {
          const s = statoDi(r);
          return (
            <li key={r.uscita.chiave} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
              <span className="min-w-0 font-medium">{r.uscita.controparte ?? "Senza nome"}</span>
              <span className="flex flex-wrap items-center gap-2">
                <StatoPill tono={TONO[s.chiave]}>{s.testo}</StatoPill>
                <span className="tabular-nums text-muted-foreground">resta {formatCurrency(r.uscita.residuo)}</span>
                {permessi.canViewSubappaltatori && (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => apri(r)} aria-label={`SAL e pagamenti di ${r.uscita.controparte ?? "questa ditta"}`}>
                    Apri<ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
