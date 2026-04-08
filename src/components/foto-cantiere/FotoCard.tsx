import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/formatters';
import { FotoCantiere } from '@/hooks/useFotoCantiere';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  foto: FotoCantiere;
  onElimina: (foto: FotoCantiere) => void;
  getSignedUrl: (path: string) => Promise<string | null>;
}

export function FotoCard({ foto, onElimina, getSignedUrl }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSignedUrl(foto.storage_path).then((signed) => {
      if (!cancelled) {
        setUrl(signed);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [foto.storage_path, getSignedUrl]);

  const hasGps = foto.latitudine != null && foto.longitudine != null;

  const handleElimina = () => {
    if (window.confirm('Eliminare questa foto? L\'operazione non è reversibile.')) {
      onElimina(foto);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-gray-100">
        {loading ? (
          <div className="absolute inset-0 bg-gray-200 animate-pulse" />
        ) : url ? (
          <img
            src={url}
            alt={foto.descrizione ?? 'Foto cantiere'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Immagine non disponibile
          </div>
        )}
        <span
          className={`absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full ${
            hasGps
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {hasGps ? '📍 GPS' : 'No GPS'}
        </span>
      </div>

      <CardContent className="p-3 space-y-2">
        {foto.descrizione && (
          <p className="text-sm text-gray-700 line-clamp-2">{foto.descrizione}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{formatDateTime(foto.taken_at)}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
            onClick={handleElimina}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
