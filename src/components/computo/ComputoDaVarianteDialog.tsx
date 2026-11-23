import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { useElencoPlanimetrie, usePlanimetria, useVersionePlanimetria, useVersioniPlanimetria } from "@/lib/planimetrie/archivio";
import { apriComputoDaVariante } from "@/lib/planimetrie/computoDaVariante";
import { idComputoStudio, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { ambitiDi } from "../../../shared/planimetrie/modello.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ComputoDaVarianteDialog({ companyId, userId, onChiudi, onApri }: {
  companyId: string;
  userId: string;
  onChiudi: () => void;
  onApri: (id: string) => void;
}) {
  const t = useT();
  const [planimetriaId, setPianta] = useState("");
  const [numero, setVersione] = useState<number | null>(null);
  const [variante, setVariante] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const inCorso = useRef(false);
  const piante = useElencoPlanimetrie(companyId);
  const corrente = usePlanimetria(planimetriaId);
  const versioni = useVersioniPlanimetria(planimetriaId);
  const storico = numero !== null && numero !== corrente.data?.versione.numero;
  const vecchia = useVersionePlanimetria(planimetriaId,storico ? numero : null);
  const v = storico ? vecchia.data : corrente.data?.versione;
  const documento = v?.documento;
  const { varianti, varianteId, studio } = useMemo(() => {
    const ambiti = documento ? ambitiDi(documento).filter(a => a.propostaId !== null) : [];
    const selezionata = ambiti.find(a => a.propostaId === variante)?.propostaId ?? ambiti[0]?.propostaId;
    return { varianti: ambiti, varianteId: selezionata, studio: documento && selezionata ? studioVariante(documento, selezionata) : null };
  }, [documento, variante]);
  const fonte = v && varianteId ? { planimetriaId, versione:v.numero, varianteId } : null;
  const esistente = useQuery({
    queryKey:["computo-studio",companyId,planimetriaId,v?.numero,varianteId],
    enabled:!!fonte && corrente.data?.riga.company_id === companyId,
    queryFn:async()=>{
      const id = await idComputoStudio(fonte!);
      return await leggiComputoCloud(companyId,id) ? id : null;
    },
  });
  const daRivedere = !!(studio?.bagniDaRivedere.length || studio?.cucineDaRivedere.length);
  const mancano = studio?.righe.filter(r=>r.quantita === null).length ?? 0;
  const erroreLettura = piante.error || corrente.error || vecchia.error || esistente.error;
  const pronta = fonte && !esistente.isPending && !erroreLettura && corrente.data?.riga.company_id === companyId
    && (esistente.data || (studio?.righe.length && !daRivedere));
  const apri = async (e: FormEvent) => {
    e.preventDefault();
    if (!pronta || !fonte || inCorso.current) return;
    setErrore("");
    inCorso.current = true;
    setOccupato(true);
    try {
      const { id } = await apriComputoDaVariante(companyId,userId,fonte);
      onApri(id);
    } catch (error) {
      setErrore(error instanceof Error ? error.message : "Computo non disponibile.");
    } finally {
      setOccupato(false);
      inCorso.current = false;
    }
  };

  return <Dialog open onOpenChange={o=>{ if (!o && !inCorso.current) onChiudi(); }}>
    <DialogContent ampiezza="modulo">
      <DialogHeader>
        <DialogTitle>{t("Computo da planimetria")}</DialogTitle>
        <DialogDescription>{t("Scegli la variante da cui ricavare lavorazioni e misure. Il computo si apre come bozza dedicata.")}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={apri}>
        <fieldset disabled={occupato} className="min-w-0 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="computo-planimetria">{t("Planimetria")}</Label>
            <UniformSelect id="computo-planimetria" value={planimetriaId} disabled={piante.isPending} onChange={e=>{
              setPianta(e.target.value);
              setVersione(null);
              setVariante("");
              setErrore("");
            }}>
              <option value="">{piante.isPending ? t("Caricamento…") : t("Scegli la planimetria")}</option>
              {(piante.data ?? []).map(p=><option key={p.id} value={p.id}>{p.titolo}</option>)}
            </UniformSelect>
          </div>
          {corrente.data && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="computo-versione-pianta">{t("Versione")}</Label>
              <UniformSelect id="computo-versione-pianta" value={String(numero ?? corrente.data.versione.numero)} onChange={e=>{
                setVersione(Number(e.target.value));
                setVariante("");
                setErrore("");
              }}>
                {(versioni.data?.length ? versioni.data : [corrente.data.versione]).map(item=>
                  <option key={item.numero} value={item.numero}>{t("Versione")} {item.numero}{item.numero===corrente.data?.versione.numero ? ` ${t("· corrente")}` : ""}</option>)}
              </UniformSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="computo-variante-pianta">{t("Variante di progetto")}</Label>
              <UniformSelect id="computo-variante-pianta" value={varianteId ?? ""} disabled={!varianti.length} onChange={e=>{
                setVariante(e.target.value);
                setErrore("");
              }}>
                {!varianti.length && <option value="">{v ? t("Nessuna variante") : t("Caricamento…")}</option>}
                {varianti.map(a=><option key={a.chiave} value={a.propostaId!}>{a.nome}</option>)}
              </UniformSelect>
            </div>
          </div>}
        </fieldset>
        {planimetriaId && corrente.isPending && <p role="status" className="text-sm text-muted-foreground">{t("Carico le versioni della planimetria…")}</p>}
        {!!v && !varianti.length && <p className="text-sm text-muted-foreground">{t("Salva una variante nella planimetria per ricavare le lavorazioni.")}</p>}
        {studio && <div role="status" className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          {esistente.data ? t("Computo già salvato per questa variante.") : studio.righe.length ?
            <><strong>{studio.righe.length} {studio.righe.length===1 ? t("lavorazione") : t("lavorazioni")}</strong>{mancano ? t(" · {mancano} quantità da completare", { mancano: String(mancano ?? "") }) : ""}</> :
            t("Aggiungi lavorazioni alla variante per generare il computo.")}
          {daRivedere && <p className="text-amber-800">{t("Rivedi i locali degli spostamenti nella variante.")}</p>}
        </div>}
        {(errore || erroreLettura) && <p role="alert" className="text-sm text-destructive">{errore || erroreLettura?.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={occupato} onClick={onChiudi}>{t("Annulla")}</Button>
          <Button type="submit" disabled={!pronta || occupato}>{occupato ? t("Apertura…") : esistente.data ? t("Apri computo salvato") : t("Genera computo")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
