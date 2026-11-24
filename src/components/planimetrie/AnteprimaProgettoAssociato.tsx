import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { creaAnteprimaPianta } from "@/lib/planimetrie/anteprime";
import { caricaUtilizziPianta, type RiepilogoVersioni } from "@/lib/planimetrie/utilizziPianta";
import { percorsoProgettoAssociato } from "@/lib/planimetrie/render/percorsi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function VersioniUsate({ titolo, dati, corrente }: { titolo: string; dati: RiepilogoVersioni; corrente: number }) {
  const t = useT();
  const vecchi = dati.versioni.filter((v) => v.versione !== null && v.versione < corrente).reduce((s, v) => s + v.numero, 0);
  return <section className="space-y-2 rounded-xl border p-3"><h4 className="text-sm font-medium">{titolo} · {dati.totale}</h4><div className="flex flex-wrap gap-1.5">{dati.versioni.map((v) => <Badge key={v.versione ?? "ignota"} variant="outline" className={v.versione && v.versione < corrente ? "border-amber-300 text-amber-800" : ""}>{v.versione ? `v${v.versione}` : t("Versione non indicata")}: {v.numero}</Badge>)}</div>{!dati.totale && <p className="text-xs text-muted-foreground">{t("Nessun utilizzo registrato.")}</p>}{vecchi > 0 && <p className="text-xs text-amber-800">{titolo === t("Render") ? t("{n} render di versioni precedenti. Verifica prima di aggiornare.", { n: vecchi }) : t("{n} righe di misura di versioni precedenti. Verifica prima di aggiornare.", { n: vecchi })}</p>}{dati.parziale && <p className="text-xs text-muted-foreground">{t("Versioni dei primi 200 risultati; totale {totale}.", { totale: String(dati.totale ?? "") })}</p>}</section>;
}

export default function AnteprimaProgettoAssociato({ id, companyId, torna, onChiudi }: { id: string; companyId: string; torna: string; onChiudi: () => void }) {
  const t = useT();
  const permessi = usePermissions();
  const pianta = usePlanimetria(id);
  const utilizzi = useQuery({ queryKey: ["planimetrie", "utilizzi", companyId, id, permessi.canViewOrders || permessi.canViewPreventivi], queryFn: () => caricaUtilizziPianta(companyId, id, permessi.canViewOrders || permessi.canViewPreventivi), staleTime: 30_000, retry: 1 });
  const data = pianta.data?.riga.company_id === companyId ? pianta.data : null;
  let anteprima;
  if (data) { try { anteprima = creaAnteprimaPianta(data.versione.documento); } catch { /* Il progetto rimane apribile se l'anteprima non è disponibile. */ } }
  return <Dialog open onOpenChange={(open) => { if (!open) onChiudi(); }}><DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{data?.riga.titolo ?? t("Anteprima del progetto")}</DialogTitle><DialogDescription>{data ? t("Versione corrente {numero} · Disegno salvato nel progetto", { numero: String(data.versione.numero ?? "") }) : t("Anteprima della planimetria associata")}</DialogDescription></DialogHeader>
    {pianta.isLoading ? <p role="status">{t("Carico il disegno…")}</p> : pianta.error || !data ? <p role="alert">{t("La planimetria non è disponibile in questa azienda.")}</p> : <>
      {anteprima ? <div className="rounded-xl border bg-muted/20 p-3"><img src={anteprima.src} alt={t("Planimetria {titolo}, versione {numero}", { titolo: String(data.riga.titolo ?? ""), numero: String(data.versione.numero ?? "") })} className="h-64 w-full object-contain sm:h-80" /><p className="mt-2 text-xs text-muted-foreground">{t("{piano} · {stanze} stanze · {superficie} m²", { piano: String(anteprima.piano ?? ""), stanze: String(anteprima.stanze ?? ""), superficie: anteprima.superficie.toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) })}</p></div> : <p className="text-sm text-muted-foreground">{t("Anteprima non disponibile. Puoi aprire il progetto.")}</p>}
      {utilizzi.isLoading ? <p role="status" className="text-sm">{t("Controllo le versioni utilizzate…")}</p> : utilizzi.error ? <p role="alert" className="text-sm">{t("Non riesco a verificare le versioni usate da render e misure.")}</p> : utilizzi.data && <div className="grid gap-3 sm:grid-cols-2"><VersioniUsate titolo={t("Render")} dati={utilizzi.data.render} corrente={data.versione.numero} />{utilizzi.data.misure && <VersioniUsate titolo={t("Misure")} dati={utilizzi.data.misure} corrente={data.versione.numero} />}</div>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onChiudi}>{t("Chiudi")}</Button><Button variant="outline" asChild><Link to={percorsoProgettoAssociato(id, torna)}>{t("Apri progetto")}</Link></Button><Button asChild><Link to={percorsoProgettoAssociato(id, torna, true)}>{t("Fascicolo PDF")}</Link></Button></div>
    </>}
  </DialogContent></Dialog>;
}
