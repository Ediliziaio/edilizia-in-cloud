/**
 * Fatture e costi → Subappaltatori: ditta per ditta quanto è maturato, pagato e da pagare e a che punto
 * sono i SAL. SAL, verbali, ritenute e pagamenti si gestiscono nella vera scheda dell'impresa, aperta in
 * popup: la commessa resta sotto, e le regole restano una sola.
 * In Cantiere → Lavorazioni la stessa lettura in una riga per ditta.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { percentualeMaturato, righeSubappalti, statoRigaSubappalto, totaliSubappalti, type ContrattoRiga, type RigaSubappalto, type SalRiga, type StatoSubappalto } from "@/lib/orders/subappaltiCommessa";
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
        db.from("sal_subappaltatori").select("id, contratto_id, subappaltatore_id, numero_sal, stato, data_emissione, importo_netto").eq("company_id", companyId).eq("order_id", orderId),
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

const STATO_SAL: Record<string, { testo: string; tono: TonoStato }> = {
  ricevuto: { testo: "da verificare", tono: "ambra" },
  verificato: { testo: "da pagare", tono: "blu" },
  pagato: { testo: "pagato", tono: "verde" },
  contestato: { testo: "contestato", tono: "rosso" },
};

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
  const totali = totaliSubappalti(righe);
  // Con una ditta sola i filtri non filtrano niente; e un filtro a zero non serve.
  const filtri = ([
    { chiave: "problema", etichetta: "Contestati", avviso: true },
    { chiave: "daVerificare", etichetta: "SAL da verificare", avviso: true },
    { chiave: "daPagare", etichetta: "Da pagare" },
    { chiave: "inRegola", etichetta: "Saldati" },
    { chiave: "nessuno", etichetta: "Senza SAL" },
  ] as const).map((v) => ({ ...v, valore: conta(v.chiave) })).filter((v) => v.valore > 0);

  return (
    <>
      {scheda}
      {costoAperto && <ExpensePaymentDialog key={costoAperto} costId={costoAperto} onClose={() => setCostoAperto(null)} />}
      <RiquadroCommessa
        icona={<Users className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo="Subappaltatori e ditte" conteggio={righe.length}
        numeri={righe.length > 0 ? <>
          <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3 lg:grid-cols-5">
            <Numero titolo="Contratti" valore={totali.contratto} />
            <Numero titolo="Maturato" valore={totali.maturato} />
            <Numero titolo="Ritenute" valore={totali.ritenute} />
            <Numero titolo="Pagato" valore={totali.pagato} />
            <Numero titolo="Da pagare" valore={totali.residuo} evidenza={totali.residuo > 0} />
          </dl>
          {righe.length > 1 && filtri.length > 1 && <ContatoriFiltro etichetta="Ditte per stato" attivo={filtro} onScegli={setFiltro} voci={filtri.map((v) => ({ ...v }))} />}
        </> : undefined}
      >
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere i subappalti. <button type="button" className="underline" onClick={riprova}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : righe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun subappaltatore su questa commessa. Ditte e contratti si assegnano in Cantiere → Lavorazioni.</p>
        ) : (
          <TabellaCommessa etichetta="Subappaltatori e ditte" righe={visibili} chiave={(r) => r.uscita.chiave} colonne={[
            { titolo: "Ditta", principale: true, cella: (r) => {
              const pct = percentualeMaturato(r.uscita);
              return (
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{r.uscita.controparte ?? "Senza nome"}</p>
                  <p className="text-xs text-muted-foreground">{[r.uscita.riferimento, r.uscita.descrizione].filter(Boolean).join(" · ")}</p>
                  {pct != null && (
                    <div className="flex max-w-xs items-center gap-2" title={`Maturato il ${pct}% del contratto`}>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  )}
                  {r.sal.length > 0 && (
                    <ul className="flex flex-wrap gap-1" aria-label={`SAL di ${r.uscita.controparte ?? "questa ditta"}`}>
                      {r.sal.map((s) => {
                        const st = STATO_SAL[s.stato ?? ""] ?? { testo: s.stato ?? "", tono: "grigio" as TonoStato };
                        return <li key={s.id}><StatoPill tono={st.tono}>SAL {s.numero_sal} · {formatCurrency(Number(s.importo_netto ?? 0))} · {st.testo}</StatoPill></li>;
                      })}
                    </ul>
                  )}
                </div>
              );
            } },
            { titolo: "Contratto", destra: true, cella: (r) => (r.uscita.contratto != null ? formatCurrency(r.uscita.contratto) : "—") },
            { titolo: "Maturato", destra: true, cella: (r) => (r.uscita.maturato_lordo != null ? formatCurrency(r.uscita.maturato_lordo) : "—") },
            { titolo: "Ritenute", destra: true, cella: (r) => (r.uscita.ritenute ? formatCurrency(r.uscita.ritenute) : "—") },
            { titolo: "Pagato", destra: true, cella: (r) => formatCurrency(r.uscita.pagato) },
            { titolo: "Da pagare", destra: true, cella: (r) => <span className="font-medium">{formatCurrency(r.uscita.residuo)}</span> },
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

function Numero({ titolo, valore, evidenza }: { titolo: string; valore: number; evidenza?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{titolo}</dt><dd className={`mt-1 text-sm font-semibold tabular-nums ${evidenza ? "text-amber-700" : ""}`}>{formatCurrency(valore)}</dd></div>;
}
