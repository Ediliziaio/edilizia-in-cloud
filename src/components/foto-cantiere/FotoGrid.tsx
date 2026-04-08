import { Camera } from 'lucide-react';
import { FotoCantiere } from '@/hooks/useFotoCantiere';
import { Skeleton } from '@/components/ui/skeleton';
import { FotoCard } from './FotoCard';

interface Props {
  foto: FotoCantiere[];
  isLoading: boolean;
  onElimina: (foto: FotoCantiere) => void;
  getSignedUrl: (path: string) => Promise<string | null>;
}

export function FotoGrid({ foto, isLoading, onElimina, getSignedUrl }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video w-full rounded-lg bg-gray-200" />
        ))}
      </div>
    );
  }

  if (foto.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <Camera className="h-12 w-12" />
        <p className="text-sm font-medium">Nessuna foto caricata</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {foto.map((f) => (
        <FotoCard
          key={f.id}
          foto={f}
          onElimina={onElimina}
          getSignedUrl={getSignedUrl}
        />
      ))}
    </div>
  );
}
