import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  const trattenuto = attive
    .filter((r) => r.stato !== 'svincolata')
    .reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const daSvincolare = attive
    .filter((r) => r.stato !== 'svincolata' && r.data_svincolo_prevista && r.data_svincolo_prevista <= oggi)
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
    svincola,
    isSvincolando,
    aggiungi,
    isAggiungendo,
    totaleRitenuto,
    totaleSvincolato,
  } = useRitenuteGaranzia(orderId);

  async function handleSvincola(id: string) {
    const oggi = new Date().toISOString().split('T')[0];
    try {
      await svincola({ id, data_svincolo_effettiva: oggi });
    } catch {
      // error toast is handled by the hook
    }
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
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
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
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale Ritenuto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totaleRitenuto)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale Svincolato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totaleSvincolato)}</p>
          </CardContent>
        </Card>
      </div>

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
