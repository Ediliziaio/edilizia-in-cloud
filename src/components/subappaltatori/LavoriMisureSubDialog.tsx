import { UniformSelect } from "@/components/ui/uniform-select";
import { useRef, useState } from "react";
import { avanzamentoVociSalSub, type RigaAvanzamentoSalSub } from "../../../supabase/functions/_shared/righeLavoriSalSub";
import { puoConsultareSalSub, puoScrivereSalSub } from "@/lib/permessi/contabilitaSubappalto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { Button } from "@/components/ui/button";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  type QuadroSub,
  type MisuraSub,
  type VoceSub,
  euroSub,
  quantitaSub,
  importoVociSub,
  riepilogoVoceSub,
  misurePerSalSub,
  vociDaAllegato,
  fattoInCantiere,
  type RigaCantiere,
  quotaOneriSal,
} from "@/lib/subappaltatori/lavoriMisure";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Contratto = {
  id: string;
  order_id: string;
  numero_contratto: string | null;
  descrizione_lavori: string;
  importo_contrattuale: number;
  oneri_sicurezza: number;
  ritenuta_garanzia_pct: number;
  /** Allegato A: se c'è e torna all'importo, l'elenco lavori parte da qui. */
  elenco_lavori?: unknown;
};
type Bozza = {
  id: string;
  fase_id: string;
  descrizione: string;
  base: VoceSub["base"];
  unita: string;
  quantita: string;
  prezzo: string;
};
type Dettaglio =
  | { tipo: "rileva"; voce: VoceSub }
  | { tipo: "verifica" | "annulla"; misura: MisuraSub; voce: VoceSub };
const oggi = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );
const selettore = "h-10 rounded-md border bg-background px-2 text-sm";
const daVoce = (v: VoceSub): Bozza => ({
  ...v,
  fase_id: v.fase_id ?? "",
  quantita: String(v.quantita),
  prezzo: String(v.prezzo),
});
async function rpc(nome: string, parametri: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome as never, parametri as never);
  if (error) throw Error(error.message);
  const d = data as unknown;
  if (!d || typeof d !== "object" || !("id" in d) || typeof d.id !== "string")
    throw Error(
      "Risultato non confermato dal server: ricarica prima di riprovare",
    );
  return d as { id: string; numero_sal?: number };
}
export function LavoriMisureSubDialog({
  companyId,
  contratto: c,
  onClose,
  onApriVerbale,
  sezioneIniziale = "lavori",
  onApriStorico,
}: {
  companyId: string;
  contratto: Contratto;
  sezioneIniziale?: "lavori" | "misure" | "sal";
  onApriStorico?: () => void;
  onClose: () => void;
  onApriVerbale: (id: string) => Promise<void>;
}) {
  const tTesto = useT();
  const p = usePermissions(),
    qc = useQueryClient();
  const lettura = puoConsultareSalSub(p);
  const scrittura = puoScrivereSalSub(p);
  const [tab, setTab] = useState<"lavori" | "misure" | "sal">(sezioneIniziale);
  const [modifica, setModifica] = useState(false),
    [bozza, setBozza] = useState<Bozza[]>([]);
  const [maturazione, setMaturazione] = useState(""),
    [giorni, setGiorni] = useState(""),
    [motivo, setMotivo] = useState("");
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null),
    [quantita, setQuantita] = useState(""),
    [riferimento, setRiferimento] = useState(""),
    [data, setData] = useState(oggi);
  const [storicoSelezionato, setStoricoSelezionato] = useState("");
  const [selezionate, setSelezionate] = useState<string[]>([]),
    [dataSal, setDataSal] = useState(oggi),
    [ritenuta, setRitenuta] = useState(String(c.ritenuta_garanzia_pct ?? 0)),
    [noteSal, setNoteSal] = useState("");
  const [risultato, setRisultato] = useState<{
    id: string;
    numero_sal?: number;
  } | null>(null);
  const [errore, setErrore] = useState(""),
    [busy, setBusy] = useState(false),
    [uscita, setUscita] = useState(false);
  const bloccato = useRef(false),
    richiesta = useRef(crypto.randomUUID());
  const q = useQuery({
    queryKey: ["subappalto-lavori-misure", companyId, c.id, "numerazione-sal"],
    enabled: lettura,
    queryFn: async () => {
      const [a, b, s] = await Promise.all([
        supabase
          .from("subappalto_quadri_lavori" as never)
          .select("*")
          .eq("company_id", companyId)
          .eq("contratto_id", c.id)
          .order("revisione", { ascending: false })
          .limit(101),
        supabase
          .from("subappalto_misure" as never)
          .select("*")
          .eq("company_id", companyId)
          .eq("contratto_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1001),
        supabase
          .from("sal_subappaltatori")
          .select("id,numero_sal,stato,importo_lordo,oneri_quota")
          .eq("company_id", companyId)
          .eq("contratto_id", c.id)
          .limit(1001),
      ]);
      if (a.error || b.error || s.error)
        throw Error(tTesto("Lettura lavori, misure o SAL non riuscita"));
      const misure = (b.data ?? []) as unknown as MisuraSub[];
      const sal = (s.data ?? []) as unknown as {
        id: string;
        numero_sal: number;
        stato: string;
        importo_lordo: number;
        oneri_quota: number | null;
      }[];
      if (
        (a.data?.length ?? 0) > 100 ||
        misure.length > 1000 ||
        sal.length > 1000
      )
        throw Error(
          tTesto("Storico oltre il limite di questa vista: non è possibile mostrare totali parziali"),
        );
      return {
        quadri: (a.data ?? []) as unknown as QuadroSub[],
        quadro: ((a.data ?? []) as unknown as QuadroSub[])[0] ?? null,
        misure,
        sal,
      };
    },
  });
  const fasi = useQuery({
    queryKey: ["subappalto-lavori-fasi", companyId, c.order_id],
    enabled: !!c.order_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id,name")
        .eq("company_id", companyId)
        .eq("order_id", c.order_id)
        .order("position")
        .limit(301);
      if (error) throw error;
      if ((data ?? []).length > 300)
        throw Error(tTesto("Troppe lavorazioni per questo selettore"));
      return data ?? [];
    },
  });
  // A che punto è il cantiere: il SAL della ditta riparte da lì. Senza permesso sui costi le voci non si leggono, e si va a mano.
  const cantiere = useQuery({
    queryKey: ["subappalto-lavori-cantiere", companyId, c.order_id],
    enabled: !!c.order_id,
    queryFn: async (): Promise<RigaCantiere[]> => {
      const db = supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: unknown; error: unknown }> } } };
      const [fasi, voci] = await Promise.all([
        db.from("order_work_phases").select("id, sottofasi:order_work_subphases(id, name, fatta, percentuale, quantita_fatta)").eq("order_id", c.order_id as string),
        db.from("order_work_phase_voci").select("phase_id, subphase_id, descrizione, quantita").eq("order_id", c.order_id as string),
      ]);
      type S = { id: string; name: string; fatta: boolean; percentuale: number | null; quantita_fatta: number | null };
      const righe: RigaCantiere[] = [];
      const collegate = new Map(((voci.data ?? []) as Array<{ subphase_id: string | null; descrizione: string; quantita: number }>).filter((v) => v.subphase_id).map((v) => [v.subphase_id as string, v]));
      for (const f of (fasi.data ?? []) as Array<{ id: string; sottofasi: S[] | null }>) {
        for (const s of f.sottofasi ?? []) {
          const v = collegate.get(s.id);
          righe.push({ phase_id: f.id, descrizione: v?.descrizione ?? s.name, percentuale: s.fatta ? 100 : Number(s.percentuale) || 0, quantita_fatta: s.quantita_fatta == null ? null : Number(s.quantita_fatta), quantita: v ? Number(v.quantita) : null });
        }
      }
      return righe;
    },
  });
  const quadro = q.data?.quadro,
    misure = q.data?.misure ?? [];
  const storici = (q.data?.sal ?? []).some(
    (s) => s.stato !== "contestato" && Number(s.importo_lordo) > 0,
  );
  const riconosciute = misure.some((m) => m.stato === "riconosciuta");
  const daVerificare = misure.filter((m) => m.stato === "dichiarata").length;
  const disponibiliSal = misure.filter(
    (m) =>
      m.stato === "riconosciuta" &&
      !m.sal_id &&
      Number(m.importo_riconosciuto) > 0,
  );
  const valorePronto =
    disponibiliSal.reduce(
      (n, m) => n + Math.round(Number(m.importo_riconosciuto) * 100),
      0,
    ) / 100;
  const dirty =
    modifica ||
    !!dettaglio ||
    (!risultato && (selezionate.length > 0 || !!noteSal));
  const chiudi = () => {
    if (busy) return;
    if (dirty) setUscita(true);
    else onClose();
  };
  const aggiorna = async () => {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: ["subappalto-lavori-misure", companyId, c.id],
      }),
      qc.invalidateQueries({ queryKey: ["sal-sub", c.id] }),
      qc.invalidateQueries({ queryKey: ["sal-sub-tutti"] }),
      qc.invalidateQueries({ queryKey: ["ritenute-sub", c.id] }),
      qc.invalidateQueries({ queryKey: ["ritenute-sub-tutte"] }),
      qc.invalidateQueries({
        queryKey: ["order-subcontract-statistics", c.order_id, companyId],
      }),
    ]);
  };
  const esegui = async (fn: () => Promise<void>) => {
    if (bloccato.current) return;
    bloccato.current = true;
    setBusy(true);
    setErrore("");
    try {
      await fn();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : tTesto("Operazione non riuscita"));
    } finally {
      setBusy(false);
      bloccato.current = false;
    }
  };
  const iniziaElenco = () => {
    richiesta.current = crypto.randomUUID();
    setBozza(
      // Base che non torna più con l'importo del contratto (importo corretto dopo): si riparte dall'Allegato A.
      quadro && Math.abs(Number(quadro.importo_lavori) - Number(c.importo_contrattuale)) < 0.005
        ? quadro.voci.map(daVoce)
        : vociDaAllegato(c.elenco_lavori, Number(c.importo_contrattuale))?.map(daVoce) ?? (quadro ? quadro.voci.map(daVoce) : [
            daVoce({
              id: crypto.randomUUID(),
              fase_id: null,
              descrizione: c.descrizione_lavori,
              base: "corpo",
              unita: "quota",
              quantita: 1,
              prezzo: Number(c.importo_contrattuale),
            }),
          ]),
    );
    setMaturazione(quadro?.maturazione ?? "");
    setGiorni(
      quadro?.giorni_pagamento == null ? "" : String(quadro.giorni_pagamento),
    );
    setMotivo(
      quadro ? "Revisione elenco lavori" : "Prima impostazione dei lavori",
    );
    setErrore("");
    setModifica(true);
  };
  const voci = bozza.map((v) => ({
    ...v,
    // Una fase cancellata dopo il contratto non esiste più: la voce resta, senza fase (altrimenti il quadro si rifiuta).
    fase_id: v.fase_id && (!fasi.data || fasi.data.some((f) => f.id === v.fase_id)) ? v.fase_id : null,
    quantita: parseDecimalIT(v.quantita),
    prezzo: parseDecimalIT(v.prezzo),
  }));
  const totale = importoVociSub(voci);
  const salvaElenco = () =>
    esegui(async () => {
      await rpc("subappalto_quadro_registra", {
        p_company: companyId,
        p_contratto: c.id,
        p_id: richiesta.current,
        p_voci: voci,
        p_maturazione: maturazione,
        p_giorni: giorni === "" ? null : Number(giorni),
        p_motivo: motivo,
        p_importo_atteso: Number(c.importo_contrattuale),
      });
      await aggiorna();
      setModifica(false);
    });
  const mostraDettaglio = (d: Dettaglio) => {
    richiesta.current = crypto.randomUUID();
    setDettaglio(d);
    setQuantita(
      d.tipo === "rileva"
        ? ""
        : String(
            Math.round(
              Number(d.misura.quantita_dichiarata) *
                (d.voce.base === "corpo" ? 100 : 1) *
                10000,
            ) / 10000,
          ),
    );
    setData(oggi());
    setRiferimento("");
    setErrore("");
  };
  const salvaMisura = () =>
    esegui(async () => {
      if (!dettaglio || !quadro) return;
      const n =
        parseDecimalIT(quantita) / (dettaglio.voce.base === "corpo" ? 100 : 1);
      if (dettaglio.tipo === "rileva")
        await rpc("subappalto_misura_registra", {
          p_company: companyId,
          p_quadro: quadro.id,
          p_voce: dettaglio.voce.id,
          p_id: richiesta.current,
          p_data: data,
          p_quantita: n,
          p_riferimento: riferimento,
        });
      else if (dettaglio.tipo === "verifica")
        await rpc("subappalto_misura_verifica", {
          p_company: companyId,
          p_id: dettaglio.misura.id,
          p_revisione: dettaglio.misura.revisione,
          p_quantita: n,
          p_nota: riferimento,
        });
      else
        await rpc("subappalto_misura_annulla", {
          p_company: companyId,
          p_id: dettaglio.misura.id,
          p_revisione: dettaglio.misura.revisione,
          p_motivo: riferimento,
        });
      await aggiorna();
      setDettaglio(null);
      setTab("misure");
    });
  const preparaSal = () => {
    if (!risultato && (selezionate.length || noteSal)) {
      setTab("sal");
      return;
    }
    richiesta.current = crypto.randomUUID();
    setTab("sal");
    setSelezionate([]);
    setRisultato(null);
    setErrore("");
    setNoteSal("");
    setDataSal(oggi());
  };
  const salValidi = (q.data?.sal ?? []).filter(s => ["verificato", "pagato"].includes(s.stato));
  const salConMisure = new Set(misure.filter(m => m.stato === "riconosciuta").map(m => m.sal_id));
  const salPerQuantita = salValidi.filter(s => salConMisure.has(s.id))
    .sort((a, b) => b.numero_sal - a.numero_sal);
  const consultaStorico = !risultato && disponibiliSal.length === 0;
  const salMostrato = risultato ? salValidi.find(s => s.id === risultato.id)
    : consultaStorico ? salPerQuantita.find(s => s.id === storicoSelezionato) ?? salPerQuantita[0] : undefined;
  const salPrecedenti = new Set(salValidi.filter(s =>
    Number(s.importo_lordo) > 0 && (!salMostrato || s.numero_sal < salMostrato.numero_sal),
  ).map(s => s.id));
  const misurePrecedenti = misure.filter(m => m.stato === "riconosciuta" && m.sal_id && salPrecedenti.has(m.sal_id));
  const periodoSelezionato = new Set(selezionate);
  const misurePeriodo = salMostrato
    ? misure.filter(m => m.sal_id === salMostrato.id && m.stato === "riconosciuta")
    : disponibiliSal.filter(m => periodoSelezionato.has(m.id));
  const revisioniPeriodo = new Set(misurePeriodo.map(m => m.quadro_id));
  const baseSal = q.data?.quadri.find(base => revisioniPeriodo.has(base.id)) ?? quadro;
  const avanzamento = tab === "sal" && baseSal && (!consultaStorico || salMostrato) ? avanzamentoVociSalSub(
    baseSal.voci, misurePrecedenti, misurePeriodo, [...salPrecedenti].every(id => salConMisure.has(id)),
  ) : [];
  let lavoriSal = 0;
  try {
    lavoriSal = misurePerSalSub(misure, selezionate).importo;
  } catch {
    /* Nessuna selezione pronta. */
  }
  // Gli oneri della sicurezza maturano con i lavori: la quota la calcola il server con la stessa regola.
  const oneriSal = lavoriSal > 0
    ? quotaOneriSal(Number(c.oneri_sicurezza) || 0, Number(c.importo_contrattuale) || 0, q.data?.sal ?? [], lavoriSal)
    : 0;
  const totaleSal = Math.round((lavoriSal + oneriSal) * 100) / 100;
  const creaSal = () =>
    esegui(async () => {
      misurePerSalSub(misure, selezionate);
      const r = await rpc("subappalto_sal_da_misure", {
        p_company: companyId,
        p_contratto: c.id,
        p_id: richiesta.current,
        p_misure: selezionate,
        p_data: dataSal,
        p_ritenuta: parseDecimalIT(ritenuta),
        p_note: noteSal.trim() || null,
      });
      setRisultato(r);
      setSelezionate([]);
      await aggiorna();
    });
  const rigaBozza = (id: string, patch: Partial<Bozza>) =>
    setBozza((v) => v.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <>
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) chiudi();
        }}
      >
        <DialogContent
          className="flex h-[92dvh] max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>
              {tTesto("Lavori e quantità · {contratto}", { contratto: c.numero_contratto || tTesto("Subappalto") })}
            </DialogTitle>
            <DialogDescription>
              {tTesto("Registra i lavori eseguiti, verifica le quantità e prepara il SAL.")}
            </DialogDescription>
          </DialogHeader>
          {!lettura ? (
            <p role="alert" className="p-6">
              {tTesto("Non hai accesso ai dati economici di questo subappalto.")}
            </p>
          ) : q.isLoading ? (
            <p role="status" className="p-6">
              {tTesto("Caricamento lavori e misure…")}
            </p>
          ) : q.isError ? (
            <div role="alert" className="p-6">
              {q.error.message}
              <Button variant="outline" onClick={() => void q.refetch()}>
                {tTesto("Riprova")}
              </Button>
            </div>
          ) : (
            <>
              {!modifica && !dettaglio && (
                <nav
                  className="grid shrink-0 grid-cols-3 gap-2 border-b px-4 py-2"
                  aria-label={tTesto("Sezioni lavori subappalto")}
                >
                  {(["lavori", "misure", "sal"] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      className="h-auto min-h-10 whitespace-normal px-2"
                      aria-label={
                        t === "lavori"
                          ? tTesto("Lavori affidati")
                          : t === "misure"
                            ? tTesto("Rilevazioni e verifiche")
                            : tTesto("Prepara SAL")
                      }
                      variant={tab === t ? "default" : "outline"}
                      disabled={busy || (!quadro && t !== "lavori")}
                      aria-pressed={tab === t}
                      onClick={() => {
                        if (t === "sal") preparaSal();
                        else {
                          setTab(t);
                        }
                      }}
                    >
                      <span className="hidden sm:inline" aria-hidden="true">
                        {t === "lavori"
                          ? tTesto("Lavori affidati")
                          : t === "misure"
                            ? tTesto("Rilevazioni e verifiche")
                            : tTesto("Prepara SAL")}
                      </span>
                      <span className="sm:hidden" aria-hidden="true">
                        {t === "lavori"
                          ? tTesto("Lavori")
                          : t === "misure"
                            ? tTesto("Verifiche")
                            : "SAL"}
                      </span>
                      {t === "misure" && daVerificare > 0 && (
                        <span
                          aria-hidden="true"
                          className="ml-2 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900"
                        >
                          {daVerificare}
                        </span>
                      )}
                      {t === "sal" && disponibiliSal.length > 0 && (
                        <span
                          aria-hidden="true"
                          className="ml-2 rounded-full bg-emerald-100 px-1.5 text-xs text-emerald-900"
                        >
                          {disponibiliSal.length}
                        </span>
                      )}
                    </Button>
                  ))}
                </nav>
              )}
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
                {!modifica && !dettaglio && tab === "sal" && avanzamento.length > 0 && (
                  <AvanzamentoVociSub righe={avanzamento} numero={salMostrato?.numero_sal}
                    selettore={consultaStorico && salPerQuantita.length > 1 && salMostrato
                      ? <OfficeSelect label={tTesto("SAL da consultare")} value={salMostrato.id} onValueChange={setStoricoSelezionato}
                        className="h-8 w-28" options={salPerQuantita.map(s => ({ value: s.id, label: `SAL ${s.numero_sal}` }))} />
                      : null} />
                )}
                {!modifica && !dettaglio && !risultato && quadro && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p>
                      <span className="font-medium">{tTesto("{daVerificare} da verificare", { daVerificare: String(daVerificare ?? "") })}</span>
                      <span
                        className="mx-2 text-muted-foreground"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-medium">
                        {euroSub(valorePronto)}
                      </span>{" "}
                      {tTesto("pronti per il SAL")}
                    </p>
                    {tab === "lavori" &&
                      (daVerificare > 0 ? (
                        <Button size="sm" onClick={() => setTab("misure")}>
                          {tTesto("Verifica rilevazioni")}
                        </Button>
                      ) : disponibiliSal.length > 0 ? (
                        <Button size="sm" onClick={preparaSal}>
                          {tTesto("Continua al SAL")}
                        </Button>
                      ) : null)}
                  </div>
                )}
                {modifica ? (
                  <fieldset disabled={busy} className="space-y-4">
                    <div className="rounded-md bg-muted p-3 text-sm">{tTesto("Le voci devono totalizzare {valore}. Oneri separati: {valore2}. Questa base operativa non modifica il contratto firmato e non certifica lavori eseguiti.", { valore: euroSub(Number(c.importo_contrattuale)), valore2: euroSub(Number(c.oneri_sicurezza)) })}</div>
                    {bozza.map((v, i) => (
                      <div
                        key={v.id}
                        className="space-y-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-sm">{tTesto("Voce {i}", { i: i + 1 })}</strong>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={bozza.length === 1}
                            onClick={() =>
                              setBozza((r) => r.filter((x) => x.id !== v.id))
                            }
                          >
                            {tTesto("Rimuovi voce")}
                          </Button>
                        </div>
                        <label className="block text-sm">
                          {tTesto("Lavoro affidato")}
                          <Input
                            value={v.descrizione}
                            maxLength={2000}
                            onChange={(e) =>
                              rigaBozza(v.id, { descrizione: e.target.value })
                            }
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-4">
                          <label className="grid gap-1 text-sm">
                            {tTesto("Calcolo del compenso")}
                            <UniformSelect
                              className={selettore}
                              value={v.base}
                              onChange={(e) => {
                                const b = e.target.value as VoceSub["base"];
                                rigaBozza(v.id, {
                                  base: b,
                                  unita:
                                    b === "corpo"
                                      ? "quota"
                                      : b === "ore"
                                        ? "h"
                                        : "mq",
                                  quantita: b === "corpo" ? "1" : v.quantita,
                                });
                              }}
                            >
                              <option value="corpo">{tTesto("A corpo")}</option>
                              <option value="misura">{tTesto("A misura")}</option>
                              <option value="ore">{tTesto("A ore")}</option>
                            </UniformSelect>
                          </label>
                          <label className="text-sm">
                            {tTesto("Quantità affidata")}
                            <Input
                              inputMode="decimal"
                              value={v.quantita}
                              disabled={v.base === "corpo"}
                              onChange={(e) =>
                                rigaBozza(v.id, { quantita: e.target.value })
                              }
                            />
                          </label>
                          <label className="text-sm">
                            {tTesto("Unità")}
                            <Input
                              value={v.unita}
                              disabled={v.base !== "misura"}
                              maxLength={15}
                              onChange={(e) =>
                                rigaBozza(v.id, { unita: e.target.value })
                              }
                            />
                          </label>
                          <label className="text-sm">
                            {v.base === "corpo"
                              ? tTesto("Prezzo dell’intero lavoro (€)")
                              : tTesto("Prezzo unitario (€)")}
                            <Input
                              inputMode="decimal"
                              value={v.prezzo}
                              onChange={(e) =>
                                rigaBozza(v.id, { prezzo: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm">
                          {tTesto("Lavorazione della commessa (facoltativa)")}
                          <UniformSelect
                            className={selettore}
                            value={v.fase_id}
                            onChange={(e) => {
                              const fase = fasi.data?.find(
                                (f) => f.id === e.target.value,
                              );
                              rigaBozza(v.id, {
                                fase_id: e.target.value,
                                ...(fase ? { descrizione: fase.name } : {}),
                              });
                            }}
                          >
                            <option value="">{tTesto("Nessun collegamento")}</option>
                            {fasi.data?.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </UniformSelect>
                        </label>
                      </div>
                    ))}
                    {fasi.isError && (
                      <p role="alert" className="text-sm text-amber-800">
                        {tTesto("Lavorazioni non disponibili: puoi compilare la voce senza collegamento.")}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      disabled={bozza.length >= 100}
                      onClick={() =>
                        setBozza((v) => [
                          ...v,
                          daVoce({
                            id: crypto.randomUUID(),
                            fase_id: null,
                            descrizione: "",
                            base: "misura",
                            unita: "mq",
                            quantita: 1,
                            prezzo: 0,
                          }),
                        ])
                      }
                    >
                      {tTesto("Aggiungi lavoro")}
                    </Button>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        {tTesto("Quando matura il compenso")}
                        <UniformSelect
                          className={selettore}
                          value={maturazione}
                          onChange={(e) => setMaturazione(e.target.value)}
                        >
                          <option value="">{tTesto("Scegli dal contratto")}</option>
                          <option value="saldo">{tTesto("Saldo a fine lavoro")}</option>
                          <option value="sal_periodici">{tTesto("SAL periodici")}</option>
                          <option value="traguardi">
                            {tTesto("Traguardi concordati")}
                          </option>
                        </UniformSelect>
                      </label>
                      <label className="text-sm">
                        {tTesto("Giorni di pagamento, se pattuiti")}
                        <Input
                          inputMode="numeric"
                          value={giorni}
                          onChange={(e) => setGiorni(e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tTesto("I giorni non generano una scadenza: evento di decorrenza e condizioni rimangono quelli del contratto.")}
                    </p>
                    <label className="block text-sm">
                      {tTesto("Motivo e riferimento della base lavori")}
                      <Textarea
                        value={motivo}
                        maxLength={2000}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </label>
                    <p
                      className={`font-medium ${Math.abs(totale - Number(c.importo_contrattuale)) > 0.005 ? "text-amber-800" : ""}`}
                    >
                      {tTesto("Totale voci:")}{" "}
                      {Number.isFinite(totale)
                        ? euroSub(totale)
                        : tTesto("Da completare")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setModifica(false)}
                      >
                        {tTesto("Annulla modifica")}
                      </Button>
                      <Button
                        disabled={
                          !scrittura ||
                          !maturazione ||
                          motivo.trim().length < 5 ||
                          !Number.isFinite(totale) ||
                          Math.abs(totale - Number(c.importo_contrattuale)) >
                            0.005
                        }
                        onClick={() => void salvaElenco()}
                      >
                        {tTesto("Conferma base lavori")}
                      </Button>
                    </div>
                  </fieldset>
                ) : dettaglio ? (
                  <fieldset
                    disabled={busy}
                    className="mx-auto max-w-2xl space-y-4"
                  >
                    <Button
                      variant="outline"
                      onClick={() => setDettaglio(null)}
                    >
                      {tTesto("Annulla e torna alle misure")}
                    </Button>
                    <h3 className="font-semibold">
                      {dettaglio.tipo === "rileva"
                        ? tTesto("Nuova rilevazione")
                        : dettaglio.tipo === "verifica"
                          ? tTesto("Verifica della quantità")
                          : tTesto("Annullamento documentato")}{" "}
                      · {dettaglio.voce.descrizione}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {dettaglio.tipo !== "rileva" && (
                        <>{tTesto("Dichiarata: {valore}.", { valore: String(quantitaSub(
                            Number(dettaglio.misura.quantita_dichiarata),
                            dettaglio.voce,
                          ) ?? "") })}{" "}</>
                      )}
                      {tTesto("La verifica non registra un SAL o un pagamento.")}
                    </p>
                    {dettaglio.tipo === "rileva" && (
                      <label className="block text-sm">
                        {tTesto("Data della rilevazione")}
                        <Input
                          type="date"
                          max={oggi()}
                          value={data}
                          onChange={(e) => setData(e.target.value)}
                        />
                      </label>
                    )}
                    {dettaglio.tipo !== "annulla" && (
                      <label className="block text-sm">
                        {dettaglio.tipo === "verifica"
                          ? tTesto("Quantità riconosciuta")
                          : tTesto("Quantità dichiarata nel periodo")}{" "}
                        (
                        {dettaglio.voce.base === "corpo"
                          ? tTesto("% dell’intero lavoro")
                          : dettaglio.voce.unita}
                        )
                        <Input
                          inputMode="decimal"
                          value={quantita}
                          onChange={(e) => setQuantita(e.target.value)}
                        />
                      </label>
                    )}
                    <label className="block text-sm">
                      {dettaglio.tipo === "annulla"
                        ? tTesto("Motivo dell’annullamento")
                        : tTesto("Riscontro e riferimento (rapportino, misura o verifica)")}
                      <Textarea
                        value={riferimento}
                        maxLength={2000}
                        onChange={(e) => setRiferimento(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={
                        !scrittura ||
                        riferimento.trim().length < 5 ||
                        (dettaglio.tipo !== "annulla" && !quantita)
                      }
                      onClick={() => void salvaMisura()}
                    >
                      {dettaglio.tipo === "rileva"
                        ? tTesto("Registra rilevazione")
                        : dettaglio.tipo === "verifica"
                          ? tTesto("Riconosci quantità")
                          : tTesto("Annulla rilevazione")}
                    </Button>
                  </fieldset>
                ) : tab === "lavori" || !quadro ? (
                  <>
                    {!quadro ? (
                      <div className="rounded-lg border border-dashed p-6">
                        <h3 className="font-semibold">
                          {tTesto("Definisci che cosa è affidato al subappaltatore")}
                        </h3>
                        <p className="my-3 text-sm text-muted-foreground">
                          {tTesto("Una voce per un lavoro a corpo, oppure quantità e prezzi per misure e ore. I dati del contratto sono già disponibili.")}
                        </p>
                        {storici ? (
                          <div className="space-y-3">
                            <p role="alert" className="text-sm text-amber-800">
                              {tTesto("Questo contratto ha SAL già registrati. Per attivare le quantità occorre prima riconciliare lo storico. Puoi continuare a consultare SAL, verbali e ritenute esistenti.")}
                            </p>
                            {onApriStorico && (
                              <Button variant="outline" onClick={onApriStorico}>
                                {tTesto("Consulta SAL registrati")}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button disabled={!scrittura} onClick={iniziaElenco}>
                            {tTesto("Imposta elenco lavori")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm">{tTesto("Base lavori · Rev. {revisione} · {valore}", { revisione: String(quadro.revisione ?? ""), valore: euroSub(Number(quadro.importo_lavori)) })}</p>
                          {(riconosciute || storici) && (
                            <span className="text-xs text-muted-foreground">
                              {riconosciute
                                ? tTesto("Elenco bloccato: ci sono misure già verificate. Per cambiare l'importo serve una variante.")
                                : tTesto("Elenco bloccato: il contratto ha SAL già registrati.")}
                            </span>
                          )}
                          {!riconosciute && !storici && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!scrittura}
                              onClick={iniziaElenco}
                            >
                              {tTesto("Rivedi elenco")}
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="block w-full text-left text-sm md:table md:min-w-[680px]">
                            <thead className="hidden bg-muted md:table-header-group">
                              <tr>
                                {[
                                  "Lavoro",
                                  "Affidato",
                                  "Riconosciuto",
                                  "Residuo quantità",
                                  "Da contabilizzare",
                                  "",
                                ].map((h, i) => (
                                  <th key={i} className="p-3">
                                    {h ? tTesto(h) : h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="block md:table-row-group">
                              {quadro.voci.map((v) => {
                                const r = riepilogoVoceSub(v, misure);
                                const fatto = fattoInCantiere(v, cantiere.data ?? []);
                                const nomeFase = fasi.data?.find((f) => f.id === v.fase_id)?.name;
                                // Quanto del fatto in cantiere non è ancora né riconosciuto né dichiarato.
                                const inAttesa = misure.filter((m) => m.voce_id === v.id && m.stato === "dichiarata").reduce((s, m) => s + Number(m.quantita_dichiarata), 0);
                                const daDichiarare = fatto == null ? 0 : Math.round(Math.max(0, fatto - r.riconosciuta - inAttesa) * 10000) / 10000;
                                return (
                                  <tr
                                    key={v.id}
                                    className="block border-t p-3 first:border-t-0 md:table-row md:p-0"
                                  >
                                    <td className="block pb-3 md:table-cell md:p-3">
                                      {nomeFase && <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{nomeFase}</span>}
                                      <strong>{v.descrizione}</strong>
                                      {fatto != null && <span className="block text-xs text-muted-foreground">{tTesto("In cantiere: {fatto}", { fatto: String(quantitaSub(fatto, v) ?? "") })}</span>}
                                      <p className="text-xs text-muted-foreground">
                                        {v.base === "corpo"
                                          ? tTesto("A corpo")
                                          : v.base === "ore"
                                            ? tTesto("A ore")
                                            : tTesto("A misura")}{" "}
                                        · {euroSub(v.prezzo)}
                                        {v.base === "corpo"
                                          ? ""
                                          : `/${v.unita}`}
                                      </p>
                                    </td>
                                    <td
                                      data-label="Affidato"
                                      className="flex flex-wrap items-center justify-between gap-2 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                    >
                                      {quantitaSub(v.quantita, v)}
                                    </td>
                                    <td
                                      data-label="Riconosciuto"
                                      className="flex flex-wrap items-center justify-between gap-2 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                    >
                                      {quantitaSub(r.riconosciuta, v)}
                                      {r.daVerificare > 0 && (
                                        <p className="text-xs text-amber-800">{tTesto("{daVerificare} da verificare", { daVerificare: String(r.daVerificare ?? "") })}</p>
                                      )}
                                    </td>
                                    <td
                                      data-label={tTesto("Residuo quantità")}
                                      className="flex flex-wrap items-center justify-between gap-2 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                    >
                                      {quantitaSub(r.residua, v)}
                                    </td>
                                    <td
                                      data-label={tTesto("Da contabilizzare")}
                                      className="flex flex-wrap items-center justify-between gap-2 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                    >
                                      {euroSub(r.nonContabilizzato)}
                                    </td>
                                    <td className="block pt-3 md:table-cell md:p-3 [&>button]:w-full md:[&>button]:w-auto">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!scrittura}
                                        onClick={() =>
                                          mostraDettaglio({
                                            tipo: "rileva",
                                            voce: v,
                                          })
                                        }
                                      >
                                        {tTesto("Rileva quantità")}
                                      </Button>
                                      {daDichiarare > 0 && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="mt-1"
                                          disabled={!scrittura}
                                          onClick={() => {
                                            mostraDettaglio({ tipo: "rileva", voce: v });
                                            setQuantita(String(Math.round(daDichiarare * (v.base === "corpo" ? 100 : 1) * 10000) / 10000));
                                            setRiferimento("Dal cantiere");
                                          }}
                                        >{tTesto("Dal cantiere: {daDichiarare}", { daDichiarare: String(quantitaSub(daDichiarare, v) ?? "") })}</Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium">
                            {tTesto("Come registrare le quantità")}
                          </summary>
                          <p className="mt-2 leading-relaxed">
                            {tTesto("Le rilevazioni si aggiungono nel periodo, non sono percentuali cumulative da sommare. Per un lavoro a corpo 100% equivale a una quota completa. Le date e percentuali del calendario non riconoscono importi da sole.")}
                          </p>
                        </details>
                        <details className="rounded-lg border p-3 text-sm">
                          <summary>{tTesto("Base e condizioni registrate")}</summary>
                          <p className="mt-2">{quadro.motivo}</p>
                          <p>
                            {tTesto("Maturazione:")}{" "}
                            {quadro.maturazione === "saldo"
                              ? tTesto("Saldo a fine lavoro")
                              : quadro.maturazione === "sal_periodici"
                                ? tTesto("SAL periodici")
                                : tTesto("Traguardi concordati")}{" "}
                            {tTesto("· Giorni pattuiti:")}{" "}
                            {quadro.giorni_pagamento ?? tTesto("non definiti")}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {tTesto("Dopo il riconoscimento delle quantità la base non viene riscritta: le variazioni richiedono un percorso dedicato.")}
                          </p>
                        </details>
                      </>
                    )}
                  </>
                ) : tab === "misure" ? (
                  <>
                    {!misure.length ? (
                      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
                        {tTesto("Nessuna rilevazione. Parti da “Lavori affidati” e scegli il lavoro.")}
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="block w-full text-left text-sm md:table md:min-w-[700px]">
                          <thead className="hidden bg-muted md:table-header-group">
                            <tr>
                              {[
                                "Rilevazione",
                                "Dichiarata",
                                "Riconosciuta",
                                "Valore",
                                "Stato / azione",
                              ].map((h) => (
                                <th className="p-3" key={h}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="block md:table-row-group">
                            {misure.map((m) => {
                              const v = q.data?.quadri
                                .find((r) => r.id === m.quadro_id)
                                ?.voci.find((v) => v.id === m.voce_id);
                              return (
                                <tr
                                  key={m.id}
                                  className="block border-t p-3 first:border-t-0 md:table-row md:p-0"
                                >
                                  <td className="block pb-3 md:table-cell md:max-w-xs md:p-3">
                                    <strong>
                                      {v?.descrizione ||
                                        tTesto("Voce di una base precedente")}
                                    </strong>
                                    <p className="text-xs text-muted-foreground">{tTesto("{valore} · Rif. {id}", { valore: m.data_rilievo
                                        .split("-")
                                        .reverse()
                                        .join("/"), id: m.id.slice(0, 8) })}</p>
                                    <details className="mt-1 text-xs">
                                      <summary>{tTesto("Riscontri e verifica")}</summary>
                                      <p>{m.riferimento}</p>
                                      {m.nota_verifica && (
                                        <p>{tTesto("Verifica: {nota_verifica}", { nota_verifica: String(m.nota_verifica ?? "") })}</p>
                                      )}
                                      {m.verificato_il && (
                                        <p>{tTesto("Registrata il {valore}", { valore: new Date(
                                            m.verificato_il,
                                          ).toLocaleString(intlCampo()) })}</p>
                                      )}
                                      {m.nota_annullamento && (
                                        <p>{tTesto("Annullamento: {nota_annullamento}", { nota_annullamento: String(m.nota_annullamento ?? "") })}</p>
                                      )}
                                    </details>
                                  </td>
                                  <td
                                    data-label="Dichiarata"
                                    className="flex items-center justify-between gap-3 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                  >
                                    {v
                                      ? quantitaSub(
                                          Number(m.quantita_dichiarata),
                                          v,
                                        )
                                      : m.quantita_dichiarata}
                                  </td>
                                  <td
                                    data-label="Riconosciuta"
                                    className="flex items-center justify-between gap-3 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                  >
                                    {m.quantita_riconosciuta == null
                                      ? tTesto("Da verificare")
                                      : v
                                        ? quantitaSub(
                                            Number(m.quantita_riconosciuta),
                                            v,
                                          )
                                        : m.quantita_riconosciuta}
                                  </td>
                                  <td
                                    data-label="Valore"
                                    className="flex items-center justify-between gap-3 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                  >
                                    {m.importo_riconosciuto == null
                                      ? "—"
                                      : euroSub(Number(m.importo_riconosciuto))}
                                  </td>
                                  <td className="block pt-3 md:table-cell md:p-3">
                                    <p>
                                      {m.sal_id
                                        ? tTesto("Nel SAL")
                                        : m.stato === "riconosciuta"
                                          ? tTesto("Riconosciuta, non contabilizzata")
                                          : m.stato === "annullata"
                                            ? tTesto("Annullata")
                                            : tTesto("Da verificare")}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {m.sal_id && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={busy}
                                          onClick={() =>
                                            void esegui(() =>
                                              onApriVerbale(m.sal_id!),
                                            )
                                          }
                                        >
                                          {tTesto("Verbale SAL")}
                                        </Button>
                                      )}
                                      {v && m.stato === "dichiarata" && (
                                        <Button
                                          size="sm"
                                          disabled={
                                            !scrittura ||
                                            m.quadro_id !== quadro?.id
                                          }
                                          onClick={() =>
                                            mostraDettaglio({
                                              tipo: "verifica",
                                              misura: m,
                                              voce: v,
                                            })
                                          }
                                        >
                                          {tTesto("Verifica")}
                                        </Button>
                                      )}
                                      {v && m.stato === "dichiarata" && m.quadro_id !== quadro?.id && (
                                        <span className="text-xs text-muted-foreground">
                                          {tTesto("Rilevata su un elenco precedente: annullala e rilevala di nuovo.")}
                                        </span>
                                      )}
                                      {v &&
                                        m.stato !== "annullata" &&
                                        !m.sal_id && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={!scrittura}
                                            onClick={() =>
                                              mostraDettaglio({
                                                tipo: "annulla",
                                                misura: m,
                                                voce: v,
                                              })
                                            }
                                          >
                                            {tTesto("Annulla")}
                                          </Button>
                                        )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : risultato ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
                    <h3 className="font-semibold">{tTesto("SAL #{numero_sal} registrato dalle misure", { numero_sal: String(risultato.numero_sal ?? "") })}</h3>
                    <p className="my-3 text-sm">
                      {tTesto("Le fonti sono collegate al SAL e non sono selezionabili una seconda volta. Non è stato registrato un pagamento.")}
                    </p>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void esegui(() => onApriVerbale(risultato.id))
                      }
                    >
                      {tTesto("Prepara verbale SAL")}
                    </Button>
                  </div>
                ) : disponibiliSal.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6">
                    <h3 className="font-semibold">
                      {tTesto("Nessun lavoro pronto per un nuovo SAL")}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {daVerificare > 0
                        ? tTesto("Ci sono rilevazioni da verificare. Riconosci le quantità prima di inserirle nel SAL.")
                        : tTesto("Le quantità già inserite nei SAL restano nello storico. Registra una nuova rilevazione per contabilizzare altro lavoro.")}
                    </p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() =>
                        setTab(daVerificare > 0 ? "misure" : "lavori")
                      }
                    >
                      {daVerificare > 0
                        ? tTesto("Vai alle verifiche")
                        : tTesto("Vai ai lavori affidati")}
                    </Button>
                  </div>
                ) : (
                  <fieldset disabled={busy} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {tTesto("Seleziona soltanto i lavori riconosciuti da includere in questo SAL. Gli importi del periodo usano i prezzi della base lavori.")}
                    </p>
                    <div className="divide-y rounded-lg border">
                      {misure
                        .filter(
                          (m) =>
                            m.stato === "riconosciuta" &&
                            !m.sal_id &&
                            Number(m.importo_riconosciuto) > 0,
                        )
                        .map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center gap-3 p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selezionate.includes(m.id)}
                              onChange={(e) =>
                                setSelezionate((ids) =>
                                  e.target.checked
                                    ? [...ids, m.id]
                                    : ids.filter((id) => id !== m.id),
                                )
                              }
                            />
                            <span className="flex-1">
                              {quadro?.voci.find((v) => v.id === m.voce_id)
                                ?.descrizione || tTesto("Lavoro riconosciuto")}
                              <small className="block text-muted-foreground">
                                {(() => {
                                  const voce = quadro?.voci.find(v => v.id === m.voce_id);
                                  return voce ? `${quantitaSub(Number(m.quantita_riconosciuta), voce)} · ` : "";
                                })()}{tTesto("{data} · Rif. {id}", { data: String(m.data_rilievo ?? ""), id: m.id.slice(0, 8) })}
                              </small>
                            </span>
                            <strong>
                              {euroSub(Number(m.importo_riconosciuto))}
                            </strong>
                          </label>
                        ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        {tTesto("Data SAL")}
                        <Input
                          type="date"
                          max={oggi()}
                          value={dataSal}
                          onChange={(e) => setDataSal(e.target.value)}
                        />
                      </label>
                      <label className="text-sm">
                        {tTesto("Ritenuta di garanzia (%)")}
                        <Input
                          inputMode="decimal"
                          value={ritenuta}
                          onChange={(e) => setRitenuta(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      {tTesto("Note del SAL")}
                      <Textarea
                        value={noteSal}
                        maxLength={6000}
                        onChange={(e) => setNoteSal(e.target.value)}
                      />
                    </label>
                    <p className="font-semibold">{tTesto("Lordo del periodo: {totaleSal}", { totaleSal: euroSub(totaleSal) })}</p>
                    {oneriSal > 0 && (
                      <p className="text-xs text-muted-foreground">{tTesto("Lavori {lavoriSal} + oneri della sicurezza {oneriSal} (in proporzione ai lavori; l'ultimo SAL prende il residuo)", { lavoriSal: euroSub(lavoriSal), oneriSal: euroSub(oneriSal) })}</p>
                    )}
                    <p className="text-sm">{tTesto("Ritenuta: {valore} · Netto SAL: {valore2}", { valore: euroSub(
                        Math.round(
                          totaleSal * (parseDecimalIT(ritenuta) || 0),
                        ) / 100,
                      ), valore2: euroSub(
                        totaleSal -
                          Math.round(
                            totaleSal * (parseDecimalIT(ritenuta) || 0),
                          ) /
                            100,
                      ) })}</p>
                    <p className="text-xs text-muted-foreground">
                      {tTesto("La numerazione viene assegnata dal server. Il SAL è registrato come verificato sulle misure riconosciute. Non genera fattura, scadenza o pagamento; la ritenuta segue i controlli fiscali esistenti.")}
                    </p>
                  </fieldset>
                )}
              </div>
              {errore && (
                <p
                  role="alert"
                  className="shrink-0 border-t bg-red-50 px-4 py-2 text-sm text-red-700"
                >
                  {errore}
                </p>
              )}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background p-3">
                <Button variant="outline" disabled={busy} onClick={chiudi}>
                  {tTesto("Chiudi")}
                </Button>
                {tab === "sal" &&
                  !modifica &&
                  !dettaglio &&
                  !risultato &&
                  disponibiliSal.length > 0 && (
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                      <span className="text-sm">
                        <span className="text-muted-foreground">{tTesto("{n} selezionate · Lordo", { n: selezionate.length })}{" "}</span>
                        <strong>{euroSub(totaleSal)}</strong>
                      </span>
                      <Button
                        disabled={
                          busy || !scrittura || !(totaleSal > 0) || !dataSal
                        }
                        onClick={() => void creaSal()}
                      >
                        {busy ? tTesto("Registrazione…") : tTesto("Registra SAL verificato")}
                      </Button>
                    </div>
                  )}
                {busy && (
                  <span role="status" className="text-sm text-muted-foreground">
                    {tTesto("Operazione in corso…")}
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={uscita} onOpenChange={setUscita}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tTesto("Chiudere senza registrare?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tTesto("I dati del modulo non ancora confermati andranno persi. Le rilevazioni e i SAL già registrati restano conservati.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tTesto("Continua modifica")}</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              {tTesto("Chiudi modulo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


function AvanzamentoVociSub({ righe, numero, selettore }: {
  righe: RigaAvanzamentoSalSub[]; numero?: number; selettore: React.ReactNode;
}) {
  const t = useT();
  return <section className="mb-4 space-y-2" aria-labelledby="titolo-avanzamento-sal-sub">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="titolo-avanzamento-sal-sub" className="text-sm font-semibold">
        {numero ? t("Quantità a tutto il SAL {numero}", { numero: String(numero ?? "") }) : t("Quantità del SAL")}
      </h3>
      {selettore}
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr><th scope="col" className="px-3 py-2 text-left">{t("Lavorazione")}</th>
            {["Affidata", "Già contabilizzata", "Nel periodo", "Cumulata"].map(titolo =>
              <th key={titolo} scope="col" className="px-2 py-2 text-right">{t(titolo)}</th>)}</tr>
        </thead>
        <tbody>
          {righe.map(riga => {
            const qta = (n: number | null) => n == null ? "—" : quantitaSub(n, {
              base: riga.base === "corpo" ? "corpo" : "misura", unita: riga.unita,
            });
            return <tr key={riga.voce_id} className="border-t">
              <th scope="row" className="px-3 py-2 text-left font-medium">{riga.descrizione}
                <span className="block text-xs font-normal text-muted-foreground">
                  {euroSub(riga.prezzo)}{riga.base === "corpo" ? ` ${t("a corpo")}` : ` / ${riga.unita}`}</span></th>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{qta(riga.affidata)}</td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{qta(riga.precedente)}</td>
              <td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums">{qta(riga.periodo)}</td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{qta(riga.cumulata)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {righe.some(riga => riga.precedente == null) &&
      <p className="text-xs text-muted-foreground">{t("Per alcune quantità precedenti mancano le misure storiche.")}</p>}
  </section>;
}
