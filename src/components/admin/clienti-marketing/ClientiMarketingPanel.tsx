/**
 * Console dei clienti marketing: un mese alla volta, in cima la lista di cosa
 * fare oggi, poi una scheda per cliente. «Aggiorna costi Meta» chiede a Meta
 * la spesa del mese di ogni cliente con l'account pubblicitario scelto (di
 * notte lo fa da solo meta-ads-sync-insights); tutto il resto arriva già
 * pronto dal database (admin_clienti_marketing_riepilogo).
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
import { CosaFareOggi } from "./CosaFareOggi";
import { CostiMeseDialog } from "./CostiMeseDialog";
import { useAggiornaSpesaMeta } from "./useClientiMarketing";
import { useEntraInAzienda } from "./useEntraInAzienda";
import { cosaFareOggi, linkGestioneInserzioni, linkWhatsapp, meseLeggibile, spostaMese, type ClienteMarketing, type VoceOggi } from "./provvigioni";

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

export function ClientiMarketingPanel({ mese, meseOggi, oggi, onMese, righe, isLoading, isError, isFetching, refetch, onModifica, onIncassi, onReport, onVaiAiContratti }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mostraCessati, setMostraCessati] = useState(false);
  const [costiDi, setCostiDi] = useState<ClienteMarketing | null>(null);
  const [promemoriaDi, setPromemoriaDi] = useState<ClienteMarketing | null>(null);
  const aggiorna = useAggiornaSpesaMeta(mese);
  const { entra, inCorso, permesso } = useEntraInAzienda();
  const meseCorrente = mese === meseOggi;
  const leggibile = meseLeggibile(mese);
  const cessati = righe.filter((r) => r.stato === "cessato").length;
  const visibili = mostraCessati ? righe : righe.filter((r) => r.stato !== "cessato");
  const conMeta = righe.filter((r) => r.stato === "attivo" && r.meta_stato === "connected" && r.meta_account_id).length;
  const voci = useMemo(() => cosaFareOggi(righe, meseCorrente), [righe, meseCorrente]);

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

  /** Ogni voce della lista ha un'azione che la chiude, o almeno la avvicina. */
  const eseguiAzione = (v: VoceOggi) => {
    const c = righe.find((r) => r.service_client_id === v.service_client_id);
    if (!c) return;
    switch (v.azione) {
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
          {meseCorrente && <CosaFareOggi voci={voci} inCorso={inCorso} puoEntrare={permesso} onAzione={eseguiAzione} />}
          {visibili.map((c) => (
            <ClienteMarketingCard
              key={c.service_client_id}
              c={c}
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
              onReport={() => onReport(c.service_client_id)}
            />
          ))}
        </div>
      )}

      {/* La chiave rimonta il dialog a ogni cliente/mese: la data proposta riparte da capo. */}
      <CostiMeseDialog key={`${mese}-${costiDi?.company_id ?? ""}`} cliente={costiDi} mese={mese} meseLeggibile={leggibile} oggi={oggi} open={!!costiDi} onOpenChange={(v) => { if (!v) setCostiDi(null); }} />

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
