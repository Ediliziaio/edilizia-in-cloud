import { Badge } from '@/components/ui/badge';

type Stato = 'trattenuta' | 'svincolata' | 'persa';

interface Props {
  stato: Stato;
}

export function RitenutaBadge({ stato }: Props) {
  const variants: Record<Stato, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    trattenuta: { label: 'Trattenuta', variant: 'default' },
    svincolata: { label: 'Svincolata', variant: 'secondary' },
    persa: { label: 'Persa', variant: 'destructive' },
  };
  const { label, variant } = variants[stato] ?? { label: stato, variant: 'outline' };
  return <Badge variant={variant}>{label}</Badge>;
}
