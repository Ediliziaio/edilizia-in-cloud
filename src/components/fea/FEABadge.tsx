import { Badge } from '@/components/ui/badge';
import type { FEAStato } from '@/types/fea';

interface FEABadgeProps {
  stato: FEAStato | null | undefined;
}

export function FEABadge({ stato }: FEABadgeProps) {
  if (!stato) return null;

  switch (stato) {
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">In attesa OTP</Badge>;
    case 'otp_verified':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">OTP verificato</Badge>;
    case 'signed':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Firmato ✓</Badge>;
    case 'refused':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Rifiutato</Badge>;
    case 'expired':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Scaduto</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Annullato</Badge>;
    default:
      return null;
  }
}
