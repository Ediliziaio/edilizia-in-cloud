import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings2 } from 'lucide-react';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';

export default function AdminDunningConfig() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.billing_write) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Dunning Config</h1>
        <Badge variant="secondary">In arrivo</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Configurazione Regole Recupero Pagamenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Questa sezione permetterà di configurare le regole automatiche di dunning
            (recupero pagamenti falliti): sequenza email, ritardi, pausa abbonamento.
            Integrazione diretta con Stripe via webhook.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Disponibile nella prossima release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
