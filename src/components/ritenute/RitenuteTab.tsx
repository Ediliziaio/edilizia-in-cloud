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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  orderId: string;
  aperta?: boolean;
}

/** Ritenute del cliente e dei subappaltatori, collegate al registro esistente. */
export function RitenuteTab({ orderId, aperta }: Props) {
  const t = useT();
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

  const statoCliente = !cliente.permissions.isAdmin ? t("Riservate all’amministrazione")
    : cliente.q.isError ? t("Dati non disponibili") : cliente.q.isPending ? t("Caricamento…")
      : cliente.trattenute > 0 ? t("{importo} trattenuti", { importo: formatCurrency(cliente.trattenute) }) : t("Nessun importo trattenuto");
  const statoSubappalti = isError ? t("Dati non disponibili") : isLoading ? t("Caricamento…")
    : totaleRitenuto > 0 ? t("{importo} da svincolare", { importo: formatCurrency(totaleRitenuto) }) : t("Nessun importo da svincolare");
  const puoGestire = !cliente.permissions.solaLettura;

  return (
    <SezioneRichiudibile titolo={t("Ritenute di garanzia")} icona={<ShieldCheck className="h-4 w-4" />} aperta={aperta}
      riepilogo={<>
        <span><span className="text-muted-foreground">{t("Cliente")} </span><strong>{statoCliente}</strong></span>
        <span><span className="text-muted-foreground">{t("Subappalti")} </span><strong>{statoSubappalti}</strong></span>
      </>}>
      <RitenuteClienteCommessa orderId={orderId} dati={cliente} />
      <section aria-label={t("Ritenute ai subappaltatori")} className="mt-3 space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t("Trattenute ai subappaltatori")}</h4>
          {puoGestire && !isLoading && !isError && !noContratti && (
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>{t("Aggiungi ritenuta")}</Button>
          )}
        </div>
        {isError ? (
          <p role="alert" className="text-xs">{t("Ritenute dei subappaltatori non disponibili.")} <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button></p>
        ) : isLoading ? <p role="status" className="text-xs text-muted-foreground">{t("Caricamento ritenute…")}</p>
          : ritenute.length === 0 ? <p className="text-xs text-muted-foreground">{noContratti ? t("Nessun contratto di subappalto collegato.") : t("Nessuna ritenuta ai subappaltatori registrata.")}</p>
          : <>
            {totaleSvincolato > 0 && <p className="text-xs text-muted-foreground">{t("Svincolo documentato")} <strong className="tabular-nums text-foreground">{formatCurrency(totaleSvincolato)}</strong></p>}
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
