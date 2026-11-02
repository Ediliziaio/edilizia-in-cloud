import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { FiscalReleaseDialog } from '@/components/fatturazione/FiscalReleaseDialog';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { useRitenuteGaranzia } from '@/hooks/useRitenuteGaranzia';
import { RitenuteTable } from './RitenuteTable';
import { RitenutaFormModal } from './RitenutaFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  orderId: string;
}

/**
 * Le ritenute ATTIVE della commessa: soldi che il committente trattiene a TE.
 * Vivono nel registro globale (/azienda/ritenute-garanzia, dove si aggiungono
 * e si svincolano); qui una riga sola li rende visibili dentro la commessa —
 * sono soldi di QUESTA commessa. Null se non ce ne sono: zero rumore.
 */
function RitenuteAttiveLine({ orderId }: { orderId: string }) {
  const { data: attive = [] } = useQuery({
    queryKey: ['ritenute-attive-commessa', orderId],
    staleTime: 60_000,
    queryFn: async () => {
      // order_id/direzione aggiunte da migration recente: tipi generati indietro
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ritenute_garanzia')
        .select('importo, stato, data_svincolo_prevista')
        .eq('order_id', orderId)
        .eq('direzione', 'attiva');
      if (error) throw error;
      return (data ?? []) as { importo: number | null; stato: string; data_svincolo_prevista: string | null }[];
    },
  });

  if (attive.length === 0) return null;

  const oggi = new Date().toISOString().slice(0, 10);
  // Annullate e perse non sono soldi trattenuti.
  const chiuse = ['svincolata', 'annullata', 'persa'];
  const trattenuto = attive
    .filter((r) => !chiuse.includes(r.stato))
    .reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const daSvincolare = attive
    .filter((r) => !chiuse.includes(r.stato) && r.data_svincolo_prevista && r.data_svincolo_prevista <= oggi)
    .reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const svincolato = attive
    .filter((r) => r.stato === 'svincolata')
    .reduce((s, r) => s + (Number(r.importo) || 0), 0);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-emerald-900">
          {trattenuto > 0 ? (
            <>
              <span className="font-medium">Trattenuto a te dal committente:</span>{' '}
              <strong>{formatCurrency(trattenuto)}</strong>
              {daSvincolare > 0 && (
                <>
                  {' '}· da svincolare ora <strong className="text-orange-600">{formatCurrency(daSvincolare)}</strong>
                </>
              )}
              {svincolato > 0 && <> · già tornato in cassa {formatCurrency(svincolato)}</>}
            </>
          ) : (
            <>
              <span className="font-medium">Ritenute del committente:</span> tutte svincolate,{' '}
              <strong>{formatCurrency(svincolato)}</strong> tornati in cassa.
            </>
          )}
        </p>
        <Link to="/azienda/ritenute-garanzia" className="text-xs font-medium text-primary hover:underline">
          Registro ritenute →
        </Link>
      </div>
    </div>
  );
}

export function RitenuteTab({ orderId }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const {
    ritenute,
    contratti,
    isLoading,
    noContratti,
    isSvincolando,
    aggiungi,
    isAggiungendo,
    totaleRitenuto,
    totaleSvincolato,
  } = useRitenuteGaranzia(orderId);

  // Lo svincolo passa dal registro fiscale, con data e riferimento (come nella scheda subappaltatore):
  // l'aggiornamento diretto senza motivo veniva sempre rifiutato dal database.
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [daSvincolare, setDaSvincolare] = useState<string | null>(null);
  function handleSvincola(id: string) {
    setDaSvincolare(id);
  }

  async function handleAggiungi(data: Parameters<typeof aggiungi>[0]) {
    try {
      await aggiungi(data);
    } catch {
      // error toast is handled by the hook
    }
  }

  // Senza subappalti e senza ritenute la sezione occupava mezza schermata di
  // blocchi vuoti (due card a 0 €, un avviso, un bottone disabilitato, una
  // tabella vuota): una riga sola dice la stessa cosa senza rumore.
  const sezioneVuota = !isLoading && noContratti && ritenute.length === 0;
  if (sezioneVuota) {
    return (
      <div className="space-y-3">
        <RitenuteAttiveLine orderId={orderId} />
        {/* Mobile: una sezione vuota da spiegare non serve. */}
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground max-sm:hidden">
          Nessun subappalto su questa commessa: le ritenute di garanzia compariranno
          qui quando colleghi un contratto di subappalto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lato attivo (committente → te): una riga, gestione nel registro */}
      <RitenuteAttiveLine orderId={orderId} />
      {/* Totali. A zero — il caso normale finche' non ci sono subappalti — due
          card grandi occupavano 266px per mostrare "0,00 €" due volte: qui
          diventano una riga sola. Coi numeri veri restano due card leggibili. */}
      {totaleRitenuto === 0 && totaleSvincolato === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Nessuna ritenuta di garanzia su questa commessa</span>
          <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
            Ritenuto {formatCurrency(0)} · Svincolato {formatCurrency(0)}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Totale Ritenuto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totaleRitenuto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Totale Svincolato</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totaleSvincolato)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No contratti warning */}
      {noContratti && (
        <Alert>
          <AlertDescription>
            Nessun contratto di subappalto collegato a questa commessa.
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)} disabled={noContratti}>
          + Aggiungi Ritenuta
        </Button>
      </div>

      {/* Table */}
      <RitenuteTable
        ritenute={ritenute}
        isLoading={isLoading}
        onSvincola={handleSvincola}
        isSvincolando={isSvincolando}
      />

      {daSvincolare && companyId && (
        <FiscalReleaseDialog
          key={daSvincolare}
          companyId={companyId}
          id={daSvincolare}
          onClose={() => setDaSvincolare(null)}
          onReleased={async () => {
            setDaSvincolare(null);
            await qc.invalidateQueries({ queryKey: ['ritenute-garanzia'] });
          }}
        />
      )}

      {/* Modal */}
      <RitenutaFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        contratti={contratti}
        onSubmit={handleAggiungi}
        isSubmitting={isAggiungendo}
      />
    </div>
  );
}
