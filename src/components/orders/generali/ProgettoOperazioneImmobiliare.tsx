import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutPanelTop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIpotesiOrigineCommessa } from "@/hooks/useGeneraleSimulatore";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import type { DatiSezioni } from "@/lib/orders/generali/datiOperazione";
import { caricaPlanimetria, caricaVersione } from "@/lib/planimetrie/archivio";
import { percorsoVariantePlanimetria } from "@/lib/planimetrie/render/percorsi";
import { fonteStudioDaArea, idComputoStudio } from "@/lib/planimetrie/studioImmobiliare";
import { ComputoStudioInCommessa } from "@/components/planimetrie/ComputoStudioInCommessa";

export function ProgettoOperazioneImmobiliare({ dati, generaleId, puoDocumenti }: { dati?: DatiSezioni; generaleId: string; puoDocumenti: boolean }) {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id;
  const fonte=fonteStudioDaArea(dati?.area);
  const puoPianta = !!permessi.canViewRenderAi && !!permessi.canViewOrders;
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
      return {titolo:pianta.riga.titolo,bozzaId:computo ? bozzaId : null};
    },
  });
  const progetto = puoPianta ? info.data : undefined;
  const ipotesiId = puoIpotesi ? origine.data : null;
  if (!(fonte && puoPianta) && !ipotesiId) return null;
  const torna = `/azienda/ordini/${generaleId}`;
  return <section aria-label="Progetto della commessa" className="space-y-2.5 rounded-xl border bg-card p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><LayoutPanelTop className="h-4 w-4 text-primary"/>Progetto e verifiche</h3>
    {fonte && puoPianta && <p className="text-sm text-muted-foreground">{info.data?.titolo ?? "Planimetria della variante"} · Versione {fonte.versione}</p>}
    {puoPianta && info.isError && <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <span>La revisione collegata della planimetria non è disponibile.</span>
      <Button size="sm" variant="ghost" onClick={()=>void info.refetch()}>Riprova</Button>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      {fonte && progetto && <>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna})}>Apri la variante</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna,fascicolo:"urbanistica"})}>Fascicolo urbanistico</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to={percorsoVariantePlanimetria(fonte,{torna,fascicolo:"pratiche"})}>Pratiche della variante</Link></Button>
      </>}
      {ipotesiId && <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini/simulatore?ipotesi=${encodeURIComponent(ipotesiId)}`}>Business plan collegato</Link></Button>}
      {progetto?.bozzaId && <Button asChild size="sm" variant="outline"><Link to={`/azienda/marketing/preventivi/computo?bozza=${progetto.bozzaId}&esistente=1&fase=3`}>Apri il computo</Link></Button>}
      {progetto?.bozzaId && companyId && <ComputoStudioInCommessa companyId={companyId} orderId={generaleId} bozzaId={progetto.bozzaId}
        generale puoSalvare={permessi.canEditOrders && !permessi.solaLettura} />}
      {puoDocumenti && <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini/${generaleId}?scheda=documenti`}>Documenti di commessa</Link></Button>}
    </div>
  </section>;
}
