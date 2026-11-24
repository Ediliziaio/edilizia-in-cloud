import { useState } from "react";
import { ExternalLink, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProgressiveFluxLoader } from "@/components/ui/progressive-flux-loader";
import { chiamaServerPos } from "@/hooks/usePos";
import { apriRapportoRumorePos } from "./EvidenzeOperativePos";
import type { FonteRumorePos } from "../../../../supabase/functions/_shared/posEvidenzeOperative";
import type { PropostaEsitoRumore } from "../../../../supabase/functions/_shared/posEsitiRumore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Esame { proposte: PropostaEsitoRumore[]; ispezionate: number; totale: number; illeggibili: number[] }

export function EsitiDalRapportoRumore({ companyId, posId, fonte, salva, applica }: {
  companyId: string; posId: string; fonte: FonteRumorePos; salva?: () => Promise<boolean>;
  applica: (proposte: PropostaEsitoRumore[]) => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [legge, setLegge] = useState(false);
  const [esame, setEsame] = useState<Esame>();
  const [errore, setErrore] = useState("");
  const [scelte, setScelte] = useState<number[]>([]);
  const [paginaOcr, setPaginaOcr] = useState("");
  const [leggeOcr, setLeggeOcr] = useState(false);
  const [avvisoOcr, setAvvisoOcr] = useState("");
  async function cerca() {
    setAperto(true); setLegge(true); setEsame(undefined); setErrore(""); setScelte([]); setAvvisoOcr("");
    try {
      if (salva && !await salva()) throw new Error(t("Salva il rapporto collegato prima di cercare gli esiti."));
      const risposta = await chiamaServerPos<Esame>({ azione: "fonte_rapporto_rumore", leggi_esiti: true,
        company_id: companyId, pos_id: posId, origine: fonte.origine, documento_id: fonte.id, sha256: fonte.sha256 });
      setEsame(risposta);
      setPaginaOcr(risposta.illeggibili[0] ? String(risposta.illeggibili[0]) : "");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Esiti non disponibili"));
    } finally { setLegge(false); }
  }
  const pagina = Number(paginaOcr);
  async function leggiPagina() {
    setLeggeOcr(true); setAvvisoOcr(""); setErrore("");
    try {
      const r = await chiamaServerPos<{ proposte: PropostaEsitoRumore[]; avviso?: string }>({
        azione: "ocr_rapporto_rumore", company_id: companyId, pos_id: posId, origine: fonte.origine,
        documento_id: fonte.id, sha256: fonte.sha256, pagina,
      });
      setScelte([]);
      setEsame(e => e && r.proposte.length ? { ...e,
        proposte: [...e.proposte.filter(p => p.pagina !== pagina), ...r.proposte].sort((a, b) => a.pagina - b.pagina),
        illeggibili: e.illeggibili.filter(n => n !== pagina),
      } : e);
      setAvvisoOcr(r.avviso ?? t("Esiti recuperati a pagina {pagina}. Confrontali con l’originale.", { pagina }));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Lettura della scansione non riuscita."));
    } finally { setLeggeOcr(false); }
  }
  return <>
    <Button type="button" variant="outline" size="sm" disabled={legge || leggeOcr} onClick={() => void cerca()}>
      <FileSearch className="mr-1 size-4" aria-hidden />{t("Cerca esiti nel PDF")}
    </Button>
    {aperto && <Dialog open onOpenChange={setAperto}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Esiti dal rapporto del rumore")}</DialogTitle>
          <DialogDescription>{t("Seleziona le righe da aggiungere. Confronta gli esiti con la revisione del rapporto prima di confermare il riesame.")}</DialogDescription>
        </DialogHeader>
        {(legge || leggeOcr) && <ProgressiveFluxLoader label={leggeOcr ? t("Lettura della pagina del rapporto") : t("Lettura degli esiti nel PDF")} />}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        {esame && <>
          <p className="text-xs text-muted-foreground">{t("{n} di {totale} pagine esaminate", { n: esame.ispezionate, totale: esame.totale })}
            {!!esame.illeggibili.length && t(" · {n} pagine da leggere sull’originale", { n: esame.illeggibili.length })}</p>
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-2.5">
            <label className="space-y-1 text-sm">
              <span>{t("Pagina da leggere")}</span>
              <Input className="h-8 w-24" type="number" value={paginaOcr} min={1} max={esame.totale} step={1}
                onChange={e => setPaginaOcr(e.target.value)} disabled={leggeOcr} />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={leggeOcr || !Number.isSafeInteger(pagina) || pagina < 1 || pagina > esame.totale}
              onClick={() => void leggiPagina()}>{t("Leggi pagina con OCR")}</Button>
          </div>
          {avvisoOcr && <p role="status" className="text-xs text-muted-foreground">{avvisoOcr}</p>}
          {!esame.proposte.length && <p className="rounded-md bg-muted/30 p-3 text-sm">{t("Il testo del PDF non contiene esiti riconoscibili. Puoi leggere una pagina della scansione o inserire le righe dall’originale.")}</p>}
          {esame.proposte.map((p, i) => <div key={`${p.pagina}:${i}`} className="space-y-1 rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={scelte.includes(i)} onCheckedChange={v =>
                setScelte(s => v === true ? [...s, i] : s.filter(n => n !== i))} />
              <span className="whitespace-pre-line"><strong>{p.esposizione}</strong>{"\n"}{p.estratto}</span>
            </label>
            <Button type="button" variant="link" size="sm" className="ml-5 h-auto p-0 text-xs" onClick={() =>
              void apriRapportoRumorePos(companyId, posId, fonte, p.pagina).catch(() => toast.error(t("Originale del rapporto non disponibile")))}>
              <ExternalLink className="mr-1 size-3" aria-hidden />{t("Pagina")} {p.pagina}{p.metodo === "ocr" ? ` ${t("· OCR")}` : ""}
            </Button>
          </div>)}
        </>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setAperto(false)}>{t("Chiudi")}</Button>
          {!!esame?.proposte.length && <Button type="button" disabled={!scelte.length || leggeOcr} onClick={() => {
            applica(esame.proposte.filter((_, n) => scelte.includes(n)));
            setAperto(false);
          }}>{t("Aggiungi righe da riesaminare")}</Button>}
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}
