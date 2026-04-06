import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, User, Calendar, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { FEABadge } from './FEABadge';
import type { FEASignatureRequest } from '@/types/fea';

interface FEAStatoCardProps {
  richiesta: FEASignatureRequest | null;
  onAnnulla?: () => void;
  isAnnullando?: boolean;
}

function maskIp(ip: string | null): string {
  if (!ip) return '—';
  return ip.slice(0, 8) + '...';
}

export function FEAStatoCard({ richiesta, onAnnulla, isAnnullando }: FEAStatoCardProps) {
  if (!richiesta) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Stato firma</span>
          <FEABadge stato={richiesta.status} />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Mail className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{richiesta.signer_email}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <User className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{richiesta.signer_name}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              Richiesta il{' '}
              {format(new Date(richiesta.created_at), 'dd/MM/yyyy HH:mm', { locale: it })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              Scade il{' '}
              {format(new Date(richiesta.expires_at), 'dd MMMM yyyy', { locale: it })}
            </span>
          </div>

          {richiesta.status === 'signed' && richiesta.signed_at && (
            <>
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>
                  Firmato il{' '}
                  {format(new Date(richiesta.signed_at), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}
                </span>
              </div>
              {richiesta.firma_ip && (
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>IP: {maskIp(richiesta.firma_ip)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {richiesta.status === 'pending' && onAnnulla && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 border-red-200 hover:bg-red-50"
            onClick={onAnnulla}
            disabled={isAnnullando}
          >
            {isAnnullando ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-2" />Annullamento...</>
            ) : (
              'Annulla richiesta'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
