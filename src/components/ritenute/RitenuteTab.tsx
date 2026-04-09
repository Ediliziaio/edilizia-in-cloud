import { useState } from 'react';
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

  return (
    <div className="space-y-6">
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
            Nessun contratto di subappalto collegato a questo ordine.
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
