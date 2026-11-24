import { Badge } from '@/components/ui/badge';
import type { FEAStato } from '@/types/fea';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface FEABadgeProps {
  stato: FEAStato | null | undefined;
}

export function FEABadge({ stato }: FEABadgeProps) {
  const t = useT();
  if (!stato) return null;

  switch (stato) {
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("In attesa di firma")}</Badge>;
    case 'otp_verified':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{t("Codice confermato")}</Badge>;
    case 'signed':
      return <Badge className="bg-green-100 text-green-800 border-green-200">{t("Firmato ✓")}</Badge>;
    case 'refused':
      return <Badge className="bg-red-100 text-red-800 border-red-200">{t("Rifiutato")}</Badge>;
    case 'expired':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">{t("Scaduto")}</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">{t("Annullato")}</Badge>;
    default:
      return null;
  }
}
