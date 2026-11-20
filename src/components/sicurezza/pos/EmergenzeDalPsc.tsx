import { useState } from "react";
import { FileSearch, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProgressiveFluxLoader } from "@/components/ui/progressive-flux-loader";
import { chiamaServerPos } from "@/hooks/usePos";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { CAMPI_EMERGENZE_POS, type CampoEmergenzePos, type PianoEmergenzePos } from "../../../../supabase/functions/_shared/posEvidenzeOperative";
import type { FontiEmergenzePsc, PropostaEmergenzaPsc } from "../../../../supabase/functions/_shared/posEmergenzePsc";
import type { ContestoLetturaPsc } from "./LetturaOcrPsc";

export function EmergenzeDalPsc({ origine, piano, fonti, applica }: {
  origine: ContestoLetturaPsc;
  piano?: PianoEmergenzePos;
  fonti?: FontiEmergenzePsc;
  applica: (proposte: PropostaEmergenzaPsc[]) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [legge, setLegge] = useState(false);
  const [proposte, setProposte] = useState<PropostaEmergenzaPsc[]>([]);
  const [avviso, setAvviso] = useState("");
  const [errore, setErrore] = useState("");
  const [scelte, setScelte] = useState<Record<number, string>>({});
  const [confermato, conferma] = useState(false);
  const selezionate = proposte.flatMap((p, i) => i in scelte ? [{ ...p, fase: scelte[i].trim() || undefined }] : []);
  const fasiMancanti = selezionate.some(p => !p.fase && selezionate.filter(a => a.campo === p.campo).length > 1);
  const { companyId, posId, fonte, salva } = origine;

  async function cerca() {
    setAperto(true); setLegge(true); setProposte([]); setScelte({}); setAvviso(""); setErrore(""); conferma(false);
    try {
      if (salva && !await salva()) throw new Error("Salva il PSC collegato prima di cercare indicazioni.");
      const r = await chiamaServerPos<{ proposte?: PropostaEmergenzaPsc[]; avviso?: string }>({
        azione: "stato_ocr_psc", emergenze: true, company_id: companyId, pos_id: posId,
        documento_id: fonte.id, revisione: fonte.revisione, sha256: fonte.sha256,
      });
      const trovate = r.proposte ?? [];
      setProposte(trovate);
      setScelte(Object.fromEntries(trovate.flatMap((p, i) => {
        const precedente = fonti?.[p.campo]?.find(f => f.id === p.id && f.revisione === p.revisione &&
          f.sha256 === p.sha256 && f.pagina === p.pagina && f.estratto === p.estratto);
        return precedente ? [[i, precedente.fase ?? ""]] : [];
      })));
      setAvviso(r.avviso ?? "");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Il PSC non è stato letto. Riprova.");
    } finally { setLegge(false); }
  }

  const apriPagina = (pagina: number) => {
    void apriFileRiservato(fonte.archivio === "sicurezza_documenti" ? "sicurezza-documenti" : "fascicoli-cantiere", fonte.file_path, pagina)
      .catch(() => toast.error("Pagina originale non disponibile"));
  };
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => void cerca()} disabled={legge}>
      <FileSearch className="mr-1.5 size-4" aria-hidden />Cerca indicazioni nel PSC
    </Button>
    {aperto && <Dialog open onOpenChange={setAperto}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Indicazioni di emergenza dal PSC</DialogTitle>
          <DialogDescription>Seleziona gli estratti pertinenti alla tua lavorazione e confrontali con l’originale. I campi selezionati verranno aggiornati nella bozza.</DialogDescription>
        </DialogHeader>
        {legge ? <ProgressiveFluxLoader label="Ricerca delle indicazioni nel PSC" /> : <>
          {avviso && <p className="text-xs text-muted-foreground">{avviso}</p>}
          {errore && <p className="text-sm text-destructive" role="alert">{errore}</p>}
          {!proposte.length && !errore && <p className="rounded-md border bg-muted/30 p-3 text-sm">Nessuna indicazione operativa trovata nelle pagine disponibili. Puoi integrare il piano direttamente nell’editor.</p>}
          {(Object.keys(CAMPI_EMERGENZE_POS) as CampoEmergenzePos[]).map(campo => {
            const alternative = proposte.flatMap((p, i) => p.campo === campo ? [{ p, i }] : []);
            if (!alternative.length) return null;
            return <fieldset key={campo} className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-semibold">{CAMPI_EMERGENZE_POS[campo]}</legend>
              {!!piano?.[campo]?.trim() && <p className="text-xs text-muted-foreground">Le indicazioni selezionate sostituiranno quelle già presenti in questo campo.</p>}
              {alternative.map(({ p, i }) => <div key={i} className="space-y-2 rounded-md border p-2">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={i in scelte} onCheckedChange={v => {
                    setScelte(s => {
                      if (v === true) return { ...s, [i]: p.fase ?? "" };
                      const aggiornate = { ...s };
                      delete aggiornate[i];
                      return aggiornate;
                    });
                    conferma(false);
                  }} aria-label={`Seleziona ${CAMPI_EMERGENZE_POS[campo]} da pagina ${p.pagina}`} />
                  <span>{p.estratto}</span>
                </label>
                <Button type="button" variant="link" size="sm" className="ml-5 h-auto p-0 text-xs" onClick={() => apriPagina(p.pagina)}>
                  <ExternalLink className="mr-1 size-3" aria-hidden />Pagina {p.pagina}{p.metodo === "ocr" && " · OCR"}
                </Button>
                {i in scelte && <label className="ml-5 block space-y-1 text-xs font-medium">
                  <span>Fase o ambito · pagina {p.pagina}</span>
                  <Input className="h-8" value={scelte[i]} maxLength={100} placeholder="Es. Posa della barriera, corsia est"
                    onChange={e => { setScelte(s => ({ ...s, [i]: e.target.value })); conferma(false); }} />
                </label>}
              </div>)}
            </fieldset>;
          })}
          {fasiMancanti && <p className="text-sm text-muted-foreground" role="status">Indica la fase o l’ambito di ogni estratto quando ne usi più di uno per la stessa voce.</p>}
          {!!selezionate.length && <label className="flex items-start gap-2 rounded-md bg-muted/30 p-3 text-sm">
            <Checkbox checked={confermato} onCheckedChange={v => conferma(v === true)} />
            Ho confrontato gli estratti selezionati con il PSC originale e ne ho verificato la pertinenza.
          </label>}
        </>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setAperto(false)}>Chiudi</Button>
          {!!proposte.length && <Button type="button" disabled={!confermato || !selezionate.length || fasiMancanti} onClick={() => { applica(selezionate); setAperto(false); }}>
            Inserisci nella bozza
          </Button>}
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}
