import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATI_POS_ESTERNO, useAvanzaPosEsterno, useRichiestaPosEsterno, type AvvioSicurezza, type AzionePosEsterno, type ConsegnaPosEsterno } from "@/hooks/useAvvioSicurezza";
import { apriFileFascicolo } from "@/hooks/useFascicoloCantiere";
import { oggiSicurezza, type EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
import { ConsegnaPosEsternoDialog } from "./ConsegnaPosEsterno";
import { toast } from "sonner";
import { stessoRiferimentoPsc } from "../../../supabase/functions/_shared/posPsc";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const AZIONI: Record<Exclude<AzionePosEsterno, "ricevi">, string> = {
  comunica_psc: "Condividi PSC con la ditta",
  integrazione: "Chiedi integrazione",
  congruo: "Registra congruenza",
  inoltrato: "Registra inoltro al CSE",
  ricezione_cse: "Registra ricezione del CSE",
  positivo: "Registra esito positivo del CSE",
  negativo: "Registra esito negativo del CSE",
};
type Passo = keyof typeof AZIONI;

export function PosEsternoImpresa({ companyId, orderId, subId, avvio, affidataria, righe, documenti, solaLettura }: {
  companyId: string; orderId: string; subId: string; avvio?: AvvioSicurezza | null;
  affidataria?: { id: string; revisione: number };
  righe: ConsegnaPosEsterno[]; documenti: EvidenzaFascicolo[]; solaLettura: boolean;
}) {
  const t = useT();
  const richiesta = useRichiestaPosEsterno(companyId, orderId, subId);
  const [upload, setUpload] = useState<ConsegnaPosEsterno>();
  const [azione, setAzione] = useState<Passo>();
  const [importa, setImporta] = useState(false);
  const [errore, setErrore] = useState("");
  const occupato = useRef(false);
  const corrente = righe.find((r) => r.corrente);
  const storico = righe.filter((r) => !r.corrente);
  const giaAcquisiti = new Set(righe.map((r) => r.id));
  const disponibili = documenti.filter((d) => d.tipo === "pos" && d.order_id === orderId && d.subappaltatore_id === subId &&
    !d.operaio_id && d.file_path && !["superato", "non_applicabile"].includes(d.stato) && !giaAcquisiti.has(d.id));
  const pscDaComunicare = !!avvio?.psc && !stessoRiferimentoPsc(corrente?.psc_comunicato, avvio.psc);
  const pscConsegna = corrente?.psc_alla_ricezione ?? corrente?.psc_comunicato;
  const pscConsegnaSuperato = !!(corrente?.file_path && pscConsegna && avvio &&
    corrente.versione_avvio !== avvio.versione && (avvio.stato !== "previsto" || !stessoRiferimentoPsc(pscConsegna, avvio.psc)));
  const daRiesaminare = pscConsegnaSuperato || (!!corrente?.versione_avvio && (corrente.versione_avvio !== avvio?.versione ||
    corrente.pos_affidataria_id !== affidataria?.id || corrente.pos_affidataria_revisione !== affidataria?.revisione));
  const prontoPerCongruenza = !!affidataria && (avvio?.stato === "non_previsto" || !!avvio?.psc && !pscDaComunicare);
  const puoRichiedere = !corrente || daRiesaminare && !!corrente.file_path ||
    ["integrazione", "negativo", "positivo", "congruo"].includes(corrente?.stato ?? "");
  const passi: Passo[] = [];
  if (corrente && !solaLettura) {
    if (pscDaComunicare) passi.push("comunica_psc");
    if (["ricevuto", "congruo", "inoltrato", "negativo"].includes(corrente.stato)) passi.push("integrazione");
    if (prontoPerCongruenza && (corrente.stato === "ricevuto" || (daRiesaminare && ["congruo", "inoltrato", "positivo"].includes(corrente.stato)))) passi.push("congruo");
    if (corrente.stato === "congruo" && !daRiesaminare && avvio?.stato === "previsto") passi.push("inoltrato");
    if (corrente.stato === "inoltrato" && !daRiesaminare) {
      if (corrente.cse_ricevuto_il) passi.push("positivo", "negativo");
      else passi.push("ricezione_cse");
    }
  }
  async function nuova(carica: boolean) {
    if (occupato.current) return;
    occupato.current = true;
    setErrore("");
    try {
      const r = corrente?.stato === "richiesto" && carica ? corrente : await richiesta.mutateAsync({});
      if (carica) setUpload(r);
      else toast.success(t("Richiesta POS registrata sulla commessa."));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Richiesta non registrata"));
    } finally {
      occupato.current = false;
    }
  }
  const apri = (path: string): void => {
    void apriFileFascicolo(path).catch(() => toast.error(t("PDF non disponibile")));
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5 className="font-semibold">{t("Consegna del POS")}</h5>
        <span className={daRiesaminare ? "font-medium text-amber-800" : "text-muted-foreground"}>
          {daRiesaminare ? t("Da riesaminare con PSC e POS dell’affidataria correnti") : corrente ? t(STATI_POS_ESTERNO[corrente.stato]) : t("Nessuna consegna registrata")}
        </span>
      </div>
      {corrente && <>
        <p className="text-muted-foreground">
          {[corrente.revisione && t("Rev. {n}", { n: String(corrente.revisione) }), corrente.ricevuto_il && t("Ricevuto il {data}", { data: corrente.ricevuto_il }),
            corrente.psc_comunicato_il && t("PSC rev. {revisione} condiviso il {data}", { revisione: String(corrente.psc_comunicato?.revisione ?? ""), data: corrente.psc_comunicato_il }),
            corrente.cse_ricevuto_il && t("Ricezione CSE il {data}", { data: corrente.cse_ricevuto_il }), corrente.esito_il && t("Esito del {data}", { data: corrente.esito_il })].filter(Boolean).join(" · ")}
        </p>
        {corrente.nota && <p className="whitespace-pre-wrap">{corrente.nota}</p>}
        {pscConsegnaSuperato && <p className="text-amber-800">{t("Alla ricezione era stato condiviso il PSC rev. {revisione}. Rivaluta il POS prima di registrare la congruenza.", { revisione: String(pscConsegna?.revisione ?? "") })}</p>}
        {corrente.stato === "ricevuto" && !prontoPerCongruenza && <p className="text-amber-800">{!affidataria
          ? t("Per la congruenza serve il POS corrente e approvato dell’impresa affidataria.")
          : t("Conferma l’Avvio sicurezza e condividi il PSC vigente, se previsto.")}</p>}
      </>}
      <div className="flex flex-wrap gap-2">
        {corrente?.file_path && <Button size="sm" variant="outline" onClick={() => apri(corrente.file_path!)}>{t("Apri PDF")}</Button>}
        {!solaLettura && <>
          {passi.map((p) => <Button size="sm" variant="outline" key={p} onClick={() => setAzione(p)}>{t(AZIONI[p])}</Button>)}
          {puoRichiedere && <Button size="sm" variant="outline" disabled={richiesta.isPending} onClick={() => void nuova(false)}>
            {corrente ? t("Richiedi nuova revisione") : t("Richiedi POS")}
          </Button>}
          {(puoRichiedere || corrente?.stato === "richiesto") && <Button size="sm" variant="outline" disabled={richiesta.isPending} onClick={() => void nuova(true)}>
            {corrente && corrente.stato !== "richiesto" ? t("Carica nuova revisione") : t("Carica POS ricevuto")}
          </Button>}
          {disponibili.length > 0 && <Button size="sm" variant="ghost" disabled={richiesta.isPending} onClick={() => setImporta(true)}>{t("Prendi in carico dal fascicolo")}</Button>}
        </>}
      </div>
      {errore && <p role="alert" className="text-destructive">{errore}</p>}
      {storico.length > 0 && <details>
        <summary className="cursor-pointer text-muted-foreground">{t("Storico · {n}", { n: storico.length })}</summary>
        {storico.map((d) => <div key={d.id} className="mt-1 flex flex-wrap items-center gap-2">
          <span>{d.revisione ? t("Rev. {n}", { n: String(d.revisione ?? "") }) : t("Richiesta precedente")} · {t(STATI_POS_ESTERNO[d.stato])}{d.esito_il ? ` · ${d.esito_il}` : ""}</span>
          {d.file_path && <Button variant="link" size="sm" onClick={() => apri(d.file_path!)}>{t("Apri PDF storico")}</Button>}
        </div>)}
      </details>}
      {upload && <ConsegnaPosEsternoDialog consegna={upload} ufficio chiudi={() => setUpload(undefined)} />}
      {azione && corrente && <RegistraPasso azione={azione} corrente={corrente} chiudi={() => setAzione(undefined)} />}
      {importa && <AcquisisciFascicolo documenti={disponibili} occupato={richiesta.isPending} errore={richiesta.error?.message}
        chiudi={() => setImporta(false)} salva={(fonte, ricevuto) => richiesta.mutate({ fonte, ricevuto }, { onSuccess: () => setImporta(false) })} />}
    </div>
  );
}

function RegistraPasso({ azione, corrente, chiudi }: { azione: Passo; corrente: ConsegnaPosEsterno; chiudi: () => void }) {
  const t = useT();
  const avanza = useAvanzaPosEsterno();
  const [data, setData] = useState(oggiSicurezza);
  const [nota, setNota] = useState("");
  const usaNota = !["comunica_psc", "ricezione_cse"].includes(azione);
  const usaData = !["congruo", "integrazione"].includes(azione);
  return <Dialog open onOpenChange={(v) => { if (!v && !avanza.isPending) chiudi(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t(AZIONI[azione])}</DialogTitle>
        <DialogDescription>{azione === "comunica_psc" ? t("La revisione vigente sarà disponibile nel portale della ditta.") : t("Registra il passaggio effettivo sul POS rev. {revisione}.", { revisione: String(corrente.revisione ?? "—") })}</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!avanza.isPending) avanza.mutate({ consegna: corrente, azione, data: usaData ? data : undefined, nota }, { onSuccess: chiudi });
      }}>
        {usaData && <div className="space-y-1"><Label htmlFor="data-passo-pos">{t("Data")}</Label><Input id="data-passo-pos" type="date" required max={oggiSicurezza()} value={data} onChange={(e) => setData(e.target.value)} /></div>}
        {usaNota && <div className="space-y-1"><Label htmlFor="nota-passo-pos">{t("Riferimento o riscontro")}</Label><Textarea id="nota-passo-pos" required maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} /></div>}
        {avanza.error && <p role="alert" className="text-sm text-destructive">{avanza.error.message}</p>}
        <Button type="submit" disabled={avanza.isPending || (usaNota && !nota.trim()) || (usaData && !data)}>{t("Registra")}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}

function AcquisisciFascicolo({ documenti, occupato, errore, chiudi, salva }: {
  documenti: EvidenzaFascicolo[]; occupato: boolean; errore?: string; chiudi: () => void; salva: (id: string, data: string) => void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [data, setData] = useState(oggiSicurezza);
  return <Dialog open onOpenChange={(v) => { if (!v && !occupato) chiudi(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t("Prendi in carico dal fascicolo")}</DialogTitle><DialogDescription>{t("Scegli il PDF già depositato e indica quando è stato ricevuto.")}</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (id && data && !occupato) salva(id, data); }}>
        <Label htmlFor="documento-pos-esistente">{t("POS di questa commessa")}</Label>
        <UniformSelect id="documento-pos-esistente" required value={id} onChange={(e) => setId(e.target.value)} className="w-full rounded-md border bg-background p-2">
          <option value="">{t("Scegli il file")}</option>
          {documenti.map((d) => <option key={d.id} value={d.id}>{d.titolo} · {d.revisione ? t("rev. {n}", { n: String(d.revisione ?? "") }) : t("revisione da indicare nel fascicolo")}</option>)}
        </UniformSelect>
        <Label htmlFor="data-pos-esistente">{t("Ricevuto il")}</Label>
        <Input id="data-pos-esistente" type="date" required max={oggiSicurezza()} value={data} onChange={(e) => setData(e.target.value)} />
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <Button type="submit" disabled={occupato || !data || !id}>{t("Registra ricezione")}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
