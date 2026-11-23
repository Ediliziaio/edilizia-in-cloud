/**
 * «Tutta l'operazione» nella scheda Cantiere della commessa generale (lotto B, 14/11/2026).
 *
 * Elenchi unici di rapportini, ordini, DDT e costi registrati sulla generale e sulle sue
 * figlie, con la colonna «Commessa». Sola lettura: il codice della commessa porta sulla
 * commessa, dove si registra e si modifica come sempre.
 */
import { ArrowUpRight, BookOpen, Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock, ListTree, PackageCheck, ReceiptText, Truck } from "lucide-react";
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { UniformSelect } from "@/components/ui/uniform-select";
import { formatCurrency } from "@/lib/formatters";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMovimentiOperazione, type VistaOperazione } from "@/hooks/useMovimentiOperazione";
import { useEdificiPriorita } from "@/hooks/useDettagliPrioritaOperazione";
import { useConsegneFasiOperazione } from "@/hooks/useMaterialiOperazione";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
import type { DDTStato } from "@/hooks/useDDTRicezione";
import { dataBreve } from "../piano/formato";
import { CronoprogrammaOperazione } from "./CronoprogrammaOperazione";
import { DaSeguireOperazione } from "./DaSeguireOperazione";
import { cn } from "@/lib/utils";
import { faseCompletata } from "@/lib/orders/schedaCommessa";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { consegneFasi } from "@/lib/orders/generali/consegneFasi";
import {
  categoriaPriorita, paginaRegistro, periodoRegistro, REGISTRI_OPERAZIONE, RIGHE_REGISTRO,
  type CategoriaPriorita, type PagineRegistro, type PeriodoRegistro, type RegistroOperazione,
} from "@/lib/orders/generali/registroOperazione";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const DettaglioFaseOperazione = lazy(() => import("./DettaglioFaseOperazione"));

const ora = (t: string | null) => (t ? new Date(t).toLocaleString(intlCampo(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** 31/12/9999 è la convenzione per «pagamento non noto»: non è una data da mostrare. */
const ignoto = (d: string | null) => !!d && d.startsWith("9999");
const dataVera = (d: string | null) => (d && !ignoto(d) ? d : null);

const parola = (s: string | null) => (s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ") : "—");
const nomePersona = (a: { first_name: string | null; last_name: string | null } | null) =>
  a ? [a.first_name, a.last_name].filter(Boolean).join(" ") || "—" : "—";
const ESECUZIONE_FASE: Record<string, string> = {
  interna: "Interna",
  subappalto_fornitura_posa: "Ditta · fornitura e posa",
  subappalto_posa: "Ditta · solo posa",
  mista: "Mista",
};

export function MovimentiOperazione({
  riepilogo,
  vista,
  onApri,
  commessaId,
  onApriRapportino,
  onApriMateriali,
  azioni,
}: {
  riepilogo: RiepilogoGenerale;
  vista: VistaOperazione;
  /** Porta la scheda su quella commessa (generale o figlia). */
  onApri: (orderId: string, faseId?: string) => void;
  commessaId?: string;
  onApriRapportino: (orderId: string, rapportinoId: string) => void;
  onApriMateriali?: (orderId: string, faseId: string, articolo?: string) => void;
  azioni?: React.ReactNode;
}) {
  const t = useT();
  const g = riepilogo.generale;
  const [parametri, setParametri] = useSearchParams();
  const [faseEspansa, setFaseEspansa] = useState<string | null>(null);
  const registroDaRaggiungere = useRef<RegistroOperazione | null>(null);
  const registri = REGISTRI_OPERAZIONE[vista as keyof typeof REGISTRI_OPERAZIONE];
  const daSeguire = vista === "da-seguire";
  const lavorazioni = vista === "lavorazioni";
  const categoria = daSeguire ? categoriaPriorita(parametri.get("priorita"), riepilogo.permessi.costi && riepilogo.permessi.importi) : "tutte";
  const conEdifici = (lavorazioni || (daSeguire && categoria !== "cassa")) && !commessaId && g.modello !== "appalto";
  const chiaveEdificio = lavorazioni ? "lavorazioni-edificio" : "priorita-edificio";
  const telefono = useIsMobile();
  const edificiQuery = useEdificiPriorita(g.modello !== "appalto" &&
    (daSeguire || registri || (telefono && vista === "cronoprogramma")) ? g.id : undefined);
  const edifici = new Map<string, string[]>();
  const edificioPerCommessa = new Map<string, string>();
  for (const unita of edificiQuery.data ?? []) {
    if (!unita.edificio) continue;
    edificioPerCommessa.set(unita.order_id, unita.edificio);
    const gruppo = edifici.get(unita.edificio) ?? [];
    gruppo.push(unita.order_id);
    edifici.set(unita.edificio, gruppo);
  }
  const nomiEdifici = conEdifici ? [...edifici.keys()].sort((a, b) => a.localeCompare(b, "it", { numeric: true })) : [];
  const richiestoEdificio = conEdifici ? parametri.get(chiaveEdificio) : null;
  const edificio = richiestoEdificio && edifici.has(richiestoEdificio)
    ? { nome: richiestoEdificio, idCommesse: edifici.get(richiestoEdificio)! } : undefined;
  const attendeEdificio = !!richiestoEdificio && !edificiQuery.data;
  const paginaPriorita = categoria === "tutte" ? 1 : paginaRegistro(parametri.get("priorita-pagina"));
  const periodo = registri || daSeguire ? periodoRegistro(parametri) : { dal: "", al: "" };
  const pagine: PagineRegistro = {};
  for (const id of registri ?? []) pagine[id] = paginaRegistro(parametri.get(`mov-pagina-${id}`));
  if (categoria === "fasi" || categoria === "ordini" || categoria === "ddt" || categoria === "rapportini") pagine[categoria] = paginaPriorita;
  const { data, isLoading, isError, refetch } = useMovimentiOperazione(riepilogo, vista, commessaId, periodo, pagine, categoria,
    attendeEdificio ? { nome: richiestoEdificio!, idCommesse: [] } : edificio);
  const serveFabbisogno = !!onApriMateriali && (vista === "cronoprogramma" || (daSeguire && (categoria === "tutte" || categoria === "materiali")));
  const forniture = useConsegneFasiOperazione(g.id, commessaId, edificio?.nome, serveFabbisogno && !attendeEdificio);
  const oggi = giornoLocale(new Date().toISOString());
  const fasiConsegne = useMemo(() => data && forniture.data
    ? consegneFasi(forniture.data.materiali, forniture.data.coperture, data.fasi, oggi) : undefined, [data, forniture.data, oggi]);
  const avvisoMateriali = serveFabbisogno && forniture.isError
    ? <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">{t("Disponibilità dei materiali non verificabile.")}{" "}
      <Button size="sm" variant="link" className="h-auto px-1" onClick={() => void forniture.refetch()}>{t("Riprova")}</Button></p>
    : serveFabbisogno && forniture.isPending
      ? <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">{t("Controllo consegne e materiali…")}</p> : null;
  useEffect(() => {
    const id = registroDaRaggiungere.current;
    if (!data || isLoading || isError || !id) return;
    const registro = document.getElementById(`registro-operazione-${id}`);
    registroDaRaggiungere.current = null;
    registro?.focus({ preventScroll: true });
    registro?.scrollIntoView?.({ block: "start" });
  }, [data, isLoading, isError, parametri]);
  const cambiaPeriodo = (scelta: PeriodoRegistro) => {
    const p = new URLSearchParams(parametri);
    for (const key of ["dal", "al"] as const) {
      if (scelta[key]) p.set(`mov-${key}`, scelta[key]);
      else p.delete(`mov-${key}`);
    }
    for (const key of [...p.keys()]) if (key.startsWith("mov-pagina-")) p.delete(key);
    p.delete("priorita-pagina");
    setParametri(p, { replace: true });
  };
  const cambiaPagina = (registro: RegistroOperazione, pagina: number) => {
    registroDaRaggiungere.current = registro;
    const p = new URLSearchParams(parametri);
    if (pagina > 1) p.set(`mov-pagina-${registro}`, String(pagina));
    else p.delete(`mov-pagina-${registro}`);
    setParametri(p);
  };
  const impagina = (id: RegistroOperazione) => ({
    id,
    pagina: pagine[id] ?? 1,
    altre: data?.pagine?.[id]?.altre ?? false,
  });
  const cambiaCategoria = (tipo: CategoriaPriorita) => {
    const p = new URLSearchParams(parametri);
    if (tipo === "tutte") p.delete("priorita");
    else p.set("priorita", tipo);
    p.delete("priorita-pagina");
    setParametri(p, { replace: true });
  };
  const cambiaEdificio = (nome: string) => {
    const p = new URLSearchParams(parametri);
    if (nome) p.set(chiaveEdificio, nome);
    else p.delete(chiaveEdificio);
    p.delete(lavorazioni ? "mov-pagina-fasi" : "priorita-pagina");
    setFaseEspansa(null);
    setParametri(p, { replace: true });
  };
  const cambiaPaginaPriorita = (numero: number) => {
    const p = new URLSearchParams(parametri);
    if (numero > 1) p.set("priorita-pagina", String(numero));
    else p.delete("priorita-pagina");
    document.getElementById("cantiere-priorita")?.scrollIntoView?.({ block: "start" });
    setParametri(p);
  };
  const periodoControlli = (registri || daSeguire) && <PeriodoMovimenti key={`${periodo.dal}:${periodo.al}`} periodo={periodo}
    titolo={vista === "lavorazioni" ? t("Periodo previsto") : t("Periodo")} applica={cambiaPeriodo} />;
  const strumenti = <>
    {lavorazioni && nomiEdifici.length > 0 && <UniformSelect aria-label={t("Edificio delle lavorazioni")} className="h-8"
      value={edificio?.nome ?? ""} onChange={e => cambiaEdificio(e.target.value)}>
      <option value="">{t("Tutti gli edifici")}</option>
      {nomiEdifici.map(nome => <option value={nome} key={nome}>{nome}</option>)}
    </UniformSelect>}
    {periodoControlli}{azioni}
  </>;
  const pagina = (contenuto: React.ReactNode) => (
    <section aria-label={t("Movimenti dell’operazione")} className="space-y-2">{contenuto}</section>
  );
  const commesse = new Map<string, { codice: string | null; nome: string | null; generale: boolean }>([
    [g.id, { codice: g.codice, nome: g.nome, generale: true }],
    ...riepilogo.figlie.map((f) => [f.id, { codice: f.codice, nome: f.nome, generale: false }] as const),
  ]);
  const Commessa = ({ id }: { id: string }) => {
  const t = useT();
    const c = commesse.get(id);
    return (
      <button type="button" onClick={() => onApri(id)} className="flex max-w-56 items-center gap-1.5 whitespace-nowrap text-left hover:underline"
        title={[c?.codice, c?.nome].filter(Boolean).join(" · ") || t("Apri il cantiere di questa commessa")}>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
          {c?.codice ?? "—"}
          {c?.generale && <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-800">{t("Generale")}</span>}
        </span>
        {!c?.generale && c?.nome && c.nome !== c.codice && <>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className="truncate text-xs text-muted-foreground">{c.nome}</span>
        </>}
      </button>
    );
  };

  if (daSeguire) return pagina(<DaSeguireOperazione dati={data} riepilogo={riepilogo} commesse={commesse}
    periodoControlli={periodoControlli} edificioPerCommessa={edificioPerCommessa}
    categoria={categoria} periodo={periodo} pagina={paginaPriorita} scegliCategoria={cambiaCategoria} scegliPagina={cambiaPaginaPriorita}
    edifici={nomiEdifici}
    edificio={edificio?.nome ?? ""} scegliEdificio={cambiaEdificio}
    inCaricamento={isLoading || (attendeEdificio && edificiQuery.isLoading)} errore={isError || (attendeEdificio && edificiQuery.isError)}
    riprova={() => { if (attendeEdificio) void edificiQuery.refetch(); else void refetch(); }}
    apriFase={onApri} apriRapportino={onApriRapportino} consegneFasi={fasiConsegne} apriMateriali={onApriMateriali} avvisoMateriali={avvisoMateriali} />);
  if (isLoading || (attendeEdificio && edificiQuery.isLoading)) return pagina(<><div className="generale-registro-strumenti">{strumenti}</div><Skeleton className="h-64 w-full" /></>);
  if (isError || !data)
    return pagina(
      <><div className="generale-registro-strumenti">{strumenti}</div><div role="status" className="rounded-lg border p-6 text-sm">
        {t("Movimenti dell'operazione non disponibili.")}{" "}
        <button type="button" className="font-medium underline" onClick={() => void (attendeEdificio ? edificiQuery.refetch() : refetch())}>
          {t("Riprova")}
        </button>
      </div></>
    );

  if (vista === "cronoprogramma") return <CronoprogrammaOperazione riepilogo={riepilogo} fasi={data.fasi}
    rapportini={data.rapportiniCronoprogramma} onApri={onApri} onApriRapportino={onApriRapportino}
    edificioPerCommessa={edificioPerCommessa} edificiCaricamento={telefono && edificiQuery.isLoading}
    riprovaEdifici={telefono && edificiQuery.isError ? () => void edificiQuery.refetch() : undefined}
    consegne={fasiConsegne} onApriMateriali={onApriMateriali} avvisoMateriali={avvisoMateriali} />;

  const fornitore = (id: string | null) => (id ? data.fornitori[id] || "—" : "—");
  const quante = (n: number, una: string, tante: string) => t(n === 1 ? una : tante, { n: n.toLocaleString(intlCampo()) });
  const colonnaEdificio = edificioPerCommessa.size > 0 && <Th className="w-28">{t("Edificio")}</Th>;
  const cellaEdificio = (id: string) => edificioPerCommessa.size > 0 && <Td>{edificioPerCommessa.get(id) ?? "—"}</Td>;
  const v = vista;

  return pagina(
    <>
      {v === "rapportini" && (
        <Riquadro
          icona={ClipboardList}
          titolo={t("Rapportini")}
          strumenti={strumenti}
          sintesi={`${quante(data.rapportini.length, "{n} rapportino", "{n} rapportini")} · ${t("{n} ore", { n: data.rapportini.reduce((s, x) => s + (x.ore_lavorate ?? 0), 0).toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) })}`}
          vuoto={t("Nessun rapportino sull'operazione.")}
          righe={data.rapportini.length}
          paginazione={impagina("rapportini")} onCambiaPagina={cambiaPagina}
        >
          <thead>
            <tr>
              <Th className="w-24">{t("Data")}</Th><Th className="w-36">{t("Commessa")}</Th>{colonnaEdificio}
              <Th>{t("Chi")}</Th><Th>{t("Lavori")}</Th><Th className="text-right">{t("Ore")}</Th><Th className="text-right">{t("Straordinari")}</Th>
              <Th className="text-right">{t("Foto")}</Th><Th>{t("Stato")}</Th><Th>{t("Approvato il")}</Th>
            </tr>
          </thead>
          <tbody>
            {data.rapportini.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataBreve(x.data_lavoro)}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                {cellaEdificio(x.order_id)}
                <Td>{nomePersona(x.autore)}</Td>
                <Td className="min-w-40 max-w-[22rem]">
                  <button type="button" className="block max-w-full truncate text-left font-medium text-primary hover:underline"
                    title={x.descrizione_lavori ?? undefined} onClick={() => onApriRapportino(x.order_id, x.id)}>
                    {x.descrizione_lavori || t("Apri rapportino")}
                  </button>
                </Td>
                <Td className="text-right tabular-nums">{(x.ore_lavorate ?? 0).toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}</Td>
                <Td className="text-right tabular-nums">{x.ore_straordinario?.toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) ?? "—"}</Td>
                <Td className="text-right tabular-nums">{x.foto_urls?.length ?? 0}</Td>
                <Td><StatoRegistro tono={x.approvato ? "verde" : x.stato === "inviato" ? "arancio" : undefined}>{x.approvato ? t("Approvato") : parola(x.stato)}</StatoRegistro></Td>
                <Td>{dataBreve(x.approvato_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}

      {v === "rapportini" && (
        <Riquadro
          icona={BookOpen}
          titolo={t("Giornale dei lavori")}
          sintesi={quante(data.giornale.length, "{n} giornata", "{n} giornate")}
          vuoto={t("Nessuna giornata nel giornale dei lavori.")}
          righe={data.giornale.length}
          paginazione={impagina("giornale")} onCambiaPagina={cambiaPagina}
        >
          <thead>
            <tr><Th>{t("Data")}</Th><Th>{t("Commessa")}</Th><Th>{t("Lavorazioni")}</Th><Th className="text-right">{t("Persone")}</Th><Th>{t("Stato")}</Th></tr>
          </thead>
          <tbody>
            {data.giornale.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataBreve(x.data_lavori)}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                <Td className="max-w-[26rem] truncate" title={x.lavorazioni_eseguite ?? undefined}>{x.lavorazioni_eseguite || "—"}</Td>
                <Td className="text-right tabular-nums">{x.personale_presente ?? "—"}</Td>
                <Td>{parola(x.stato)}</Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}

      {v === "squadre" && (
        <>
          <Riquadro
            icona={Clock}
            titolo={t("Timbrature")}
            strumenti={strumenti}
            sintesi={quante(data.timbrature.length, "{n} timbratura", "{n} timbrature")}
            vuoto={t("Nessuna timbratura sull'operazione.")}
            righe={data.timbrature.length}
            paginazione={impagina("timbrature")} onCambiaPagina={cambiaPagina}
          >
            <thead>
              <tr><Th>{t("Quando")}</Th><Th>{t("Commessa")}</Th><Th>{t("Chi")}</Th><Th>{t("Tipo")}</Th></tr>
            </thead>
            <tbody>
              {data.timbrature.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{ora(x.timestamp_evento)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td>{nomePersona(x.persona)}</Td>
                  <Td>{parola(x.tipo)}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
          <Riquadro
            icona={Truck}
            titolo={t("Mezzi in cantiere")}
            sintesi={quante(data.mezzi.filter((x) => x.usato !== false).length, "{n} giornata di lavoro", "{n} giornate di lavoro")}
            vuoto={t("Nessuna giornata dei mezzi sull'operazione.")}
            righe={data.mezzi.length}
            paginazione={impagina("mezzi")} onCambiaPagina={cambiaPagina}
          >
            <thead>
              <tr><Th>{t("Giorno")}</Th><Th>{t("Commessa")}</Th><Th>{t("Mezzo")}</Th><Th>{t("Usato")}</Th><Th className="text-right">{t("Contatore")}</Th></tr>
            </thead>
            <tbody>
              {data.mezzi.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.giorno)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td>{[x.mezzo?.nome, x.mezzo?.targa].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td>{x.usato === false ? t("Fermo") : t("Sì")}</Td>
                  <Td className="text-right tabular-nums">{x.contatore ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
          {riepilogo.permessi.costi && <Riquadro
            icona={Building2} titolo={t("Ditte e subappalti")}
            sintesi={quante(data.subappalti.length, "{n} contratto", "{n} contratti")}
            vuoto={t("Nessun subappalto registrato.")} righe={data.subappalti.length} paginazione={impagina("subappalti")} onCambiaPagina={cambiaPagina}>
            <thead><tr><Th>{t("Commessa")}</Th><Th>{t("Ditta")}</Th><Th>{t("Contratto")}</Th><Th>{t("Lavori")}</Th><Th>{t("Stato")}</Th></tr></thead>
            <tbody>
              {data.subappalti.map(x => <tr key={x.id} className="border-t">
                <Td><Commessa id={x.order_id} /></Td>
                <Td>{x.subappaltatori_sicurezza?.ragione_sociale ?? "—"}</Td>
                <Td>{x.numero_contratto ?? "—"}</Td>
                <Td className="max-w-xs truncate" title={x.descrizione_lavori ?? undefined}>{x.descrizione_lavori ?? "—"}</Td>
                <Td>{parola(x.stato)}</Td>
              </tr>)}
            </tbody>
          </Riquadro>}
        </>
      )}

      {v === "lavorazioni" && <Riquadro
        icona={ListTree} titolo={t("Fasi e avanzamento")}
        strumenti={strumenti}
        sintesi={t("{fatte}/{totale} completate", { fatte: data.fasi.filter(faseCompletata).length, totale: data.fasi.length })}
        vuoto={t("Nessuna fase nel periodo selezionato. Apri il computo generale o un’unità per aggiungere lavorazioni.")}
        righe={data.fasi.length} paginazione={impagina("fasi")} onCambiaPagina={cambiaPagina}>
        <thead><tr>
          <Th>{t("Fase")}</Th><Th>{t("Commessa")}</Th>{colonnaEdificio}<Th>{t("Esecuzione")}</Th>
          <Th>{t("Stato")}</Th><Th>{t("Avanzamento")}</Th><Th>{t("Dal")}</Th><Th>{t("Al")}</Th><Th>{t("Completata il")}</Th><Th><span className="sr-only">{t("Apri fase")}</span></Th>
        </tr></thead>
        <tbody>
          {data.fasi.map(fase => {
            const completata = faseCompletata(fase);
            const progresso = completata ? 100 : Math.max(0, Math.min(100, Number(fase.percentuale) || 0));
            const aperta = faseEspansa === fase.id;
            const dettaglio = `fase-operazione-${fase.id}`;
            return <Fragment key={fase.id}>
              <tr className={aperta ? "bg-muted/40" : undefined}>
                <Td><button type="button" className="flex max-w-52 items-center gap-1.5 rounded text-left font-medium hover:text-primary"
                  title={fase.name} aria-expanded={aperta} aria-controls={aperta ? dettaglio : undefined}
                  onClick={() => setFaseEspansa(aperta ? null : fase.id)}>
                  <ChevronRight className={cn("size-3.5 shrink-0 text-primary", aperta && "rotate-90")} aria-hidden="true" />
                  <span className="min-w-0 truncate">{fase.name}</span>
                </button></Td>
                <Td><Commessa id={fase.order_id} /></Td>
                {cellaEdificio(fase.order_id)}
                <Td>{fase.esecuzione && ESECUZIONE_FASE[fase.esecuzione] ? t(ESECUZIONE_FASE[fase.esecuzione]) : "—"}</Td>
                <Td><StatoRegistro tono={completata ? "verde" : fase.status === "in_corso" ? "blu" : undefined}>{completata ? t("Completata") : parola(fase.status)}</StatoRegistro></Td>
                <Td><div className="flex items-center gap-2">
                  <Progress className="h-1.5 w-16 bg-muted" aria-label={t("Avanzamento {name}", { name: String(fase.name ?? "") })} value={progresso}
                    indicatorClassName={cn("motion-reduce:transition-none", completata && "bg-emerald-600")} />
                  <span className="tabular-nums">{progresso}%</span>
                </div></Td>
                <Td className="whitespace-nowrap">{dataBreve(fase.start_date)}</Td>
                <Td className="whitespace-nowrap">{dataBreve(fase.end_date)}</Td>
                <Td>{dataBreve(fase.completata_il)}</Td>
                <Td><button type="button" className="inline-flex size-6 items-center justify-center rounded text-primary hover:bg-muted"
                  title={t("Apri scheda della fase")} aria-label={t("Apri {fase} · {commessa}", { fase: fase.name, commessa: commesse.get(fase.order_id)?.codice || t("Commessa") })}
                  onClick={() => onApri(fase.order_id, fase.id)}>
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </button></Td>
              </tr>
              {aperta && <tr id={dettaglio} className="bg-muted/25">
                <td colSpan={edificioPerCommessa.size > 0 ? 10 : 9}>
                  <Suspense fallback={<Skeleton className="h-20 w-full" />}>
                    <DettaglioFaseOperazione fase={fase} vedeCosti={riepilogo.permessi.costi} vedeImporti={riepilogo.permessi.importi}
                      apri={() => onApri(fase.order_id, fase.id)} />
                  </Suspense>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </Riquadro>}

      {v === "acquisti" && (
          <Riquadro
            icona={PackageCheck}
            titolo={t("Ordini ai fornitori")}
            strumenti={strumenti}
            sintesi={`${quante(data.ordini.length, "{n} ordine", "{n} ordini")}`}
            vuoto={t("Nessun ordine sull'operazione.")}
            righe={data.ordini.length}
            paginazione={impagina("ordini")} onCambiaPagina={cambiaPagina}
          >
            <thead>
              <tr>
                <Th className="w-24">{t("Data")}</Th><Th className="w-36">{t("Commessa")}</Th>{colonnaEdificio}
                <Th>{t("Numero")}</Th><Th>{t("Fornitore")}</Th><Th>{t("Rif. fornitore")}</Th><Th>{t("Consegna prevista")}</Th><Th>{t("Arrivo effettivo")}</Th>
                {riepilogo.permessi.importi && <Th className="text-right">{t("Totale")}</Th>}<Th>{t("Stato")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.ordini.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.issue_date)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  {cellaEdificio(x.order_id)}
                  <Td className="font-mono text-xs"><Link className="text-primary hover:underline"
                    to={`/azienda/ordini-acquisto/${x.id}`}>{x.oda_number ?? t("Apri ordine")}</Link></Td>
                  <Td>{fornitore(x.supplier_id)}</Td>
                  <Td><TestoRegistro valore={x.supplier_reference} /></Td>
                  <Td className="whitespace-nowrap">{dataBreve(x.expected_delivery_date)}</Td>
                  <Td>{dataBreve(x.actual_delivery_date)}</Td>
                  {riepilogo.permessi.importi && <Td className="text-right tabular-nums">{x.total != null ? formatCurrency(x.total) : "—"}</Td>}
                  <Td><StatoRegistro tono={x.status === "ricevuto" ? "verde" : x.status === "parziale" ? "arancio" : "blu"}>{parola(x.status)}</StatoRegistro></Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
      )}
      {v === "ddt" && (
          <Riquadro icona={PackageCheck} titolo={t("DDT ricevuti")} strumenti={strumenti} sintesi={quante(data.ddt.length, "{n} DDT", "{n} DDT")} vuoto={t("Nessun DDT sull'operazione.")} righe={data.ddt.length} paginazione={impagina("ddt")} onCambiaPagina={cambiaPagina}>
            <thead>
              <tr>
                <Th className="w-24">{t("Arrivato il")}</Th><Th className="w-36">{t("Commessa")}</Th>{colonnaEdificio}
                <Th>{t("Numero")}</Th><Th>{t("Fornitore")}</Th><Th>{t("Ordine")}</Th>
                <Th>{t("Destinazione")}</Th><Th>{t("Corriere")}</Th><Th>{t("Ricevuto da")}</Th><Th>{t("Stato")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.ddt.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.data_ricezione)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  {cellaEdificio(x.order_id)}
                  <Td className="font-mono text-xs"><Link className="text-primary hover:underline"
                    to={`/azienda/ddt/${x.id}`}>{x.numero_ddt ?? t("Apri DDT")}</Link></Td>
                  <Td>{fornitore(x.supplier_id)}</Td>
                  <Td>{x.purchase_order_id ? <Link className="text-primary hover:underline"
                    to={`/azienda/ordini-acquisto/${x.purchase_order_id}`}>{x.purchase_orders?.oda_number ?? t("Apri OdA")}</Link> : t("Senza ordine")}</Td>
                  <Td>{parola(x.destinazione ?? null)}</Td>
                  <Td><TestoRegistro valore={x.corriere} /></Td>
                  <Td><TestoRegistro valore={x.ricevuto_da_nome} /></Td>
                  <Td>{x.stato && x.stato in DDT_STATO_META
                    ? <DDTStatusBadge stato={x.stato as DDTStato} size="sm" /> : parola(x.stato)}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
      )}

      {v === "fatture" && data.costi && (
        <Riquadro
          icona={ReceiptText}
          titolo={t("Costi e fatture dei fornitori")}
          strumenti={strumenti}
          sintesi={`${quante(data.costi.length, "{n} costo registrato", "{n} costi registrati")}`}
          vuoto={t("Nessun costo sull'operazione.")}
          righe={data.costi.length}
          paginazione={impagina("costi")} onCambiaPagina={cambiaPagina}
        >
          <thead>
            <tr><Th>{t("Data")}</Th><Th>{t("Commessa")}</Th><Th>{t("Fornitore")}</Th><Th>{t("Descrizione")}</Th><Th className="text-right">{t("Importo")}</Th><Th>{t("Pagamento")}</Th></tr>
          </thead>
          <tbody>
            {data.costi.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataVera(x.documento_data) ? dataBreve(x.documento_data) : "—"}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                <Td>{fornitore(x.supplier_id)}</Td>
                <Td className="max-w-[20rem] truncate" title={x.name ?? undefined}>{x.name || "—"}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{x.amount != null ? formatCurrency(x.amount) : "—"}</Td>
                <Td className={cn("whitespace-nowrap", !x.is_paid && "text-amber-700")}>
                  {x.is_paid
                    ? (dataVera(x.paid_date) ? t("Pagato il {data}", { data: dataBreve(x.paid_date) }) : t("Pagato"))
                    : ignoto(x.due_date)
                      ? t("Da confermare")
                      : x.due_date
                        ? t("Scade il {data}", { data: dataBreve(x.due_date) })
                        : t("Da pagare")}
                </Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}
    </>
  );
}

function PeriodoMovimenti({ periodo, titolo, applica }: { periodo: PeriodoRegistro; titolo: string; applica: (p: PeriodoRegistro) => void }) {
  const t = useT();
  const telefono = useIsMobile();
  const filtri = (
    <form aria-label={t("Periodo dei movimenti")} className="generale-registro-periodo"
      onSubmit={event => {
        event.preventDefault();
        const dati = new FormData(event.currentTarget);
        const dal = String(dati.get("dal") ?? "");
        const al = String(dati.get("al") ?? "");
        if (dal && al && dal > al) {
          const fine = event.currentTarget.elements.namedItem("al") as HTMLInputElement;
          fine.setCustomValidity(t("La data finale deve essere uguale o successiva a quella iniziale."));
          fine.reportValidity();
          return;
        }
        applica(periodoRegistro(new URLSearchParams({ "mov-dal": dal, "mov-al": al })));
      }}>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
        <CalendarDays className="size-3.5 text-primary" aria-hidden="true" /> <span>{titolo}</span>
      </span>
      <label>
        {t("Dal")} <Input type="date" name="dal" aria-label={t("Movimenti dal")} defaultValue={periodo.dal}
          onChange={e => (e.currentTarget.form?.elements.namedItem("al") as HTMLInputElement | null)?.setCustomValidity("")} />
      </label>
      <label>
        {t("Al")} <Input type="date" name="al" aria-label={t("Movimenti al")} defaultValue={periodo.al}
          onChange={e => e.currentTarget.setCustomValidity("")} />
      </label>
      <Button size="sm" type="submit" variant="outline" className="h-8">{t("Applica")}</Button>
      {(periodo.dal || periodo.al) && <Button size="sm" type="button" variant="ghost" className="h-8"
        onClick={() => applica({ dal: "", al: "" })}>{t("Tutto il periodo")}</Button>}
    </form>
  );
  if (!telefono) return filtri;
  return <details className="generale-periodo-mobile">
    <summary>
      <CalendarDays className="size-4 text-primary" aria-hidden="true" />
      <span>{titolo}</span>
      {(periodo.dal || periodo.al) && <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {periodo.dal && periodo.al ? `${dataBreve(periodo.dal)} – ${dataBreve(periodo.al)}`
          : periodo.dal ? t("Dal {data}", { data: String(dataBreve(periodo.dal) ?? "") }) : t("Fino al {valore}", { valore: String(dataBreve(periodo.al!) ?? "") })}
      </span>}
    </summary>
    {filtri}
  </details>;
}

function Riquadro({
  icona: Icona,
  titolo,
  sintesi,
  strumenti,
  vuoto,
  righe,
  paginazione,
  onCambiaPagina,
  children,
}: {
  icona: typeof ClipboardList;
  titolo: string;
  sintesi: string;
  strumenti?: React.ReactNode;
  vuoto: string;
  righe: number;
  paginazione: { id: RegistroOperazione; pagina: number; altre: boolean };
  onCambiaPagina: (id: RegistroOperazione, pagina: number) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div id={`registro-operazione-${paginazione.id}`} tabIndex={-1} aria-label={titolo} className="scroll-mt-4 overflow-hidden rounded-xl border bg-card">
      <header className="generale-registro-header">
        <div className="generale-registro-intestazione">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icona className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {titolo}
          </h3>
          <span className="text-xs text-muted-foreground">{sintesi}{paginazione.altre || paginazione.pagina > 1 ? ` ${t("in questa pagina")}` : ""}</span>
        </div>
        {strumenti && <div className="generale-registro-strumenti">{strumenti}</div>}
      </header>
      {righe === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{vuoto}</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={titolo} className="generale-registro-tabella">{children}</table>
        </div>
      )}
      {(paginazione.pagina > 1 || paginazione.altre) && (
        <nav aria-label={t("Pagine di {titolo}", { titolo: String(titolo ?? "") })} className="generale-registro-pagine flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1">
          <span className="text-xs tabular-nums text-muted-foreground">
            {righe > 0 ? t("Pagina {pagina} · Righe {da}–{a}", { pagina: paginazione.pagina, da: (paginazione.pagina - 1) * RIGHE_REGISTRO + 1, a: (paginazione.pagina - 1) * RIGHE_REGISTRO + righe }) : t("Pagina {pagina}", { pagina: paginazione.pagina })}
          </span>
          <div className="flex gap-1">
            {righe === 0 && paginazione.pagina > 1 && <Button type="button" variant="ghost" size="sm" className="h-8"
              onClick={() => onCambiaPagina(paginazione.id, 1)}>{t("Prima pagina")}</Button>}
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={paginazione.pagina <= 1}
              onClick={() => onCambiaPagina(paginazione.id, paginazione.pagina - 1)}><ChevronLeft className="size-4" aria-hidden="true" /> {t("Indietro")}</Button>
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={!paginazione.altre}
              onClick={() => onCambiaPagina(paginazione.id, paginazione.pagina + 1)}>{t("Avanti")} <ChevronRight className="size-4" aria-hidden="true" /></Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function StatoRegistro({ children, tono }: { children: React.ReactNode; tono?: "blu" | "verde" | "arancio" }) {
  return <span className="generale-registro-stato" data-tono={tono}>{children}</span>;
}

function TestoRegistro({ valore }: { valore?: string | null }) {
  return <span className="block max-w-32 truncate" title={valore || undefined}>{valore || "—"}</span>;
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn("text-left", className)}>{children}</th>
);
const Td = ({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) => (
  <td className={className} title={title}>
    {children}
  </td>
);
