/**
 * Console dei clienti marketing: un mese alla volta, in cima la lista di cosa
 * fare oggi (gli allarmi del motore di regole del manuale), poi una scheda per
 * cliente con semaforo e soglie. «Aggiorna costi Meta» chiede a Meta la spesa
 * del mese; di notte lo fa da solo meta-ads-sync-insights. Tutto il resto
 * arriva già pronto dal database.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTaskDialog } from "@/components/admin/tasks/NewTaskDialog";
import { ClienteMarketingCard } from "./ClienteMarketingCard";
import { CosaFareOggi, type AllarmeConCliente } from "./CosaFareOggi";
import { CostiMeseDialog } from "./CostiMeseDialog";
import { SoglieDialog } from "./SoglieDialog";
import { useAggiornaSpesaMeta } from "./useClientiMarketing";
import { useChiudiAllarme, useMktConsole, useRicalcola } from "./useMktConsole";
import { useEntraInAzienda } from "./useEntraInAzienda";
import {
  COPERTI_DAL_MOTORE, azionePerRegola, cosaFareOggi, linkGestioneInserzioni, linkWhatsapp, meseLeggibile, spostaMese,
  type AzioneOggi, type ClienteMarketing, type VoceOggi,
} from "./provvigioni";

interface Props {
  mese: string;
  meseOggi: string;
  oggi: Date;
  onMese: (m: string) => void;
  righe: ClienteMarketing[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
  onModifica: (serviceClientId: string) => void;
  onIncassi: (serviceClientId: string) => void;
  onReport: (serviceClientId: string) => void;
  onVaiAiContratti: () => void;
}

const SEMAFORO_ETICHETTA: Record<string, string> = { V: "verdi", G: "gialli", R: "rossi", N: "senza dati" };

export function ClientiMarketingPanel({ mese, meseOggi, oggi, onMese, righe, isLoading, isError, isFetching, refetch, onModifica, onIncassi, onReport, onVaiAiContratti }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mostraCessati, setMostraCessati] = useState(false);
  const [costiDi, setCostiDi] = useState<ClienteMarketing | null>(null);
  const [promemoriaDi, setPromemoriaDi] = useState<ClienteMarketing | null>(null);
  const [soglieDi, setSoglieDi] = useState<ClienteMarketing | null>(null);
  const aggiorna = useAggiornaSpesaMeta(mese);
  const motore = useMktConsole();
  const chiudi = useChiudiAllarme();
  const ricalcola = useRicalcola();
  const { entra, inCorso, permesso } = useEntraInAzienda();
  const meseCorrente = mese === meseOggi;
  const leggibile = meseLeggibile(mese);
  const cessati = righe.filter((r) => r.stato === "cessato").length;
  const visibili = mostraCessati ? righe : righe.filter((r) => r.stato !== "cessato");
  const conMeta = righe.filter((r) => r.stato === "attivo" && r.meta_stato === "connected" && r.meta_account_id).length;
  const perId = useMemo(() => new Map(righe.map((r) => [r.service_client_id, r])), [righe]);

  // Gli allarmi del motore con il nome del cliente; gli avvisi della console
  // restano solo per ciò che il motore non copre (o per tutto, finché il
  // motore non ha ancora calcolato niente).
  const allarmi: AllarmeConCliente[] = useMemo(() => (motore.data?.allarmi ?? [])
    .map((a) => { const c = perId.get(a.service_client_id); return c && c.stato === "attivo" ? { ...a, cliente: c.cliente_nome, company_id: c.company_id } : null; })
    .filter((a): a is AllarmeConCliente => a !== null), [motore.data?.allarmi, perId]);
  const motoreAttivo = (motore.data?.metriche.size ?? 0) > 0;
  const voci: VoceOggi[] = useMemo(() => {
    const tutte = cosaFareOggi(righe, meseCorrente);
    return motoreAttivo ? tutte.filter((v) => !COPERTI_DAL_MOTORE.has(v.tipo)) : tutte;
  }, [righe, meseCorrente, motoreAttivo]);
  const semafori = useMemo(() => {
    const c: Record<string, number> = { V: 0, G: 0, R: 0, N: 0 };
    for (const r of righe) if (r.stato === "attivo") c[motore.data?.metriche.get(r.service_client_id)?.semaforo ?? "N"] += 1;
    return c;
  }, [righe, motore.data?.metriche]);
  const aggiornatoAlle = useMemo(() => {
    let max: string | null = null;
    for (const m of motore.data?.metriche.values() ?? []) if (!max || m.calcolato_il > max) max = m.calcolato_il;
    return max;
  }, [motore.data?.metriche]);

  const aggiornaMeta = async () => {
    try {
      const e = await aggiorna.mutateAsync(righe);
      const dettagli = [
        e.senzaSpesa.length ? `Nessuna spesa su Meta nel mese: ${e.senzaSpesa.join(", ")}` : null,
        e.saltati.length ? `Senza account Meta: ${e.saltati.join(", ")}` : null,
        e.errori.length ? `Errori: ${e.errori.map((x) => `${x.nome} (${x.motivo})`).join("; ")}` : null,
      ].filter(Boolean).join(" · ");
      const letti = e.aggiornati.length + e.senzaSpesa.length;
      if (letti) toast.success(`Spesa Meta di ${leggibile} letta per ${letti} client${letti === 1 ? "e" : "i"}`, { description: dettagli || undefined });
      else toast.warning("Nessuna spesa Meta letta", { description: dettagli || "Nessun cliente attivo con un account pubblicitario Meta scelto." });
    } catch (err) {
      toast.error("Aggiornamento non riuscito", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const apriEsterno = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  /** Ogni azione porta dove si risolve la cosa: dentro l'azienda, su Meta, al referente, ai costi, agli incassi. */
  const eseguiAzione = (azione: AzioneOggi, c: ClienteMarketing) => {
    switch (azione) {
      case "lead_fermi": void entra(c.company_id, "/azienda/marketing/opportunita"); break;
      case "ricollega_meta": void entra(c.company_id, "/azienda/marketing/pubblicita"); break;
      case "moduli": void entra(c.company_id, "/azienda/marketing/facebook-forms"); break;
      case "fatture": void entra(c.company_id, "/azienda/impostazioni/integrazioni"); break;
      case "inserzioni": {
        const link = linkGestioneInserzioni(c.meta_account_id);
        if (link) apriEsterno(link); else void entra(c.company_id);
        break;
      }
      case "costi": setCostiDi(c); break;
      case "incassi": onIncassi(c.service_client_id); break;
      case "referente": {
        const wa = linkWhatsapp(c.referente_telefono);
        if (wa) apriEsterno(wa);
        else if (c.referente_email) window.location.href = `mailto:${c.referente_email}`;
        else void entra(c.company_id);
        break;
      }
      case "promemoria": navigate("/admin/attivita"); break;
      default: void entra(c.company_id);
    }
  };

  const chiudiAllarme = async (id: string, esito: "risolto" | "falso_positivo" | "rimandato") => {
    try {
      await chiudi.mutateAsync({ id, esito });
      toast.success(esito === "rimandato" ? "Rimandato a domani" : esito === "falso_positivo" ? "Segnato: non era un problema" : "Fatto");
    } catch (e) {
      toast.error("Non riesco a chiudere l'allarme", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const ricalcolaAdesso = async () => {
    try {
      const r = await ricalcola.mutateAsync();
      toast.success(`Ricalcolato: ${r.clienti} clienti, ${r.allarmi_nuovi} allarmi nuovi`);
    } catch (e) {
      toast.error("Ricalcolo non riuscito", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMese(spostaMese(mese, -1))} aria-label="Mese precedente"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[10rem] px-2 text-center text-sm font-semibold capitalize">{leggibile}</span>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMese(spostaMese(mese, 1))} disabled={meseCorrente} aria-label="Mese successivo"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {!meseCorrente && <Button variant="ghost" size="sm" onClick={() => onMese(meseOggi)}>Mese in corso</Button>}
        {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Aggiornamento in corso" />}
        {motoreAttivo && (
          <span className="text-xs text-muted-foreground">
            {(["V", "G", "R", "N"] as const).filter((k) => semafori[k] > 0).map((k) => (
              <span key={k} className="mr-2 inline-flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${k === "V" ? "bg-emerald-500" : k === "G" ? "bg-amber-500" : k === "R" ? "bg-rose-500" : "bg-slate-400"}`} />{semafori[k]} {SEMAFORO_ETICHETTA[k]}
              </span>
            ))}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cessati > 0 && (
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setMostraCessati((v) => !v)}>
              {mostraCessati ? "nascondi i cessati" : `mostra anche ${cessati} cessat${cessati === 1 ? "o" : "i"}`}
            </button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void aggiornaMeta()} disabled={aggiorna.isPending || conMeta === 0}
            title={conMeta === 0 ? "Nessun cliente attivo con un account Meta scelto" : `Scarica da Meta la spesa di ${leggibile} per ${conMeta} client${conMeta === 1 ? "e" : "i"} (di notte succede da solo)`}>
            {aggiorna.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Aggiorna costi Meta
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}</div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-14 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500/60" />
          <p className="text-sm text-muted-foreground">Non riesco a leggere i numeri dei clienti marketing.</p>
          <Button variant="outline" size="sm" onClick={refetch}>Riprova</Button>
        </div>
      ) : righe.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-14 text-center">
          <Users className="h-9 w-9 text-muted-foreground/40" />
          <p className="max-w-md text-sm text-muted-foreground">
            Qui compaiono i clienti di un servizio marketing collegati a un'azienda della piattaforma. Crea il contratto scegliendo l'azienda nella ricerca cliente.
          </p>
          <Button variant="outline" size="sm" onClick={onVaiAiContratti}>Vai ai contratti</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {meseCorrente && (
            <CosaFareOggi
              allarmi={allarmi}
              voci={voci}
              aggiornatoAlle={aggiornatoAlle}
              oggi={oggi}
              inCorso={inCorso}
              puoEntrare={permesso}
              onApri={(a) => { const c = perId.get(a.service_client_id); if (c) eseguiAzione(azionePerRegola(a.regola), c); }}
              onChiudi={(id, esito) => void chiudiAllarme(id, esito)}
              chiusuraInCorso={chiudi.isPending}
              onAzione={(v) => { const c = perId.get(v.service_client_id); if (c) eseguiAzione(v.azione, c); }}
              onRicalcola={() => void ricalcolaAdesso()}
              ricalcoloInCorso={ricalcola.isPending}
            />
          )}
          {visibili.map((c) => (
            <ClienteMarketingCard
              key={c.service_client_id}
              c={c}
              metriche={motore.data?.metriche.get(c.service_client_id) ?? null}
              meseCorrente={meseCorrente}
              meseLeggibile={leggibile}
              oggi={oggi}
              entraInCorso={inCorso === c.company_id}
              puoEntrare={permesso}
              onEntra={(pagina) => void entra(c.company_id, pagina)}
              onCosti={() => setCostiDi(c)}
              onIncassi={() => onIncassi(c.service_client_id)}
              onModifica={() => onModifica(c.service_client_id)}
              onPromemoria={() => setPromemoriaDi(c)}
              onSoglie={() => setSoglieDi(c)}
              onReport={() => onReport(c.service_client_id)}
            />
          ))}
        </div>
      )}

      {/* La chiave rimonta il dialog a ogni cliente/mese: la data proposta riparte da capo. */}
      <CostiMeseDialog key={`${mese}-${costiDi?.company_id ?? ""}`} cliente={costiDi} mese={mese} meseLeggibile={leggibile} oggi={oggi} open={!!costiDi} onOpenChange={(v) => { if (!v) setCostiDi(null); }} />

      <SoglieDialog
        key={soglieDi?.service_client_id ?? "nessuno"}
        cliente={soglieDi}
        soglia={soglieDi ? motore.data?.soglie.get(soglieDi.service_client_id) ?? null : null}
        benchmark={motore.data?.benchmark ?? []}
        oggi={oggi}
        open={!!soglieDi}
        onOpenChange={(v) => { if (!v) setSoglieDi(null); }}
      />

      {/* Il promemoria è un'attività della piattaforma sull'azienda del cliente:
          finisce in Attività e torna qui nella scheda e nella lista del mattino. */}
      <NewTaskDialog
        key={promemoriaDi?.service_client_id ?? "nessuno"}
        open={!!promemoriaDi}
        onOpenChange={(v) => { if (!v) setPromemoriaDi(null); }}
        prefill={promemoriaDi ? { companyId: promemoriaDi.company_id, type: "follow_up", title: `${promemoriaDi.cliente_nome}: ` } : undefined}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["clienti-marketing", "riepilogo"] });
          setPromemoriaDi(null);
        }}
      />
    </div>
  );
}
