import { RitenuteClienteCommessa, useRitenuteClienteCommessa } from "./RitenuteClienteCommessa";
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { FiscalReleaseDialog } from '@/components/fatturazione/FiscalReleaseDialog';
import { formatCurrency } from '@/lib/formatters';
import { useRitenuteGaranzia } from '@/hooks/useRitenuteGaranzia';
import { RitenuteTable } from './RitenuteTable';
import { RitenutaFormModal } from './RitenutaFormModal';
import { Button } from '@/components/ui/button';
import { SezioneRichiudibile } from '@/components/orders/SezioneRichiudibile';

interface Props {
  orderId: string;
  aperta?: boolean;
}

/** Ritenute del cliente e dei subappaltatori, collegate al registro esistente. */
export function RitenuteTab({ orderId, aperta }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const cliente = useRitenuteClienteCommessa(orderId);
  const { companyId } = cliente;

  const {
    ritenute,
    contratti,
    isLoading,
    isError, refetch,
    noContratti,
    isSvincolando,
    aggiungi,
    isAggiungendo,
    totaleRitenuto,
    totaleSvincolato,
  } = useRitenuteGaranzia(orderId);

  // Lo svincolo passa dal registro fiscale, con data e riferimento (come nella scheda subappaltatore):
  // l'aggiornamento diretto senza motivo veniva sempre rifiutato dal database.
  const qc = useQueryClient();
  const [daSvincolare, setDaSvincolare] = useState<string | null>(null);

  const statoCliente = !cliente.permissions.isAdmin ? "Riservate all’amministrazione"
    : cliente.q.isError ? "Dati non disponibili" : cliente.q.isPending ? "Caricamento…"
      : cliente.trattenute > 0 ? `${formatCurrency(cliente.trattenute)} trattenuti` : "Nessun importo trattenuto";
  const statoSubappalti = isError ? "Dati non disponibili" : isLoading ? "Caricamento…"
    : totaleRitenuto > 0 ? `${formatCurrency(totaleRitenuto)} da svincolare` : "Nessun importo da svincolare";
  const puoGestire = !cliente.permissions.solaLettura;

  return (
    <SezioneRichiudibile titolo="Ritenute di garanzia" icona={<ShieldCheck className="h-4 w-4" />} aperta={aperta}
      riepilogo={<>
        <span><span className="text-muted-foreground">Cliente </span><strong>{statoCliente}</strong></span>
        <span><span className="text-muted-foreground">Subappalti </span><strong>{statoSubappalti}</strong></span>
      </>}>
      <RitenuteClienteCommessa orderId={orderId} dati={cliente} />
      <section aria-label="Ritenute ai subappaltatori" className="mt-3 space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Trattenute ai subappaltatori</h4>
          {puoGestire && !isLoading && !isError && !noContratti && (
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>Aggiungi ritenuta</Button>
          )}
        </div>
        {isError ? (
          <p role="alert" className="text-xs">Ritenute dei subappaltatori non disponibili. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
        ) : isLoading ? <p role="status" className="text-xs text-muted-foreground">Caricamento ritenute…</p>
          : ritenute.length === 0 ? <p className="text-xs text-muted-foreground">{noContratti ? "Nessun contratto di subappalto collegato." : "Nessuna ritenuta ai subappaltatori registrata."}</p>
          : <>
            {totaleSvincolato > 0 && <p className="text-xs text-muted-foreground">Svincolo documentato <strong className="tabular-nums text-foreground">{formatCurrency(totaleSvincolato)}</strong></p>}
            <RitenuteTable ritenute={ritenute} isLoading={false} onSvincola={setDaSvincolare} isSvincolando={isSvincolando} />
          </>}
      </section>

      {daSvincolare && companyId && (
        <FiscalReleaseDialog
          key={daSvincolare}
          companyId={companyId}
          id={daSvincolare}
          onClose={() => setDaSvincolare(null)}
          onReleased={async () => {
            setDaSvincolare(null);
            await qc.invalidateQueries({ queryKey: ['ritenute-garanzia'] });
            await qc.invalidateQueries({ queryKey: ['ritenute-attive-commessa'] });
          }}
        />
      )}

      {/* Modal */}
      <RitenutaFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        contratti={contratti}
        onSubmit={aggiungi}
        isSubmitting={isAggiungendo}
      />
    </SezioneRichiudibile>
  );
}
