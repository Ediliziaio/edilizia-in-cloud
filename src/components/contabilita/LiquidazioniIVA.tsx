import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useImpostazioniIVA } from "@/hooks/useImpostazioniIVA";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { leggiImporto } from "@/lib/finance/reconciliationAnalysis";
import { stessiRighiLipe, type RighiLipe } from "@/lib/contabilita/lipeXml";
import { ComunicazioniLipe } from "./ComunicazioniLipe";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CalcoloLiquidazioneIVA {
  calcolabile: boolean;
  motivo?: string;
  etichetta?: string;
  dal?: string;
  al?: string;
  mese?: number | null;
  trimestre?: number | null;
  trimestre_solare?: number;
  credito_anno_disponibile?: number;
  debito_riportabile?: number;
  credito_riportabile?: number;
  richiede_registro?: boolean;
  versamento?: {
    stato: "da_versare" | "riporto" | "annuale" | "nessuno" | "sconosciuto";
    scadenza?: string;
    codice?: string;
  };
  manuali?: Record<string, number | boolean>;
  avvisi?: string[];
  righi?: RighiLipe;
}
export interface LiquidazioneIVAConfermata {
  id: string;
  dal: string;
  al: string;
  stato: "reviewed_commercialista" | "submitted" | "accepted_ade" | "rejected_ade";
  protocollo: string | null;
  dati: CalcoloLiquidazioneIVA;
}

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const RIGHI: Array<{ k: keyof RighiLipe; rigo: string; nome: string }> = [
  { k: "vp2", rigo: "VP2", nome: "Operazioni attive (imponibile)" },
  { k: "vp3", rigo: "VP3", nome: "Operazioni passive (imponibile)" },
  { k: "vp4", rigo: "VP4", nome: "IVA esigibile" },
  { k: "vp5", rigo: "VP5", nome: "IVA detratta" },
  { k: "vp6_debito", rigo: "VP6", nome: "IVA dovuta" },
  { k: "vp6_credito", rigo: "VP6", nome: "IVA a credito" },
  { k: "vp7", rigo: "VP7", nome: "Debito periodo precedente (fino a 100 €)" },
  { k: "vp8", rigo: "VP8", nome: "Credito periodo precedente" },
  { k: "vp9", rigo: "VP9", nome: "Credito anno precedente" },
  { k: "vp10", rigo: "VP10", nome: "Versamenti auto F24 elementi identificativi" },
  { k: "vp11", rigo: "VP11", nome: "Crediti d'imposta" },
  { k: "vp12", rigo: "VP12", nome: "Interessi trimestrali" },
  { k: "vp13", rigo: "VP13", nome: "Acconto dovuto" },
];
const A_MANO = new Set<keyof RighiLipe>(["vp9", "vp10", "vp11", "vp13"]);
const RIGHI_REGISTRO = RIGHI.slice(0, 4);

const inviata = (c?: LiquidazioneIVAConfermata) => c?.stato === "submitted" || c?.stato === "accepted_ade";
const statoLiquidazione = (c: LiquidazioneIVAConfermata) => c.stato === "rejected_ade" ? "Scartata" : inviata(c) ? "Inviata" : "Confermata";

function periodiAnno(anno: number, mensile: boolean) {
  const n = mensile ? 12 : 4;
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const meseInizio = mensile ? p : (p - 1) * 3 + 1;
    const pad = String(meseInizio).padStart(2, "0");
    return { periodo: p, dal: `${anno}-${pad}-01`, nome: mensile ? MESI[i] : `${p}° trimestre` };
  });
}

function esito(r: RighiLipe | undefined, t: (testo: string, valori?: Record<string, string | number>) => string) {
  if (!r) return null;
  if (r.vp14_debito > 0) return { testo: t("Da versare {importo}", { importo: formatCurrency(r.vp14_debito) }), cls: "text-red-700" };
  if (r.vp14_credito > 0) return { testo: t("A credito {importo}", { importo: formatCurrency(r.vp14_credito) }), cls: "text-emerald-700" };
  return { testo: t("Nessun importo"), cls: "text-muted-foreground" };
}

function DettaglioPeriodo({ company, anno, periodo, mensile, confermata, puoScrivere, finito, onCambiato, onApriRegistro }: {
  company: string; anno: number; periodo: number; mensile: boolean; confermata?: LiquidazioneIVAConfermata; puoScrivere: boolean; finito: boolean;
  onCambiato: () => void; onApriRegistro: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [manuali, setManuali] = useState<Record<string, string>>({});
  const [usaRegistro, setUsaRegistro] = useState(false);
  const bloccata = !!confermata;
  const inviati = inviata(confermata);

  const { valori, sbagliati } = useMemo(() => {
    const out: Record<string, number | boolean> = {};
    const errori: string[] = [];
    if (usaRegistro) out.totali_registro = true;
    for (const [k, v] of Object.entries(manuali)) {
      if (!usaRegistro && RIGHI_REGISTRO.some((r) => r.k === k)) continue;
      if (v.trim() === "") continue;
      const n = leggiImporto(v);
      if (n !== null) out[k] = n;
      else errori.push(k);
    }
    return { valori: out, sbagliati: errori };
  }, [manuali, usaRegistro]);

  // Confermato: si ricalcola lo stesso, per accorgersi se i documenti sono cambiati.
  const manualiUsati = confermata ? confermata.dati.manuali ?? {} : valori;
  const calcolo = useQuery({
    queryKey: ["liquidazione-righi", company, anno, periodo, manualiUsati],
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc("liquidazione_iva_righi", { p_company: company, p_anno: anno, p_periodo: periodo, p_manuali: manualiUsati });
      if (error) throw error;
      return data as CalcoloLiquidazioneIVA;
    },
  });
  const r = bloccata ? confermata.dati : calcolo.data;

  const conferma = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("liquidazione_iva_conferma", { p_company: company, p_anno: anno, p_periodo: periodo, p_manuali: valori });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Liquidazione confermata")); onCambiato(); },
    onError: (e: Error) => toast.error(t("Non confermata"), { description: e.message }),
  });
  const creaF24 = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("liquidazione_iva_crea_f24", { p_report: confermata!.id });
      if (error) throw error;
      return data as { gia_creato?: boolean; aggiornato?: boolean; codice?: string };
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["f24"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success(d.gia_creato ? t("F24 già presente nel Registro F24")
        : d.aggiornato ? t("F24 aggiornato con i dati della liquidazione")
        : t("F24 con codice {codice} aggiunto al Registro F24", { codice: String(d.codice ?? "") }));
    },
    onError: (e: Error) => toast.error(t("F24 non creato"), { description: e.message }),
  });
  const riapri = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("liquidazione_iva_riapri", { p_report: confermata!.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Liquidazione riaperta")); onCambiato(); },
    onError: (e: Error) => toast.error(t("Non riaperta"), { description: e.message }),
  });

  if (!bloccata && calcolo.isPending) return <p className="p-3 text-sm text-muted-foreground">{t("Calcolo…")}</p>;
  if (!bloccata && calcolo.isError) return <p role="alert" className="p-3 text-sm text-destructive">{t("Calcolo non riuscito: {message}", { message: String((calcolo.error as Error).message ?? "") })}</p>;
  const righi = r?.righi;
  const acconto = mensile ? periodo === 12 : periodo === 4;
  const ora = bloccata ? calcolo.data : undefined;
  const cambiati = !!righi && !!ora && (!ora.calcolabile || !ora.righi || !stessiRighiLipe(righi, ora.righi));
  const versabile = r?.versamento
    ? r.versamento.stato === "da_versare"
    : !!righi && righi.vp14_debito > 100 && r?.trimestre !== 5;
  const editabile = (k: keyof RighiLipe) => !bloccata && puoScrivere && (A_MANO.has(k)
    || (k === "vp7" && ((r?.debito_riportabile ?? 0) > 0 || manuali[k] !== undefined))
    || (k === "vp8" && ((r?.credito_riportabile ?? 0) > 0 || manuali[k] !== undefined))
    || (usaRegistro && RIGHI_REGISTRO.some((x) => x.k === k)));
  const righiVisibili = RIGHI.filter(({ k }) => (k !== "vp13" || acconto)
    && (righi || (editabile(k) && (r?.debito_riportabile != null && (k === "vp7" || k === "vp8")
      || manuali[k] !== undefined || (usaRegistro && RIGHI_REGISTRO.some((x) => x.k === k))))));

  return (
    <div className="space-y-3 border-t bg-muted/20 p-3">
      {r && !r.calcolabile && <p role="alert" className="text-sm text-amber-800">{r.motivo}</p>}
      {!bloccata && puoScrivere && (usaRegistro || r?.richiede_registro || r?.calcolabile) && (
        <div className="space-y-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setUsaRegistro((v) => !v)}>
            {usaRegistro ? t("Usa il calcolo dalle fatture") : t("Inserisci i totali del registro IVA")}
          </Button>
          {usaRegistro && <p className="text-xs text-muted-foreground">{t("Riporta tutti e quattro i righi VP2–VP5 verificati, compresi eventuali zeri. Il VP5 deve già includere il pro-rata.")}</p>}
          {r?.richiede_registro && <button type="button" className="ml-2 text-xs text-primary underline" onClick={onApriRegistro}>{t("Apri il registro")}</button>}
        </div>
      )}
      {righiVisibili.length > 0 && <table className="w-full text-sm">
        <tbody className="divide-y">
          {righiVisibili.map(({ k, rigo, nome }) => {
            return (
              <tr key={k}>
                <td className="w-12 py-1.5 font-mono text-xs text-muted-foreground">{rigo}</td>
                <td className="py-1.5">{t(nome)}</td>
                <td className="py-1 text-right tabular-nums">
                  {editabile(k) ? (
                    <Input
                      aria-label={t(nome)}
                      inputMode="decimal"
                      aria-invalid={sbagliati.includes(k)}
                      className={cn("ml-auto h-7 w-28 text-right text-xs", sbagliati.includes(k) && "border-destructive")}
                      placeholder={righi?.[k] != null ? String(righi[k]).replace(".", ",") : undefined}
                      value={manuali[k] ?? ""}
                      onChange={(e) => setManuali((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  ) : formatCurrency(Number(righi?.[k] ?? 0))}
                </td>
              </tr>
            );
          })}
          {righi && r?.trimestre !== 5 && <tr className="font-semibold">
            <td className="py-2 font-mono text-xs">VP14</td>
            <td className="py-2">{righi.vp14_credito > 0 ? t("A credito") : t("Da versare")}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(righi.vp14_credito > 0 ? righi.vp14_credito : righi.vp14_debito)}</td>
          </tr>}
        </tbody>
      </table>}
      {!!r?.credito_anno_disponibile && !bloccata && (
        <p className="text-xs text-muted-foreground">{t("Credito dell'anno precedente ancora disponibile: {valore}.", { valore: formatCurrency(r.credito_anno_disponibile!) })}</p>
      )}
      {r?.avvisi?.map((a) => (
        <p key={a} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {a}{a.includes("Registro IVA") && (
            <button type="button" className="ml-1 font-medium underline" onClick={onApriRegistro}>{t("Apri il registro")}</button>
          )}
        </p>
      ))}
      {cambiati && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {t("I dati o le regole di calcolo sono cambiati dopo la conferma.")}{" "}
          {inviati ? t("Verifica con il consulente se occorre una comunicazione sostitutiva.") : t("Riapri e riconferma il periodo.")}
        </p>
      )}
      {bloccata && !!righi?.vp14_debito && !versabile && r?.trimestre !== 5 && (
        <p className="text-xs text-muted-foreground">{t("Verifica la scadenza del versamento e l'eventuale rinvio dell'importo.")}</p>
      )}
      {versabile && r?.versamento?.scadenza && (
        <p className="text-xs text-muted-foreground">{t("Versamento entro il {scadenza} · Codice {codice}", { scadenza: formatDate(r.versamento.scadenza), codice: String(r.versamento.codice ?? "") })}</p>
      )}
      {!bloccata && !finito && <p className="text-xs text-muted-foreground">{t("Periodo ancora in corso: si conferma quando è finito. Intanto vedi il calcolo a oggi.")}</p>}
      {sbagliati.length > 0 && <p role="alert" className="text-xs text-destructive">{t("Scrivi un importo valido, per esempio 1.234,50.")}</p>}
      {puoScrivere && (
        <div className="flex justify-end gap-2">
          {!bloccata && righi && (
            <Button size="sm" onClick={() => conferma.mutate()} disabled={!r?.calcolabile || conferma.isPending || calcolo.isFetching || !finito || sbagliati.length > 0}>
              {conferma.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Conferma liquidazione")}
            </Button>
          )}
          {bloccata && versabile && (
            <Button size="sm" onClick={() => creaF24.mutate()} disabled={creaF24.isPending || (cambiati && !inviati)}>{t("Crea F24 da questa liquidazione")}</Button>
          )}
          {bloccata && !inviati && (
            <Button size="sm" variant="outline" onClick={() => riapri.mutate()} disabled={riapri.isPending}>{t("Riapri")}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LiquidazioniIVA({ anno, onApriImpostazioni, onApriRegistro }: { anno: number; onApriImpostazioni: () => void; onApriRegistro?: () => void }) {
  const tr = useT();
  const company = useEffectiveCompanyId();
  const qc = useQueryClient();
  const { isAdmin, solaLettura } = usePermissions();
  const puoScrivere = isAdmin && !solaLettura;
  const { impostazioni, isLoading, isError, refetch } = useImpostazioniIVA(anno);
  const { data: azienda } = useAnagraficaAzienda();
  // undefined = segue il primo periodo da confermare; null = chiuso a mano.
  const [aperto, setAperto] = useState<number | null | undefined>(undefined);

  const lista = useQuery({
    queryKey: ["liquidazioni-iva", company, anno],
    enabled: !!company && !!impostazioni,
    queryFn: async () => {
      const { data, error } = await db.rpc("liquidazioni_iva_anno", { p_company: company, p_anno: anno });
      if (error) throw error;
      return (data ?? []) as LiquidazioneIVAConfermata[];
    },
  });
  const aggiorna = () => {
    setAperto(undefined);
    void qc.invalidateQueries({ queryKey: ["liquidazioni-iva"] });
    void qc.invalidateQueries({ queryKey: ["liquidazione-righi"] });
    void qc.invalidateQueries({ queryKey: ["f24"] });
    void qc.invalidateQueries({ queryKey: ["cashflow"] });
  };

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">{tr("Caricamento…")}</p>;
  if (isError) return <p role="alert" className="p-4 text-sm text-destructive">
    {tr("Impossibile leggere le impostazioni IVA.")} <button type="button" className="underline" onClick={() => void refetch()}>{tr("Riprova")}</button>
  </p>;
  if (!impostazioni) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold">{tr("Liquidazione IVA {anno}", { anno })}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tr("Per iniziare serve sapere se liquidi ogni mese o ogni trimestre.")}</p>
        <Button size="sm" className="mt-3" onClick={onApriImpostazioni}>{tr("Compila le impostazioni IVA")}</Button>
      </div>
    );
  }

  const mensile = impostazioni.periodicita === "mensile";
  const periodi = periodiAnno(anno, mensile);
  const confermate = new Map((lista.data ?? []).map((c) => [c.dal, c]));
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const fineDi = (dal: string) => {
    const [a, m] = dal.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + (mensile ? 1 : 3), 0)).toISOString().slice(0, 10);
  };
  const finito = (dal: string) => fineDi(dal) < oggi;
  const prossimo = periodi.find((p) => !confermate.has(p.dal))?.periodo ?? null;
  const apertoOra = aperto === undefined ? (lista.isSuccess ? prossimo : null) : aperto;
  const fatti = periodi.filter((p) => confermate.has(p.dal)).length;

  const confermatiRighi = periodi.map((p) => confermate.get(p.dal)?.dati.righi).filter((x): x is RighiLipe => !!x);
  const somma = (k: keyof RighiLipe) => confermatiRighi.reduce((t, x) => t + Number(x[k] ?? 0), 0);
  const esportaCsv = () => {
    const n = (v: number | undefined) => (v === undefined ? "" : v.toFixed(2).replace(".", ","));
    const righeCsv = [
      ["Periodo", "Operazioni attive", "Operazioni passive", "IVA vendite", "IVA acquisti", "Da versare", "A credito", "Stato"],
      ...periodi.map((p) => {
        const c = confermate.get(p.dal), x = c?.dati.righi;
        const annuale = c?.dati.trimestre === 5;
        return [p.nome, n(x?.vp2), n(x?.vp3), n(x?.vp4), n(x?.vp5), n(annuale ? undefined : x?.vp14_debito),
          n(annuale ? undefined : x?.vp14_credito), c ? statoLiquidazione(c) : "Da confermare"];
      }),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + righeCsv.map((r) => r.join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `liquidazioni-iva-${anno}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="font-semibold">{tr("Liquidazione IVA {anno}", { anno })}</h3>
            <p className="text-xs text-muted-foreground">{tr("{fatti} di {n} confermati · si confermano in ordine, poi si scarica il file", { fatti, n: periodi.length })}</p>
          </div>
          <div className="flex items-center gap-3">
          {fatti > 0 && <button type="button" onClick={esportaCsv} className="text-xs text-primary hover:underline">{tr("Esporta tabella")}</button>}
          <button type="button" onClick={onApriImpostazioni} className="text-xs text-muted-foreground hover:underline">
            {mensile ? tr("Mensile") : impostazioni.periodicita === "trimestrale" ? tr("Trimestrale su opzione") : tr("Trimestrale speciale")} · {tr("cambia")}
          </button>
          </div>
        </div>
        <div className="hidden grid-cols-[1.25rem_8rem_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_7rem] items-center gap-2 border-t bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground md:grid">
          <span /><span>{tr("Periodo")}</span>
          <span className="text-right">{tr("Op. attive")}</span><span className="text-right">{tr("Op. passive")}</span>
          <span className="text-right">{tr("IVA vendite")}</span><span className="text-right">{tr("IVA acquisti")}</span>
          <span className="text-right">{tr("Risultato")}</span><span className="text-right">{tr("Stato")}</span>
        </div>
        <div className="divide-y border-t">
          {periodi.map((p) => {
            const c = confermate.get(p.dal);
            const es = c?.dati.trimestre === 5
              ? { testo: tr("Saldo in dichiarazione annuale"), cls: "text-muted-foreground" }
              : esito(c?.dati.righi, tr);
            const isAperto = apertoOra === p.periodo;
            return (
              <div key={p.periodo}>
                <button type="button" aria-expanded={isAperto} onClick={() => setAperto(isAperto ? null : p.periodo)}
                  className="grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-accent/40 md:grid-cols-[1.25rem_8rem_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_7rem]">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isAperto && "rotate-180")} />
                  <span className="font-medium">{mensile ? tr(p.nome) : tr("{q}° trimestre", { q: p.periodo })}</span>
                  {([c?.dati.righi?.vp2, c?.dati.righi?.vp3, c?.dati.righi?.vp4, c?.dati.righi?.vp5] as Array<number | undefined>).map((v, i) => (
                    <span key={i} className="hidden text-right tabular-nums text-muted-foreground md:block">{v === undefined ? "—" : formatCurrency(Number(v))}</span>
                  ))}
                  <span className={cn("hidden text-right text-xs tabular-nums md:block", es?.cls)}>{es?.testo ?? "—"}</span>
                  <span className="text-right">{c ? (
                    <Badge variant="outline" className="gap-1 border-emerald-300 font-normal text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />{tr(statoLiquidazione(c))}
                    </Badge>
                  ) : <span className="text-xs text-muted-foreground">{finito(p.dal) ? tr("Da confermare") : tr("In corso")}</span>}</span>
                </button>
                {isAperto && company && (
                  <DettaglioPeriodo key={`${company}:${anno}:${p.periodo}`} company={company} anno={anno} periodo={p.periodo}
                    mensile={mensile} confermata={c} puoScrivere={puoScrivere} finito={finito(p.dal)} onCambiato={aggiorna}
                    onApriRegistro={onApriRegistro ?? (() => undefined)} />
                )}
              </div>
            );
          })}
        </div>
        {fatti > 0 && (
          <div className="hidden grid-cols-[1.25rem_8rem_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_7rem] items-center gap-2 border-t bg-muted/40 px-4 py-1.5 text-xs font-semibold md:grid">
            <span /><span>{tr("Totale confermati")}</span>
            {(["vp2", "vp3", "vp4", "vp5"] as const).map((k) => <span key={k} className="text-right tabular-nums">{formatCurrency(somma(k))}</span>)}
            <span /><span />
          </div>
        )}
      </div>

      {company && (lista.isError ? (
        <p role="alert" className="rounded-xl border p-4 text-sm text-destructive">
          {tr("Impossibile leggere le liquidazioni confermate.")} <button type="button" className="underline" onClick={() => void lista.refetch()}>{tr("Riprova")}</button>
        </p>
      ) : lista.isSuccess && (
        <ComunicazioniLipe key={`${company}:${anno}`} company={company} anno={anno} oggi={oggi} impostazioni={impostazioni}
          partitaIva={String(azienda?.partita_iva ?? "").replace(/^IT/i, "").replace(/\s/g, "")}
          confermate={confermate} puoScrivere={puoScrivere} onApriImpostazioni={onApriImpostazioni} onCambiato={aggiorna} />
      ))}
    </div>
  );
}
