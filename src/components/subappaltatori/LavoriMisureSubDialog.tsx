import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { Button } from "@/components/ui/button";
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
  quotaOneriSal,
} from "@/lib/subappaltatori/lavoriMisure";

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
  const p = usePermissions(),
    qc = useQueryClient();
  const lettura = p.canViewCosts && p.canViewSubappaltatoriAmministrazione;
  const scrittura = lettura && p.canEditOrders && !p.solaLettura;
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
    queryKey: ["subappalto-lavori-misure", companyId, c.id],
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
          .select("id,stato,importo_lordo,oneri_quota")
          .eq("company_id", companyId)
          .eq("contratto_id", c.id)
          .limit(1001),
      ]);
      if (a.error || b.error || s.error)
        throw Error("Lettura lavori, misure o SAL non riuscita");
      const misure = (b.data ?? []) as unknown as MisuraSub[];
      const sal = (s.data ?? []) as unknown as {
        id: string;
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
          "Storico oltre il limite di questa vista: non è possibile mostrare totali parziali",
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
    enabled: modifica && scrittura,
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
        throw Error("Troppe lavorazioni per questo selettore");
      return data ?? [];
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
      setErrore(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
      bloccato.current = false;
    }
  };
  const iniziaElenco = () => {
    richiesta.current = crypto.randomUUID();
    setBozza(
      quadro
        ? quadro.voci.map(daVoce)
        : vociDaAllegato(c.elenco_lavori, Number(c.importo_contrattuale))?.map(daVoce) ?? [
            daVoce({
              id: crypto.randomUUID(),
              fase_id: null,
              descrizione: c.descrizione_lavori,
              base: "corpo",
              unita: "quota",
              quantita: 1,
              prezzo: Number(c.importo_contrattuale),
            }),
          ],
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
    fase_id: v.fase_id || null,
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
              Lavori e quantità · {c.numero_contratto || "Subappalto"}
            </DialogTitle>
            <DialogDescription>
              Registra i lavori eseguiti, verifica le quantità e prepara il SAL.
            </DialogDescription>
          </DialogHeader>
          {!lettura ? (
            <p role="alert" className="p-6">
              Non hai accesso ai dati economici di questo subappalto.
            </p>
          ) : q.isLoading ? (
            <p role="status" className="p-6">
              Caricamento lavori e misure…
            </p>
          ) : q.isError ? (
            <div role="alert" className="p-6">
              {q.error.message}
              <Button variant="outline" onClick={() => void q.refetch()}>
                Riprova
              </Button>
            </div>
          ) : (
            <>
              {!modifica && !dettaglio && (
                <nav
                  className="grid shrink-0 grid-cols-3 gap-2 border-b px-4 py-2"
                  aria-label="Sezioni lavori subappalto"
                >
                  {(["lavori", "misure", "sal"] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      className="h-auto min-h-10 whitespace-normal px-2"
                      aria-label={
                        t === "lavori"
                          ? "Lavori affidati"
                          : t === "misure"
                            ? "Rilevazioni e verifiche"
                            : "Prepara SAL"
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
                          ? "Lavori affidati"
                          : t === "misure"
                            ? "Rilevazioni e verifiche"
                            : "Prepara SAL"}
                      </span>
                      <span className="sm:hidden" aria-hidden="true">
                        {t === "lavori"
                          ? "Lavori"
                          : t === "misure"
                            ? "Verifiche"
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
                {!modifica && !dettaglio && !risultato && quadro && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p>
                      <span className="font-medium">
                        {daVerificare} da verificare
                      </span>
                      <span
                        className="mx-2 text-muted-foreground"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="font-medium">
                        {euroSub(valorePronto)}
                      </span>{" "}
                      pronti per il SAL
                    </p>
                    {tab === "lavori" &&
                      (daVerificare > 0 ? (
                        <Button size="sm" onClick={() => setTab("misure")}>
                          Verifica rilevazioni
                        </Button>
                      ) : disponibiliSal.length > 0 ? (
                        <Button size="sm" onClick={preparaSal}>
                          Continua al SAL
                        </Button>
                      ) : null)}
                  </div>
                )}
                {modifica ? (
                  <fieldset disabled={busy} className="space-y-4">
                    <div className="rounded-md bg-muted p-3 text-sm">
                      Le voci devono totalizzare{" "}
                      {euroSub(Number(c.importo_contrattuale))}. Oneri separati:{" "}
                      {euroSub(Number(c.oneri_sicurezza))}. Questa base
                      operativa non modifica il contratto firmato e non
                      certifica lavori eseguiti.
                    </div>
                    {bozza.map((v, i) => (
                      <div
                        key={v.id}
                        className="space-y-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-sm">Voce {i + 1}</strong>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={bozza.length === 1}
                            onClick={() =>
                              setBozza((r) => r.filter((x) => x.id !== v.id))
                            }
                          >
                            Rimuovi voce
                          </Button>
                        </div>
                        <label className="block text-sm">
                          Lavoro affidato
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
                            Calcolo del compenso
                            <select
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
                              <option value="corpo">A corpo</option>
                              <option value="misura">A misura</option>
                              <option value="ore">A ore</option>
                            </select>
                          </label>
                          <label className="text-sm">
                            Quantità affidata
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
                            Unità
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
                              ? "Prezzo dell’intero lavoro (€)"
                              : "Prezzo unitario (€)"}
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
                          Lavorazione della commessa (facoltativa)
                          <select
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
                            <option value="">Nessun collegamento</option>
                            {fasi.data?.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                    {fasi.isError && (
                      <p role="alert" className="text-sm text-amber-800">
                        Lavorazioni non disponibili: puoi compilare la voce
                        senza collegamento.
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
                      Aggiungi lavoro
                    </Button>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        Quando matura il compenso
                        <select
                          className={selettore}
                          value={maturazione}
                          onChange={(e) => setMaturazione(e.target.value)}
                        >
                          <option value="">Scegli dal contratto</option>
                          <option value="saldo">Saldo a fine lavoro</option>
                          <option value="sal_periodici">SAL periodici</option>
                          <option value="traguardi">
                            Traguardi concordati
                          </option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Giorni di pagamento, se pattuiti
                        <Input
                          inputMode="numeric"
                          value={giorni}
                          onChange={(e) => setGiorni(e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      I giorni non generano una scadenza: evento di decorrenza e
                      condizioni rimangono quelli del contratto.
                    </p>
                    <label className="block text-sm">
                      Motivo e riferimento della base lavori
                      <Textarea
                        value={motivo}
                        maxLength={2000}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </label>
                    <p
                      className={`font-medium ${Math.abs(totale - Number(c.importo_contrattuale)) > 0.005 ? "text-amber-800" : ""}`}
                    >
                      Totale voci:{" "}
                      {Number.isFinite(totale)
                        ? euroSub(totale)
                        : "Da completare"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setModifica(false)}
                      >
                        Annulla modifica
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
                        Conferma base lavori
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
                      Annulla e torna alle misure
                    </Button>
                    <h3 className="font-semibold">
                      {dettaglio.tipo === "rileva"
                        ? "Nuova rilevazione"
                        : dettaglio.tipo === "verifica"
                          ? "Verifica della quantità"
                          : "Annullamento documentato"}{" "}
                      · {dettaglio.voce.descrizione}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {dettaglio.tipo !== "rileva" && (
                        <>
                          Dichiarata:{" "}
                          {quantitaSub(
                            Number(dettaglio.misura.quantita_dichiarata),
                            dettaglio.voce,
                          )}
                          .{" "}
                        </>
                      )}
                      La verifica non registra un SAL o un pagamento.
                    </p>
                    {dettaglio.tipo === "rileva" && (
                      <label className="block text-sm">
                        Data della rilevazione
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
                          ? "Quantità riconosciuta"
                          : "Quantità dichiarata nel periodo"}{" "}
                        (
                        {dettaglio.voce.base === "corpo"
                          ? "% dell’intero lavoro"
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
                        ? "Motivo dell’annullamento"
                        : "Riscontro e riferimento (rapportino, misura o verifica)"}
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
                        ? "Registra rilevazione"
                        : dettaglio.tipo === "verifica"
                          ? "Riconosci quantità"
                          : "Annulla rilevazione"}
                    </Button>
                  </fieldset>
                ) : tab === "lavori" || !quadro ? (
                  <>
                    {!quadro ? (
                      <div className="rounded-lg border border-dashed p-6">
                        <h3 className="font-semibold">
                          Definisci che cosa è affidato al subappaltatore
                        </h3>
                        <p className="my-3 text-sm text-muted-foreground">
                          Una voce per un lavoro a corpo, oppure quantità e
                          prezzi per misure e ore. I dati del contratto sono già
                          disponibili.
                        </p>
                        {storici ? (
                          <div className="space-y-3">
                            <p role="alert" className="text-sm text-amber-800">
                              Questo contratto ha SAL già registrati. Per
                              attivare le quantità occorre prima riconciliare lo
                              storico. Puoi continuare a consultare SAL, verbali
                              e ritenute esistenti.
                            </p>
                            {onApriStorico && (
                              <Button variant="outline" onClick={onApriStorico}>
                                Consulta SAL registrati
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button disabled={!scrittura} onClick={iniziaElenco}>
                            Imposta elenco lavori
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm">
                            Base lavori · Rev. {quadro.revisione} ·{" "}
                            {euroSub(Number(quadro.importo_lavori))}
                          </p>
                          {(riconosciute || storici) && (
                            <span className="text-xs text-muted-foreground">
                              {riconosciute
                                ? "Elenco bloccato: ci sono misure già verificate. Per cambiare l'importo serve una variante."
                                : "Elenco bloccato: il contratto ha SAL già registrati."}
                            </span>
                          )}
                          {!riconosciute && !storici && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!scrittura}
                              onClick={iniziaElenco}
                            >
                              Rivedi elenco
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
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="block md:table-row-group">
                              {quadro.voci.map((v) => {
                                const r = riepilogoVoceSub(v, misure);
                                return (
                                  <tr
                                    key={v.id}
                                    className="block border-t p-3 first:border-t-0 md:table-row md:p-0"
                                  >
                                    <td className="block pb-3 md:table-cell md:p-3">
                                      <strong>{v.descrizione}</strong>
                                      <p className="text-xs text-muted-foreground">
                                        {v.base === "corpo"
                                          ? "A corpo"
                                          : v.base === "ore"
                                            ? "A ore"
                                            : "A misura"}{" "}
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
                                        <p className="text-xs text-amber-800">
                                          {r.daVerificare} da verificare
                                        </p>
                                      )}
                                    </td>
                                    <td
                                      data-label="Residuo quantità"
                                      className="flex flex-wrap items-center justify-between gap-2 py-1 before:text-xs before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-3 md:before:hidden"
                                    >
                                      {quantitaSub(r.residua, v)}
                                    </td>
                                    <td
                                      data-label="Da contabilizzare"
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
                                        Rileva quantità
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium">
                            Come registrare le quantità
                          </summary>
                          <p className="mt-2 leading-relaxed">
                            Le rilevazioni si aggiungono nel periodo, non sono
                            percentuali cumulative da sommare. Per un lavoro a
                            corpo 100% equivale a una quota completa. Le date e
                            percentuali del calendario non riconoscono importi
                            da sole.
                          </p>
                        </details>
                        <details className="rounded-lg border p-3 text-sm">
                          <summary>Base e condizioni registrate</summary>
                          <p className="mt-2">{quadro.motivo}</p>
                          <p>
                            Maturazione:{" "}
                            {quadro.maturazione === "saldo"
                              ? "Saldo a fine lavoro"
                              : quadro.maturazione === "sal_periodici"
                                ? "SAL periodici"
                                : "Traguardi concordati"}{" "}
                            · Giorni pattuiti:{" "}
                            {quadro.giorni_pagamento ?? "non definiti"}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Dopo il riconoscimento delle quantità la base non
                            viene riscritta: le variazioni richiedono un
                            percorso dedicato.
                          </p>
                        </details>
                      </>
                    )}
                  </>
                ) : tab === "misure" ? (
                  <>
                    {!misure.length ? (
                      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
                        Nessuna rilevazione. Parti da “Lavori affidati” e scegli
                        il lavoro.
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
                                        "Voce di una base precedente"}
                                    </strong>
                                    <p className="text-xs text-muted-foreground">
                                      {m.data_rilievo
                                        .split("-")
                                        .reverse()
                                        .join("/")}{" "}
                                      · Rif. {m.id.slice(0, 8)}
                                    </p>
                                    <details className="mt-1 text-xs">
                                      <summary>Riscontri e verifica</summary>
                                      <p>{m.riferimento}</p>
                                      {m.nota_verifica && (
                                        <p>Verifica: {m.nota_verifica}</p>
                                      )}
                                      {m.verificato_il && (
                                        <p>
                                          Registrata il{" "}
                                          {new Date(
                                            m.verificato_il,
                                          ).toLocaleString("it-IT")}
                                        </p>
                                      )}
                                      {m.nota_annullamento && (
                                        <p>
                                          Annullamento: {m.nota_annullamento}
                                        </p>
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
                                      ? "Da verificare"
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
                                        ? "Nel SAL"
                                        : m.stato === "riconosciuta"
                                          ? "Riconosciuta, non contabilizzata"
                                          : m.stato === "annullata"
                                            ? "Annullata"
                                            : "Da verificare"}
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
                                          Verbale SAL
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
                                          Verifica
                                        </Button>
                                      )}
                                      {v && m.stato === "dichiarata" && m.quadro_id !== quadro?.id && (
                                        <span className="text-xs text-muted-foreground">
                                          Rilevata su un elenco precedente: annullala e rilevala di nuovo.
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
                                            Annulla
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
                    <h3 className="font-semibold">
                      SAL #{risultato.numero_sal} registrato dalle misure
                    </h3>
                    <p className="my-3 text-sm">
                      Le fonti sono collegate al SAL e non sono selezionabili
                      una seconda volta. Non è stato registrato un pagamento.
                    </p>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void esegui(() => onApriVerbale(risultato.id))
                      }
                    >
                      Prepara verbale SAL
                    </Button>
                  </div>
                ) : disponibiliSal.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6">
                    <h3 className="font-semibold">
                      Nessun lavoro pronto per un nuovo SAL
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {daVerificare > 0
                        ? "Ci sono rilevazioni da verificare. Riconosci le quantità prima di inserirle nel SAL."
                        : "Le quantità già inserite nei SAL restano nello storico. Registra una nuova rilevazione per contabilizzare altro lavoro."}
                    </p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() =>
                        setTab(daVerificare > 0 ? "misure" : "lavori")
                      }
                    >
                      {daVerificare > 0
                        ? "Vai alle verifiche"
                        : "Vai ai lavori affidati"}
                    </Button>
                  </div>
                ) : (
                  <fieldset disabled={busy} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Seleziona soltanto i lavori riconosciuti da includere in
                      questo SAL del periodo. Gli importi vengono calcolati sul
                      server ai prezzi della base lavori; oneri e acconti non
                      vengono aggiunti automaticamente.
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
                                ?.descrizione || "Lavoro riconosciuto"}
                              <small className="block text-muted-foreground">
                                {m.data_rilievo} · Rif. {m.id.slice(0, 8)}
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
                        Data SAL
                        <Input
                          type="date"
                          max={oggi()}
                          value={dataSal}
                          onChange={(e) => setDataSal(e.target.value)}
                        />
                      </label>
                      <label className="text-sm">
                        Ritenuta di garanzia (%)
                        <Input
                          inputMode="decimal"
                          value={ritenuta}
                          onChange={(e) => setRitenuta(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      Note del SAL
                      <Textarea
                        value={noteSal}
                        maxLength={6000}
                        onChange={(e) => setNoteSal(e.target.value)}
                      />
                    </label>
                    <p className="font-semibold">
                      Lordo del periodo: {euroSub(totaleSal)}
                    </p>
                    {oneriSal > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Lavori {euroSub(lavoriSal)} + oneri della sicurezza {euroSub(oneriSal)} (in proporzione ai lavori; l'ultimo SAL prende il residuo)
                      </p>
                    )}
                    <p className="text-sm">
                      Ritenuta:{" "}
                      {euroSub(
                        Math.round(
                          totaleSal * (parseDecimalIT(ritenuta) || 0),
                        ) / 100,
                      )}{" "}
                      · Netto SAL:{" "}
                      {euroSub(
                        totaleSal -
                          Math.round(
                            totaleSal * (parseDecimalIT(ritenuta) || 0),
                          ) /
                            100,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      La numerazione viene assegnata dal server. Il SAL è
                      registrato come verificato sulle misure riconosciute. Non
                      genera fattura, scadenza o pagamento; la ritenuta segue i
                      controlli fiscali esistenti.
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
                  Chiudi
                </Button>
                {tab === "sal" &&
                  !modifica &&
                  !dettaglio &&
                  !risultato &&
                  disponibiliSal.length > 0 && (
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                      <span className="text-sm">
                        <span className="text-muted-foreground">
                          {selezionate.length} selezionate · Lordo{" "}
                        </span>
                        <strong>{euroSub(totaleSal)}</strong>
                      </span>
                      <Button
                        disabled={
                          busy || !scrittura || !(totaleSal > 0) || !dataSal
                        }
                        onClick={() => void creaSal()}
                      >
                        {busy ? "Registrazione…" : "Registra SAL verificato"}
                      </Button>
                    </div>
                  )}
                {busy && (
                  <span role="status" className="text-sm text-muted-foreground">
                    Operazione in corso…
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
            <AlertDialogTitle>Chiudere senza registrare?</AlertDialogTitle>
            <AlertDialogDescription>
              I dati del modulo non ancora confermati andranno persi. Le
              rilevazioni e i SAL già registrati restano conservati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua modifica</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              Chiudi modulo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
