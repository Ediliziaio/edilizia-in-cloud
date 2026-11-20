import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import type { ImpostazioniIVA } from "@/hooks/useImpostazioniIVA";
import { supabase } from "@/integrations/supabase/client";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import { controlliLipe, moduloLipeConDati, nomeFileLipe, scadenzaLipe, stessiRighiLipe, xmlLipe, type ComunicazioneLipe, type ModuloLipe } from "@/lib/contabilita/lipeXml";
import { cn } from "@/lib/utils";
import type { CalcoloLiquidazioneIVA, LiquidazioneIVAConfermata } from "./LiquidazioniIVA";

interface Props {
  company: string;
  anno: number;
  oggi: string;
  impostazioni: ImpostazioniIVA;
  partitaIva: string;
  confermate: Map<string, LiquidazioneIVAConfermata>;
  puoScrivere: boolean;
  onApriImpostazioni: () => void;
  onCambiato: () => void;
}

function TrimestreLipe({ q, anno, oggi, company, confermate, impostazioni, partitaIva, puoScrivere, onApriImpostazioni, onCambiato }: Props & { q: number }) {
  const id = useId();
  const [diretta, setDiretta] = useState(false);
  const [impegno, setImpegno] = useState<1 | 2 | undefined>();
  const [dataImpegno, setDataImpegno] = useState("");
  const [segnando, setSegnando] = useState(false);
  const [protocollo, setProtocollo] = useState("");

  const mensile = impostazioni.periodicita === "mensile";
  const primoMese = (q - 1) * 3 + 1;
  const dalMese = (mese: number) => `${anno}-${String(mese).padStart(2, "0")}-01`;
  const fineMese = (mese: number) => new Date(Date.UTC(anno, mese, 0)).toISOString().slice(0, 10);
  const periodi = (mensile ? [primoMese, primoMese + 1, primoMese + 2] : [primoMese]).map((mese) => ({
    numero: mensile ? mese : q,
    dal: dalMese(mese),
    al: fineMese(mensile ? mese : mese + 2),
    mese: mensile ? mese : null,
    trimestre: mensile ? null : q === 4 && impostazioni.periodicita === "trimestrale" ? 5 : q,
    confermata: confermate.get(dalMese(mese)),
  }));
  const mancanti = periodi.filter((p) => !p.confermata);
  const scartata = periodi.some((p) => p.confermata?.stato === "rejected_ade");
  const inviate = periodi.filter((p) => p.confermata?.stato === "submitted" || p.confermata?.stato === "accepted_ade");
  const protocolli = new Set(inviate.map((p) => p.confermata?.protocollo));
  const inviata = inviate.length === periodi.length && protocolli.size === 1;
  const incoerente = periodi.some(({ confermata: c, mese, trimestre, al }) => c && (
    !c.dati?.righi || c.al !== al || (c.dati.mese ?? null) !== mese || (c.dati.trimestre ?? null) !== trimestre
  )) || (inviate.length > 0 && !inviata);
  const moduli: ModuloLipe[] = periodi.flatMap(({ mese, trimestre, confermata }) =>
    confermata?.dati.righi ? [{ mese, trimestre, righi: confermata.dati.righi }] : []);
  const pronto = mancanti.length === 0 && !scartata && !incoerente && fineMese(q * 3) < oggi;
  const conDati = moduli.some(moduloLipeConDati);
  const intermediario = !diretta ? (impostazioni.cf_intermediario ?? null) : null;
  const comunicazione: ComunicazioneLipe = {
    anno, partitaIva, moduli,
    codiceFiscale: impostazioni.cf_contribuente ?? "",
    cfDichiarante: impostazioni.cf_dichiarante,
    codiceCarica: impostazioni.codice_carica,
    cfIntermediario: intermediario,
    impegnoPresentazione: intermediario ? impegno : undefined,
    dataImpegno: intermediario ? dataImpegno || null : null,
  };
  const errori = pronto && conDati ? controlliLipe(comunicazione) : [];
  const scadenza = scadenzaLipe(anno, q);

  const scarica = useMutation({
    mutationFn: async () => {
      await Promise.all(periodi.map(async (p) => {
        const { data, error } = await supabase.rpc("liquidazione_iva_righi", {
          p_company: company, p_anno: anno, p_periodo: p.numero, p_manuali: p.confermata?.dati.manuali ?? {},
        });
        if (error) throw new Error(error.message);
        const ora = data as unknown as CalcoloLiquidazioneIVA | null;
        const righi = p.confermata?.dati.righi;
        if (!ora?.calcolabile || !ora.righi || !righi || !stessiRighiLipe(righi, ora.righi)
          || (ora.mese ?? null) !== p.mese || (ora.trimestre ?? null) !== p.trimestre) {
          throw new Error(`Verifica la liquidazione del periodo ${fiscalDate(p.dal)} – ${fiscalDate(p.al)}. ${ora?.motivo ?? "I dati sono cambiati dopo la conferma."}`);
        }
      }));
      const xml = xmlLipe(comunicazione);
      const nome = nomeFileLipe(intermediario || comunicazione.codiceFiscale);
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    onError: (e) => toast.error("File non generato", { description: e.message }),
  });
  const segna = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("liquidazione_iva_segna_inviata", {
        p_company: company, p_dal: dalMese(primoMese), p_al: fineMese(q * 3), p_protocollo: protocollo.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Protocollo registrato"); onCambiato(); },
    onError: (e) => toast.error("Protocollo non salvato", { description: e.message }),
  });

  return (
    <section className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-24 font-medium">{q}° trimestre</span>
        <span className={cn("w-36 text-xs", scadenza < oggi && !inviata && !(pronto && !conDati)
          ? "font-medium text-red-700" : "text-muted-foreground")}>Entro il {fiscalDate(scadenza)}</span>
        <div className="min-w-40 flex-1 text-xs text-muted-foreground">
          {inviata ? <span className="text-emerald-700">Inviata · protocollo {[...protocolli][0] ?? "da verificare"}</span>
            : incoerente ? "Verifica periodi e protocolli delle liquidazioni del trimestre."
            : scartata ? "Comunicazione scartata. Verifica la ricevuta e riapri i periodi da correggere."
            : mancanti.length ? (mensile ? `Mancano ${mancanti.length} mesi da confermare` : "Da confermare")
            : pronto && !conDati ? "Nessun dato da comunicare nel quadro VP." : null}
        </div>
        {pronto && conDati && (
          <Button size="sm" variant={inviata ? "outline" : "default"} disabled={!!errori.length || scarica.isPending} onClick={() => scarica.mutate()}>
            {scarica.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            Scarica XML
          </Button>
        )}
        {pronto && conDati && !inviata && puoScrivere && !segnando && (
          <Button size="sm" variant="ghost" onClick={() => setSegnando(true)}>Registra protocollo</Button>
        )}
      </div>
      {pronto && conDati && impostazioni.cf_intermediario && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-invio`}>Presentazione</Label>
            <UniformSelect id={`${id}-invio`} value={diretta ? "diretta" : "intermediario"} onChange={(e) => setDiretta(e.target.value === "diretta")}>
              <option value="intermediario">Tramite intermediario</option>
              <option value="diretta">Diretta</option>
            </UniformSelect>
          </div>
          {intermediario && (
            <>
              <div className="space-y-1">
                <Label htmlFor={`${id}-predisposta`}>Comunicazione predisposta da</Label>
                <UniformSelect id={`${id}-predisposta`} value={impegno ?? ""} onChange={(e) => setImpegno(e.target.value === "1" ? 1 : e.target.value === "2" ? 2 : undefined)}>
                  <option value="">Seleziona</option>
                  <option value="1">Contribuente</option>
                  <option value="2">Intermediario</option>
                </UniformSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-impegno`}>Data dell'impegno</Label>
                <Input id={`${id}-impegno`} type="date" max={oggi} value={dataImpegno} onChange={(e) => setDataImpegno(e.target.value)} />
              </div>
            </>
          )}
        </div>
      )}
      {errori.length > 0 && (
        <div className="text-xs text-destructive">
          <ul>{errori.map((e) => <li key={e}>{e}</li>)}</ul>
          {errori.some((e) => /codice fiscale|partita iva|codice carica/i.test(e)) && (
            <button type="button" className="font-medium underline" onClick={onApriImpostazioni}>Verifica le impostazioni IVA</button>
          )}
        </div>
      )}
      {pronto && conDati && !inviata && puoScrivere && segnando && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-protocollo`}>Protocollo della ricevuta di acquisizione</Label>
            <Input id={`${id}-protocollo`} maxLength={80} value={protocollo} onChange={(e) => setProtocollo(e.target.value)} />
          </div>
          <Button size="sm" disabled={!protocollo.trim() || segna.isPending} onClick={() => segna.mutate()}>Salva</Button>
          <Button size="sm" variant="ghost" onClick={() => setSegnando(false)}>Annulla</Button>
        </div>
      )}
    </section>
  );
}

export function ComunicazioniLipe(props: Props) {
  const { regime, attivita_separate } = props.impostazioni;
  const motivo = regime === "forfettario" ? "Per il regime forfettario non è prevista la comunicazione periodica."
    : regime === "altro" || attivita_separate ? "Per le contabilità separate e i regimi IVA speciali, predisponi la comunicazione con il consulente." : null;
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="px-4 py-3">
        <h3 className="font-semibold">Comunicazione LIPE</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{motivo ?? "Controlla l’XML con il modulo IVP18, poi presentalo tramite i canali telematici dell’Agenzia. Registra il protocollo dopo la ricevuta."}</p>
      </div>
      {!motivo && <div className="divide-y border-t">{[1, 2, 3, 4].map((q) => <TrimestreLipe key={q} q={q} {...props} />)}</div>}
    </div>
  );
}
