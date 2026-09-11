/**
 * Console dei clienti marketing: un mese alla volta, una scheda per cliente.
 * «Aggiorna costi Meta» chiede a Meta la spesa del mese di ogni cliente con
 * l'account pubblicitario scelto; tutto il resto arriva già pronto dal
 * database (admin_clienti_marketing_riepilogo).
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteMarketingCard } from "./ClienteMarketingCard";
import { CostiMeseDialog } from "./CostiMeseDialog";
import { useAggiornaSpesaMeta } from "./useClientiMarketing";
import { useEntraInAzienda } from "./useEntraInAzienda";
import { meseLeggibile, spostaMese, type ClienteMarketing } from "./provvigioni";

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
  onVaiAiContratti: () => void;
}

export function ClientiMarketingPanel({ mese, meseOggi, oggi, onMese, righe, isLoading, isError, isFetching, refetch, onModifica, onIncassi, onVaiAiContratti }: Props) {
  const [mostraCessati, setMostraCessati] = useState(false);
  const [costiDi, setCostiDi] = useState<ClienteMarketing | null>(null);
  const aggiorna = useAggiornaSpesaMeta(mese);
  const { entra, inCorso, permesso } = useEntraInAzienda();
  const meseCorrente = mese === meseOggi;
  const leggibile = meseLeggibile(mese);
  const cessati = righe.filter((r) => r.stato === "cessato").length;
  const visibili = mostraCessati ? righe : righe.filter((r) => r.stato !== "cessato");
  const conMeta = righe.filter((r) => r.stato === "attivo" && r.meta_stato === "connected" && r.meta_account_id).length;

  const aggiornaMeta = async () => {
    try {
      const e = await aggiorna.mutateAsync(righe);
      const dettagli = [
        e.saltati.length ? `Senza account Meta: ${e.saltati.join(", ")}` : null,
        e.errori.length ? `Errori: ${e.errori.map((x) => `${x.nome} (${x.motivo})`).join("; ")}` : null,
      ].filter(Boolean).join(" · ");
      if (e.aggiornati.length) toast.success(`Spesa Meta di ${leggibile} aggiornata per ${e.aggiornati.length} client${e.aggiornati.length === 1 ? "e" : "i"}`, { description: dettagli || undefined });
      else toast.warning("Nessuna spesa Meta aggiornata", { description: dettagli || "Nessun cliente attivo con un account pubblicitario Meta scelto." });
    } catch (err) {
      toast.error("Aggiornamento non riuscito", { description: err instanceof Error ? err.message : String(err) });
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
            title={conMeta === 0 ? "Nessun cliente attivo con un account Meta scelto" : `Scarica da Meta la spesa di ${leggibile} per ${conMeta} client${conMeta === 1 ? "e" : "i"}`}>
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
          {visibili.map((c) => (
            <ClienteMarketingCard
              key={c.service_client_id}
              c={c}
              meseCorrente={meseCorrente}
              meseLeggibile={leggibile}
              oggi={oggi}
              entraInCorso={inCorso === c.company_id}
              puoEntrare={permesso}
              onEntra={() => void entra(c.company_id)}
              onCosti={() => setCostiDi(c)}
              onIncassi={() => onIncassi(c.service_client_id)}
              onModifica={() => onModifica(c.service_client_id)}
            />
          ))}
        </div>
      )}

      {/* La chiave rimonta il dialog a ogni cliente/mese: la data proposta riparte da capo. */}
      <CostiMeseDialog key={`${mese}-${costiDi?.company_id ?? ""}`} cliente={costiDi} mese={mese} meseLeggibile={leggibile} oggi={oggi} open={!!costiDi} onOpenChange={(v) => { if (!v) setCostiDi(null); }} />
    </div>
  );
}
