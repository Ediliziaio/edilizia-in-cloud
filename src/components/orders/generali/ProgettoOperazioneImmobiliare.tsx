import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutPanelTop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIpotesiOrigineCommessa } from "@/hooks/useGeneraleSimulatore";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { calcolaVoce } from "@/lib/computo/editorNativo";
import { confrontoComputoPiano } from "@/lib/orders/generali/confrontoComputoPiano";
import { useVersioniPiano, useVociPiano } from "@/hooks/useGeneralePiano";
import type { DatiSezioni } from "@/lib/orders/generali/datiOperazione";
import { caricaPlanimetria, caricaVersione, fonteStudioDellaCommessa } from "@/lib/planimetrie/archivio";
import { percorsoVariantePlanimetria } from "@/lib/planimetrie/render/percorsi";
import { fonteStudioDaArea, idComputoStudio } from "@/lib/planimetrie/studioImmobiliare";
import { ComputoStudioInCommessa } from "@/components/planimetrie/ComputoStudioInCommessa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function ProgettoOperazioneImmobiliare({ dati, generaleId, puoDocumenti }: { dati?: DatiSezioni; generaleId: string; puoDocumenti: boolean }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id;
  const puoPianta = !!permessi.canViewRenderAi && !!permessi.canViewOrders;
  const daArea = fonteStudioDaArea(dati?.area);
  // Senza il collegamento scritto dal simulatore vale la pianta legata alla commessa.
  const dellaCommessa = useQuery({
    queryKey:["progetto-operazione-pianta",companyId,generaleId],
    enabled:!daArea && !!companyId && puoPianta,
    queryFn:()=>fonteStudioDellaCommessa(companyId!,generaleId),
  });
  const fonte = daArea ?? dellaCommessa.data ?? null;
  const puoIpotesi = !!permessi.canViewOrders && !!(permessi.isAdmin || permessi.canViewMargins);
  const origine = useIpotesiOrigineCommessa(generaleId,puoIpotesi);
  const info = useQuery({
    queryKey:["progetto-operazione",companyId,fonte,permessi.canViewPreventivi],
    enabled:!!fonte && !!companyId && puoPianta,
    queryFn:async()=>{
      const pianta = await caricaPlanimetria(fonte!.planimetriaId);
      if (companyId !== pianta.riga.company_id) throw new Error("Planimetria non disponibile.");
      const v = pianta.versione.numero===fonte!.versione ? pianta.versione : await caricaVersione(fonte!.planimetriaId,fonte!.versione);
      if (!v.documento.livelli.some(l=>l.proposte.some(p=>p.id===fonte!.varianteId))) throw new Error("Variante non disponibile.");
      const bozzaId = permessi.canViewPreventivi ? await idComputoStudio(fonte!) : null;
      const computo = bozzaId ? await leggiComputoCloud(companyId,bozzaId).catch((): null=>null) : null;
      const totaleComputo = computo ? computo.bozza.voci.reduce((s,v)=>s+(v.opzionale ? 0 : calcolaVoce(v).importo ?? 0),0) : 0;
      return {titolo:pianta.riga.titolo,bozzaId:computo ? bozzaId : null,totaleComputo};
    },
  });
  const progetto = puoPianta ? info.data : undefined;
  // Il computo contro le opere del business plan: solo per chi vede i margini.
  const versioni = useVersioniPiano(generaleId, puoIpotesi && !!progetto?.totaleComputo);
  const ultima = Array.isArray(versioni.data) ? versioni.data[0] : undefined;
  const vociPiano = useVociPiano(puoIpotesi ? ultima?.id : null);
  const confronto = progetto?.totaleComputo && Array.isArray(vociPiano.data) ? confrontoComputoPiano(progetto.totaleComputo, vociPiano.data) : null;
  const ipotesiId = puoIpotesi ? origine.data : null;
  if (!(fonte && puoPianta) && !ipotesiId) return null;
  const torna = `/azienda/ordini/${generaleId}`;
  return <section aria-label={t("Progetto della commessa")} className="space-y-2.5 rounded-xl border bg-card p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><LayoutPanelTop className="h-4 w-4 text-primary"/>{t("Progetto e verifiche")}</h3>
    {fonte && puoPianta && <p className="text-sm text-muted-foreground">{info.data?.titolo ?? t("Planimetria della variante")} · {t("Versione {n}", { n: fonte.versione })}</p>}
    {confronto && confronto.piano > 0 && <p className="text-sm" role="status">
      {t("Computo dalla pianta")} <strong className="tabular-nums">{EURO.format(confronto.computo)}</strong> · {t("opere nel business plan")} <strong className="tabular-nums">{EURO.format(confronto.piano)}</strong>
      {" · "}<span className={confronto.differenza > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
        {confronto.differenza > 0 ? t("il computo supera il piano di") : t("differenza")} {EURO.format(Math.abs(confronto.differenza))}{confronto.percento !== null ? ` (${Math.abs(confronto.percento).toLocaleString("it-IT")}%)` : ""}
      </span>
      <span className="block text-xs text-muted-foreground">{t("Il computo comprende solo le lavorazioni che si ricavano dalla pianta: piscine, sistemazioni del lotto, opere da fabbro e forniture a parte vanno aggiunte.")}</span>
    </p>}
    {puoPianta && info.isError && <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <span>{t("La revisione collegata della planimetria non è disponibile.")}</span>
      <Button size="sm" variant="ghost" onClick={()=>void info.refetch()}>{t("Riprova")}</Button>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      {fonte && progetto && <>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna})}>{t("Apri la variante")}</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna,fascicolo:"urbanistica"})}>{t("Fascicolo urbanistico")}</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna,fascicolo:"pratiche"})}>{t("Pratiche della variante")}</Link></Button>
      </>}
      {ipotesiId && <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini/simulatore?ipotesi=${encodeURIComponent(ipotesiId)}`}>{t("Business plan collegato")}</Link></Button>}
      {progetto?.bozzaId && <Button asChild size="sm" variant="outline"><Link to={`/azienda/marketing/preventivi/computo?bozza=${progetto.bozzaId}&esistente=1&fase=3`}>{t("Apri il computo")}</Link></Button>}
      {progetto?.bozzaId && companyId && <ComputoStudioInCommessa companyId={companyId} orderId={generaleId} bozzaId={progetto.bozzaId}
        generale puoSalvare={permessi.canEditOrders && !permessi.solaLettura} />}
      {puoDocumenti && <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini/${generaleId}?scheda=documenti`}>{t("Documenti di commessa")}</Link></Button>}
    </div>
  </section>;
}
