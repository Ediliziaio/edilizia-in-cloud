import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useImpostazioniIVA } from "@/hooks/useImpostazioniIVA";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import { leggiImporto } from "@/lib/finance/reconciliationAnalysis";
import { controlliLipe, nomeFileLipe, scadenzaLipe, xmlLipe, type ComunicazioneLipe, type ModuloLipe, type RighiLipe } from "@/lib/contabilita/lipeXml";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Calcolo {
  calcolabile: boolean;
  motivo?: string;
  etichetta?: string;
  dal?: string;
  al?: string;
  mese?: number | null;
  trimestre?: number | null;
  trimestre_solare?: number;
  credito_anno_disponibile?: number;
  avvisi?: string[];
  righi?: RighiLipe;
}
interface Confermata {
  id: string;
  dal: string;
  al: string;
  stato: "reviewed_commercialista" | "submitted" | "accepted_ade" | "rejected_ade";
  protocollo: string | null;
  dati: Calcolo;
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
  { k: "vp10", rigo: "VP10", nome: "Versamenti auto UE" },
  { k: "vp11", rigo: "VP11", nome: "Crediti d'imposta" },
  { k: "vp12", rigo: "VP12", nome: "Interessi trimestrali" },
  { k: "vp13", rigo: "VP13", nome: "Acconto versato" },
];
const A_MANO = new Set<keyof RighiLipe>(["vp9", "vp10", "vp11", "vp13"]);

function periodiAnno(anno: number, mensile: boolean) {
  const n = mensile ? 12 : 4;
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const meseInizio = mensile ? p : (p - 1) * 3 + 1;
    const pad = String(meseInizio).padStart(2, "0");
    return { periodo: p, dal: `${anno}-${pad}-01`, nome: mensile ? MESI[i] : `${p}° trimestre` };
  });
}

function esito(r?: RighiLipe) {
  if (!r) return null;
  if (r.vp14_debito > 0) return { testo: `Da versare ${formatCurrency(r.vp14_debito)}`, cls: "text-red-700" };
  if (r.vp14_credito > 0) return { testo: `A credito ${formatCurrency(r.vp14_credito)}`, cls: "text-emerald-700" };
  return { testo: "Nessun importo", cls: "text-muted-foreground" };
}

function DettaglioPeriodo({ company, anno, periodo, confermata, puoScrivere, finito, onCambiato, onApriRegistro }: {
  company: string; anno: number; periodo: number; confermata?: Confermata; puoScrivere: boolean; finito: boolean; onCambiato: () => void; onApriRegistro: () => void;
}) {
  const [manuali, setManuali] = useState<Record<string, string>>({});
  const bloccata = !!confermata;
  const inviati = confermata && confermata.stato !== "reviewed_commercialista";

  const sbagliati = Object.entries(manuali).filter(([, v]) => v.trim() !== "" && leggiImporto(v) === null).map(([k]) => k);
  const valori = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(manuali)) {
      if (v.trim() === "") continue;
      const n = leggiImporto(v);
      if (n !== null) out[k] = n;
    }
    return out;
  }, [manuali]);

  const calcolo = useQuery({
    queryKey: ["liquidazione-righi", company, anno, periodo, valori],
    enabled: !bloccata,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await db.rpc("liquidazione_iva_righi", { p_company: company, p_anno: anno, p_periodo: periodo, p_manuali: valori });
      if (error) throw error;
      return data as Calcolo;
    },
  });
  const r = bloccata ? confermata.dati : calcolo.data;

  const conferma = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("liquidazione_iva_conferma", { p_company: company, p_anno: anno, p_periodo: periodo, p_manuali: valori });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Liquidazione confermata"); onCambiato(); },
    onError: (e: Error) => toast.error("Non confermata", { description: e.message }),
  });
  const riapri = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("liquidazione_iva_riapri", { p_report: confermata!.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Liquidazione riaperta"); onCambiato(); },
    onError: (e: Error) => toast.error("Non riaperta", { description: e.message }),
  });

  if (!bloccata && calcolo.isPending) return <p className="p-3 text-sm text-muted-foreground">Calcolo…</p>;
  if (!bloccata && calcolo.isError) return <p role="alert" className="p-3 text-sm text-destructive">Calcolo non riuscito: {(calcolo.error as Error).message}</p>;
  if (r && !r.calcolabile) return <p role="alert" className="p-3 text-sm text-amber-800">{r.motivo}</p>;
  if (!r?.righi) return null;
  const righi = r.righi;
  const acconto = (r.mese === 12) || (r.trimestre === 4) || (r.trimestre === 5);

  return (
    <div className="space-y-3 border-t bg-muted/20 p-3">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {RIGHI.filter(({ k }) => k !== "vp13" || acconto).map(({ k, rigo, nome }) => {
            const aMano = A_MANO.has(k) && !bloccata && puoScrivere;
            return (
              <tr key={k}>
                <td className="w-12 py-1.5 font-mono text-xs text-muted-foreground">{rigo}</td>
                <td className="py-1.5">{nome}</td>
                <td className="py-1 text-right tabular-nums">
                  {aMano ? (
                    <Input
                      aria-label={nome}
                      inputMode="decimal"
                      aria-invalid={sbagliati.includes(k)}
                      className={cn("ml-auto h-7 w-28 text-right text-xs", sbagliati.includes(k) && "border-destructive")}
                      placeholder={String(righi[k] ?? 0).replace(".", ",")}
                      value={manuali[k] ?? ""}
                      onChange={(e) => setManuali((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  ) : formatCurrency(Number(righi[k] ?? 0))}
                </td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-2 font-mono text-xs">VP14</td>
            <td className="py-2">{righi.vp14_credito > 0 ? "A credito" : "Da versare"}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(righi.vp14_credito > 0 ? righi.vp14_credito : righi.vp14_debito)}</td>
          </tr>
        </tbody>
      </table>
      {(r.credito_anno_disponibile ?? 0) > 0 && !bloccata && (
        <p className="text-xs text-muted-foreground">Credito dell'anno precedente ancora disponibile: {formatCurrency(r.credito_anno_disponibile!)}.</p>
      )}
      {r.avvisi?.map((a) => (
        <p key={a} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {a}{a.includes("Registro IVA") && (
            <button type="button" className="ml-1 font-medium underline" onClick={onApriRegistro}>Apri il registro</button>
          )}
        </p>
      ))}
      {!bloccata && !finito && <p className="text-xs text-muted-foreground">Periodo ancora in corso: si conferma quando è finito. Intanto vedi il calcolo a oggi.</p>}
      {sbagliati.length > 0 && <p role="alert" className="text-xs text-destructive">Scrivi un importo valido, per esempio 1.234,50.</p>}
      {puoScrivere && (
        <div className="flex justify-end gap-2">
          {!bloccata && (
            <Button size="sm" onClick={() => conferma.mutate()} disabled={conferma.isPending || calcolo.isFetching || !finito || sbagliati.length > 0}>
              {conferma.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conferma liquidazione
            </Button>
          )}
          {bloccata && !inviati && (
            <Button size="sm" variant="outline" onClick={() => riapri.mutate()} disabled={riapri.isPending}>Riapri</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LiquidazioniIVA({ anno, onApriImpostazioni, onApriRegistro }: { anno: number; onApriImpostazioni: () => void; onApriRegistro?: () => void }) {
  const company = useEffectiveCompanyId();
  const qc = useQueryClient();
  const { isAdmin, solaLettura } = usePermissions();
  const puoScrivere = isAdmin && !solaLettura;
  const { impostazioni, isLoading } = useImpostazioniIVA(anno);
  const { data: azienda } = useAnagraficaAzienda();
  // undefined = segue il primo periodo da confermare; null = chiuso a mano.
  const [aperto, setAperto] = useState<number | null | undefined>(undefined);
  const [segnando, setSegnando] = useState<number | null>(null);
  const [protocollo, setProtocollo] = useState<Record<number, string>>({});

  const lista = useQuery({
    queryKey: ["liquidazioni-iva", company, anno],
    enabled: !!company && !!impostazioni,
    queryFn: async () => {
      const { data, error } = await db.rpc("liquidazioni_iva_anno", { p_company: company, p_anno: anno });
      if (error) throw error;
      return (data ?? []) as Confermata[];
    },
  });
  const aggiorna = () => {
    setAperto(undefined);
    void qc.invalidateQueries({ queryKey: ["liquidazioni-iva"] });
    void qc.invalidateQueries({ queryKey: ["liquidazione-righi"] });
  };

  const segna = useMutation({
    mutationFn: async ({ q }: { q: number }) => {
      const dal = `${anno}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
      const al = new Date(Date.UTC(anno, q * 3, 0)).toISOString().slice(0, 10);
      const { error } = await db.rpc("liquidazione_iva_segna_inviata", { p_company: company, p_dal: dal, p_al: al, p_protocollo: protocollo[q] ?? "" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Comunicazione segnata come inviata"); aggiorna(); },
    onError: (e: Error) => toast.error("Non salvato", { description: e.message }),
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Caricamento…</p>;
  if (!impostazioni) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <h3 className="font-semibold">Liquidazione IVA {anno}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Per iniziare serve sapere se liquidi ogni mese o ogni trimestre.</p>
        <Button size="sm" className="mt-3" onClick={onApriImpostazioni}>Compila le impostazioni IVA</Button>
      </div>
    );
  }

  const mensile = impostazioni.periodicita === "mensile";
  const periodi = periodiAnno(anno, mensile);
  const confermate = new Map((lista.data ?? []).map((c) => [c.dal, c]));
  const oggi = new Date().toLocaleDateString("en-CA");
  const fineDi = (dal: string) => {
    const [a, m] = dal.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + (mensile ? 1 : 3), 0)).toISOString().slice(0, 10);
  };
  const finito = (dal: string) => fineDi(dal) < oggi;
  const prossimo = periodi.find((p) => !confermate.has(p.dal))?.periodo ?? null;
  const apertoOra = aperto === undefined ? (lista.isSuccess ? prossimo : null) : aperto;
  const fatti = periodi.filter((p) => confermate.has(p.dal)).length;

  const comunicazione = (q: number) => {
    const inizio = (q - 1) * 3 + 1;
    const servono = mensile ? [inizio, inizio + 1, inizio + 2] : [inizio];
    const trovate = servono.map((m) => confermate.get(`${anno}-${String(m).padStart(2, "0")}-01`));
    if (trovate.some((c) => !c)) return { pronto: false as const, mancano: trovate.filter((c) => !c).length };
    const moduli: ModuloLipe[] = trovate.map((c) => ({
      mese: c!.dati.mese ?? undefined, trimestre: c!.dati.trimestre ?? undefined, righi: c!.dati.righi!,
    }));
    const c: ComunicazioneLipe = {
      anno,
      codiceFiscale: (impostazioni.cf_contribuente ?? "").toUpperCase(),
      partitaIva: String(azienda?.partita_iva ?? "").replace(/^IT/i, "").replace(/\s/g, ""),
      cfDichiarante: impostazioni.cf_dichiarante?.toUpperCase() ?? null,
      codiceCarica: impostazioni.codice_carica ?? null,
      cfIntermediario: impostazioni.cf_intermediario?.toUpperCase() ?? null,
      moduli,
    };
    return { pronto: true as const, c, errori: controlliLipe(c), inviata: trovate.some((x) => x!.stato !== "reviewed_commercialista"), protocollo: trovate[0]!.protocollo };
  };

  const scarica = (q: number, c: ComunicazioneLipe) => {
    try {
      const xml = xmlLipe(c);
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeFileLipe(c.partitaIva, anno, q);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("File non generato", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="font-semibold">Liquidazione IVA {anno}</h3>
            <p className="text-xs text-muted-foreground">{fatti} di {periodi.length} confermati · si confermano in ordine, poi si scarica il file</p>
          </div>
          <button type="button" onClick={onApriImpostazioni} className="text-xs text-muted-foreground hover:underline">
            {mensile ? "Mensile" : impostazioni.periodicita === "trimestrale" ? "Trimestrale su opzione" : "Trimestrale speciale"} · cambia
          </button>
        </div>
        <div className="hidden grid-cols-[1.25rem_8rem_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_7rem] items-center gap-2 border-t bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground md:grid">
          <span /><span>Periodo</span>
          <span className="text-right">Op. attive</span><span className="text-right">Op. passive</span>
          <span className="text-right">IVA vendite</span><span className="text-right">IVA acquisti</span>
          <span className="text-right">Risultato</span><span className="text-right">Stato</span>
        </div>
        <div className="divide-y border-t">
          {periodi.map((p) => {
            const c = confermate.get(p.dal);
            const es = esito(c?.dati.righi);
            const isAperto = apertoOra === p.periodo;
            return (
              <div key={p.periodo}>
                <button type="button" aria-expanded={isAperto} onClick={() => setAperto(isAperto ? null : p.periodo)}
                  className="grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-accent/40 md:grid-cols-[1.25rem_8rem_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_7rem]">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isAperto && "rotate-180")} />
                  <span className="font-medium">{p.nome}</span>
                  {([c?.dati.righi?.vp2, c?.dati.righi?.vp3, c?.dati.righi?.vp4, c?.dati.righi?.vp5] as Array<number | undefined>).map((v, i) => (
                    <span key={i} className="hidden text-right tabular-nums text-muted-foreground md:block">{v === undefined ? "—" : formatCurrency(Number(v))}</span>
                  ))}
                  <span className={cn("hidden text-right text-xs tabular-nums md:block", es?.cls)}>{es?.testo ?? "—"}</span>
                  <span className="text-right">{c ? (
                    <Badge variant="outline" className="gap-1 border-emerald-300 font-normal text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />{c.stato === "reviewed_commercialista" ? "Confermata" : "Inviata"}
                    </Badge>
                  ) : <span className="text-xs text-muted-foreground">{finito(p.dal) ? "Da confermare" : "In corso"}</span>}</span>
                </button>
                {isAperto && company && (
                  <DettaglioPeriodo company={company} anno={anno} periodo={p.periodo} confermata={c} puoScrivere={puoScrivere} finito={finito(p.dal)} onCambiato={aggiorna} onApriRegistro={onApriRegistro ?? (() => undefined)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="px-4 py-3">
          <h3 className="font-semibold">File per l'Agenzia delle Entrate (LIPE)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Si scarica quando il trimestre è confermato. Poi va controllato, firmato e inviato con Entratel o Fatture e Corrispettivi.</p>
        </div>
        <div className="divide-y border-t">
          {[1, 2, 3, 4].map((q) => {
            const stato = comunicazione(q);
            const scad = scadenzaLipe(anno, q);
            return (
              <div key={q} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="w-24 font-medium">{q}° trimestre</span>
                <span className={cn("w-36 text-xs", scad < oggi && !(stato.pronto && stato.inviata) ? "font-medium text-red-700" : "text-muted-foreground")}>Entro il {fiscalDate(scad)}</span>
                <div className="min-w-40 flex-1 text-xs">
                  {!stato.pronto && <span className="text-muted-foreground">{mensile ? `Mancano ${stato.mancano} mesi da confermare` : "Da confermare"}</span>}
                  {stato.pronto && stato.errori.length > 0 && (
                    <div className="text-destructive">
                      <ul>{stato.errori.map((e) => <li key={e}>{e}</li>)}</ul>
                      <button type="button" className="font-medium underline" onClick={onApriImpostazioni}>Completa le impostazioni</button>
                    </div>
                  )}
                  {stato.pronto && stato.inviata && <span className="text-emerald-700">Inviata · protocollo {stato.protocollo}</span>}
                </div>
                {stato.pronto && stato.errori.length === 0 && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={stato.inviata ? "outline" : "default"} onClick={() => scarica(q, stato.c)}><Download className="mr-1.5 h-3.5 w-3.5" />Scarica XML</Button>
                    {!stato.inviata && puoScrivere && segnando !== q && (
                      <Button size="sm" variant="ghost" onClick={() => setSegnando(q)}>Ho inviato</Button>
                    )}
                    {!stato.inviata && puoScrivere && segnando === q && (
                      <>
                        <Input aria-label={`Protocollo ricevuta ${q}° trimestre`} placeholder="Protocollo ricevuta" className="h-8 w-40 text-xs"
                          value={protocollo[q] ?? ""} onChange={(e) => setProtocollo((p) => ({ ...p, [q]: e.target.value }))} />
                        <Button size="sm" disabled={!protocollo[q]?.trim() || segna.isPending} onClick={() => segna.mutate({ q })}>Salva</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
