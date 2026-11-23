import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useParametriCostoPersonale } from "@/hooks/useParametriCostoPersonale";
import { Building2, RefreshCw, UsersRound } from "lucide-react";
import { useOrderLaborEconomics } from "@/hooks/useOrderLaborEconomics";
import { useCostoDaCedolini } from "@/hooks/useCostoDaCedolini";
import { usePermissions } from "@/hooks/usePermissions";
import { costoDaCedolini } from "@/lib/orders/costoDaCedolini";
import { externalLaborNet, laborAmount, laborEconomics, sumLaborAmounts } from "@/lib/orders/laborEconomics";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RiquadroCommessa, TabellaCommessa } from "./TabellaCommessa";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

function Value({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>;
}

type Persona = ReturnType<typeof laborEconomics>["people"][number];

/** Registro giornaliero condiviso; stipendi e pagamenti restano separati. */
export function OrderLaborEconomics({ orderId }: { orderId: string }) {
  const t = useT();
  const money = (value: number | null) => value == null ? t("Da verificare") : formatCurrency(value);
  const hours = (value: number | null) => value == null ? t("Da verificare") : `${value.toLocaleString(intlCampo(), { maximumFractionDigits: 2 })} h`;
  const { employees, teams, aggregate, pendingReports, canCheckPending, readRates, allowed } = useOrderLaborEconomics(orderId);
  const { data: parametriCosto } = useParametriCostoPersonale();
  const { isAdmin } = usePermissions();
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const righe = useMemo(() => employees.data ?? [], [employees.data]);
  const idPersone = useMemo(() => [...new Set(righe.map((r) => r.employee_id))], [righe]);
  const cedolini = useCostoDaCedolini(orderId, idPersone, allowed && readRates && !!isAdmin);
  if (!allowed) return <p className="rounded-lg border p-4 text-sm">{t("Il tuo ruolo non permette di consultare i costi della manodopera.")}</p>;
  if (!readRates) {
    if (aggregate?.isPending) return <p role="status" className="p-4 text-sm">{t("Caricamento costo aggregato…")}</p>;
    if (!aggregate?.data || aggregate.isError) return <div role="alert" className="rounded-lg border p-4"><p>{t("Costo aggregato non disponibile.")}</p><Button variant="outline" onClick={() => void aggregate?.refetch()}>{t("Riprova")}</Button></div>;
    return <section aria-label={t("Costo aggregato del personale")} className="rounded-lg border bg-white p-4">
      <h3 className="font-medium">{t("Personale interno: costo aggregato")}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3"><Value label={t("Costo registrato")} value={aggregate.data.unpriced ? t("Da completare") : money(aggregate.data.cost)} /><Value label={t("Budget")} value={money(aggregate.data.budget)} /></dl>
      <p className="mt-3 text-sm text-muted-foreground">{t("Il dettaglio economico per persona e le tariffe sono riservati al personale autorizzato.")}</p>
    </section>;
  }
  if (employees.isPending || teams.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">{t("Caricamento ore e costi…")}</p>;
  const retry = () => { void employees.refetch(); void teams.refetch(); void pendingReports?.refetch?.(); void cedolini.refetch(); };
  if (employees.isError || teams.isError) return <div role="alert" className="rounded-lg border p-4">
    <p>{t("Impossibile caricare tutti i costi della manodopera. Nessun totale parziale viene mostrato.")}</p>
    <Button className="mt-2" variant="outline" onClick={retry}>{t("Riprova")}</Button>
  </div>;
  const internal = laborEconomics(righe, readRates, parametriCosto);
  const pendingUnknown = canCheckPending === false || !!pendingReports?.isPending || !!pendingReports?.isError;
  const pending = pendingReports?.data ?? 0;
  const incomplete = internal.unpricedPeople > 0 || pending > 0 || pendingUnknown;
  const confronto = cedolini.data ? costoDaCedolini({
    persone: internal.people.map((p) => ({ id: p.id, ore: p.hours, costo: p.cost })),
    rapportini: cedolini.data.rapportini, cedolini: cedolini.data.cedolini,
  }) : null;
  const diCedolino = (id: string) => confronto?.persone.find((p) => p.id === id) ?? null;
  const aperto = dettaglio ? diCedolino(dettaglio) : null;
  const scostamento = internal.budget == null || internal.cost == null || incomplete || internal.hours === 0 ? "—" : formatCurrency(internal.cost - internal.budget);
  return <div id="section-manodopera-costi" className="scroll-mt-24 space-y-4">
    <RiquadroCommessa
      icona={<UsersRound className="h-5 w-5 text-primary" aria-hidden="true" />}
      titolo={t("Dipendenti e operai interni")} conteggio={internal.people.length}
      azioni={<Button variant="outline" size="sm" onClick={retry} disabled={employees.isFetching || teams.isFetching}><RefreshCw className="mr-2 h-4 w-4" />{t("Aggiorna costi")}</Button>}
      numeri={<dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3 lg:grid-cols-5">
        <Value label={t("Ore registrate")} value={internal.plannedHours != null ? t("{ore} su {previste}", { ore: hours(internal.hours), previste: hours(internal.plannedHours) }) : hours(internal.hours)} />
        <Value label={t("Costo registrato")} value={internal.unpricedPeople ? t("Da completare") : money(internal.cost)} />
        {confronto && <Value label={t("Costo da cedolino")} value={confronto.oreCoperte > 0 ? formatCurrency(confronto.costoTotale) : t("Nessun cedolino")} />}
        <Value label={t("Budget")} value={internal.budget == null ? t("Da completare") : money(internal.budget)} />
        <Value label={t("Scostamento dal budget")} value={scostamento} />
      </dl>}
    >
      <div className="space-y-3">
        {pendingUnknown && <p role="status" className="rounded-lg border p-3 text-sm">{t("Le ore in attesa non sono verificabili in questo momento. Il costo registrato non rappresenta il costo finale della commessa.")}</p>}
        {pending > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{t("Rapportini in attesa: {n}. Il costo effettivo è ancora parziale. Lo scostamento sarà disponibile dopo la verifica.", { n: pending })}</p>}
        {internal.unpricedPeople > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("Ore registrate a costo zero per {n} persone: verifica i costi storici. Impostare la tariffa oggi non valorizza retroattivamente le ore già registrate.", { n: internal.unpricedPeople })}</p>}
        {cedolini.isError && <p role="status" className="rounded-lg border p-3 text-sm">{t("Cedolini non leggibili: resta visibile il solo costo registrato.")} <button type="button" className="underline" onClick={() => void cedolini.refetch()}>{t("Riprova")}</button></p>}
        {confronto && confronto.oreCoperte > 0 && confronto.differenza != null && <p className="rounded-lg border bg-muted/20 p-3 text-sm">
          {Math.abs(confronto.differenza) < 0.005 ? t("Sulle {ore} con un cedolino la stima è giusta.", { ore: hours(confronto.oreCoperte) }) : <>{t(confronto.differenza > 0 ? "Sulle {ore} con un cedolino la stima è bassa di" : "Sulle {ore} con un cedolino la stima è alta di", { ore: hours(confronto.oreCoperte) })} <strong>{formatCurrency(Math.abs(confronto.differenza))}</strong>.</>}
          {confronto.oreScoperte > 0 && t(" Altre {ore} restano al costo registrato: senza cedolino o inserite a mano.", { ore: hours(confronto.oreScoperte) })} {t("Il margine della commessa usa ancora il costo registrato.")}
        </p>}
        {!internal.people.length ? <p className="commessa-empty text-sm text-muted-foreground">{t("Nessuna ora registrata: compaiono quando un rapportino viene approvato o vengono inserite a mano.")}</p> : (
          <TabellaCommessa etichetta={t("Costi dei dipendenti")} righe={internal.people} chiave={(p) => p.id} colonne={[
            { titolo: t("Persona"), principale: true, cella: (p) => <>
              <span className="font-medium">{p.name}</span>
              {p.overBudget && <Badge variant="destructive" className="ml-2">{t("Oltre budget")}</Badge>}
              {/* Una riga per persona: la nota solo se la tariffa non è quella scritta sulla scheda. */}
              {p.rate && p.rate.source !== "manuale" && <span className="block text-xs text-muted-foreground">{p.rate.source === "calcolato" ? t("Tariffa calcolata dal lordo") : t("Tariffa non determinabile")}</span>}
            </> },
            { titolo: t("Ore"), destra: true, cella: (p) => <>{hours(p.hours)}{p.plannedHours != null && <span className="block text-xs text-muted-foreground">{t("su {ore}", { ore: hours(p.plannedHours) })}</span>}</> },
            { titolo: t("Tariffa scheda"), destra: true, cella: (p) => !readRates ? t("Riservata") : p.rate?.amount == null ? t("Da impostare") : `${money(p.rate.amount)} / h` },
            { titolo: t("Media registrata"), destra: true, cella: (p) => p.averageRate == null || p.unpriced ? "—" : `${money(p.averageRate)} / h` },
            { titolo: t("Costo registrato"), destra: true, cella: (p) => <span className="font-medium">{p.unpriced ? t("Da completare") : money(p.cost)}</span> },
            ...(confronto ? [
              { titolo: t("Da cedolino / h"), destra: true, cella: (p: Persona) => { const c = diCedolino(p.id); return c?.orarioMedio != null ? `${formatCurrency(c.orarioMedio)} / h` : "—"; } },
              { titolo: t("Costo da cedolino"), destra: true, cella: (p: Persona) => {
                const c = diCedolino(p.id);
                if (!c || !c.mesi.length) return "—";
                return <button type="button" className="font-medium text-primary underline underline-offset-2" aria-label={t("Mese per mese di {nome}", { nome: p.name })} onClick={() => setDettaglio(p.id)}>{c.oreCoperte > 0 ? formatCurrency(c.costoTotale) : t("Vedi mesi")}</button>;
              } },
            ] : []),
            { titolo: t("Budget"), destra: true, cella: (p) => p.budget == null ? "—" : money(p.budget) },
          ]} />
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          {readRates && <Link className="underline underline-offset-4" to="/azienda/personale?tab=profili">{t("Gestisci tariffe in Personale e HR")}</Link>}
          <Link className="underline underline-offset-4" to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=diario#section-rapportini`}>{t("Verifica rapportini")}</Link>
          <Link className="underline underline-offset-4" to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=squadra#section-statistiche`}>{t("Ore giorno per giorno")}</Link>
          <Link className="underline underline-offset-4" to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=lavorazioni#section-lavorazioni`}>{t("Budget nelle lavorazioni")}</Link>
        </div>
      </div>
    </RiquadroCommessa>
    {dettaglio && aperto && (
      <Dialog open onOpenChange={(o) => { if (!o) setDettaglio(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("{nome}: mese per mese", { nome: internal.people.find((p) => p.id === dettaglio)?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("Costo del mese sul cedolino (lordo più contributi del datore), diviso le ore lavorate del mese, per le ore fatte in questa commessa.")}</DialogDescription>
          </DialogHeader>
          <TabellaCommessa etichetta={t("Costo mese per mese")} righe={aperto.mesi} chiave={(m) => m.mese} colonne={[
            { titolo: t("Mese"), principale: true, cella: (m) => <span className="font-medium">{m.mese.split("-").reverse().join("/")}</span> },
            { titolo: t("Costo del mese"), destra: true, cella: (m) => (m.costoMese != null ? formatCurrency(m.costoMese) : "—") },
            { titolo: t("Ore sul cedolino"), destra: true, cella: (m) => (m.oreMese != null ? hours(m.oreMese) : "—") },
            { titolo: t("Costo orario"), destra: true, cella: (m) => (m.orario != null ? `${formatCurrency(m.orario)} / h` : "—") },
            { titolo: t("Ore in commessa"), destra: true, cella: (m) => <>{hours(m.oreCommessa)}{m.oltreIlCedolino && <span className="block text-xs text-amber-800">{t("più di quelle sul cedolino")}</span>}</> },
            { titolo: t("Costo"), destra: true, cella: (m) => m.coperto ? <span className="font-medium">{formatCurrency(m.costo ?? 0)}</span> : <><span>{formatCurrency(m.costoRegistrato)}</span><span className="block text-xs text-amber-800">{t("{motivo}: costo registrato", { motivo: m.motivo })}</span></> },
            { titolo: t("Registrato"), destra: true, cella: (m) => formatCurrency(m.costoRegistrato) },
          ]} />
        </DialogContent>
      </Dialog>
    )}
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{t("Come si calcolano ore e costi")}</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
        <li><strong>{t("Ore:")}</strong> {t("vengono dai rapportini approvati e dalle rettifiche inserite a mano. I rapportini in attesa non contano finché non vengono approvati.")}</li>
        <li><strong>{t("Costo registrato:")}</strong> {t("all'approvazione, ore × tariffa di quel giorno, e poi non cambia più. La tariffa è quella scritta sulla scheda oppure, se manca, lordo × mensilità + oneri, diviso le ore produttive dell'anno. È una stima, non lo stipendio pagato.")}</li>
        <li><strong>{t("Costo da cedolino:")}</strong> {t("ogni mese ha il suo costo orario, lordo più contributi del datore diviso le ore del cedolino; si moltiplica per le ore fatte qui quel mese. Lo vede solo l'amministratore dell'azienda. TFR, INAIL e Cassa Edile contano solo se sono dentro i contributi del datore del cedolino.")}</li>
        <li><strong>{t("Straordinari, trasferte e viaggi:")}</strong> {t("il costo registrato li valuta alla tariffa base, senza maggiorazioni. Il cedolino invece li comprende già.")}</li>
        <li><strong>{t("Budget:")}</strong> {t("è quello salvato nelle lavorazioni. Un budget mancante non è zero.")}</li>
      </ul>
    </details>
  </div>;
}

/** Fatture e costi → Subappaltatori: il costo previsto e registrato di ogni ditta affidata nelle lavorazioni. */
export function OrderDitteEconomics({ orderId }: { orderId: string }) {
  const t = useT();
  const money = (value: number | null) => value == null ? t("Da verificare") : formatCurrency(value);
  const { teams, allowed } = useOrderLaborEconomics(orderId);
  if (!allowed) return null;
  if (teams.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">{t("Caricamento costi delle ditte…")}</p>;
  if (teams.isError) return <div role="alert" className="rounded-lg border p-4"><p>{t("Impossibile caricare i costi delle ditte. Nessun totale parziale viene mostrato.")}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void teams.refetch()}>{t("Riprova")}</Button></div>;
  const external = teams.data ?? [];
  // Senza ditte affidate nelle lavorazioni non c'è niente da dire: un riquadro a zero è solo rumore.
  if (!external.length) return null;
  const subcontractNet = sumLaborAmounts(external.map(externalLaborNet));
  return (
    <details className="rounded-lg border bg-white p-3 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-medium"><Building2 className="h-4 w-4" aria-hidden="true" />{t("Ditte esterne e subappalti: costo per lavorazione")}
        <span className="font-normal text-muted-foreground">{t(external.length === 1 ? "· {n} lavorazione, {importo} netto IVA" : "· {n} lavorazioni, {importo} netto IVA", { n: external.length, importo: money(subcontractNet) })}</span>
      </summary>
      <div className="mt-3 space-y-3">
        <TabellaCommessa etichetta={t("Costi delle ditte")} righe={[...external].sort((a, b) => (a.fase?.position ?? 1e9) - (b.fase?.position ?? 1e9))} chiave={(row) => row.id} colonne={[
          { titolo: t("Ditta"), principale: true, cella: (row) => <>
            <span className="font-medium">{row.team?.name ?? t("Ditta non disponibile")}</span>
            {row.team?.kind === "interna" && <p role="alert" className="text-xs text-amber-800">{t("Squadra interna registrata fra le ditte: verifica l'attribuzione, senza duplicarne i costi.")}</p>}
          </> },
          { titolo: t("Fase"), cella: (row) => row.fase?.name ?? t("intera commessa") },
          /* Le ditte sono in reverse charge (31/10/2026): il previsto è senza IVA. «IVA inclusa» era rimasto da prima. */
          { titolo: t("Costo previsto"), destra: true, cella: (row) => Number(laborAmount(row.cost_preventivo)) > 0 ? money(laborAmount(row.cost_preventivo)) : t("Da scrivere nella lavorazione") },
          { titolo: t("Costo registrato"), destra: true, cella: (row) => <>{money(laborAmount(row.total_cost))}{Number(row.vat_rate) > 0 && <span className="block text-xs text-muted-foreground">{t("IVA {percentuale}% inclusa", { percentuale: Number(row.vat_rate) })}</span>}</> },
          { titolo: t("Costo netto IVA"), destra: true, cella: (row) => <span className="font-medium">{money(externalLaborNet(row))}</span> },
        ]} />
        <p className="text-xs text-muted-foreground">{t("Le presenze del subappaltatore non applicano il costo orario dei dipendenti. Il costo deriva dall'affidamento registrato; non equivale a una fattura pagata.")}</p>
      </div>
    </details>
  );
}
