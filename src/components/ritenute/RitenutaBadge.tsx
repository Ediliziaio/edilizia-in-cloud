import { Badge } from '@/components/ui/badge';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Stato = 'trattenuta' | 'svincolata' | 'persa';

interface Props {
  stato: Stato;
}

export function RitenutaBadge({ stato }: Props) {
  const t = useT();
  const variants: Record<Stato, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    trattenuta: { label: t("Trattenuta"), variant: 'default' },
    svincolata: { label: t("Svincolata"), variant: 'secondary' },
    persa: { label: t("Persa"), variant: 'destructive' },
  };
  const { label, variant } = variants[stato] ?? { label: stato, variant: 'outline' };
  return <Badge variant={variant}>{label}</Badge>;
}
