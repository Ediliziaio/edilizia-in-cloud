import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useFotoCantiere } from '@/hooks/useFotoCantiere';
import { FotoUploader } from '@/components/foto-cantiere/FotoUploader';
import { FotoGrid } from '@/components/foto-cantiere/FotoGrid';

// formatCurrency and formatDate imported for consistency with project conventions
void formatCurrency;
void formatDate;
void toast;

export default function FotoCantiere() {
  const { effectiveCompany } = useAuth();
  void effectiveCompany;

  // No orderId = company-wide view of all photos
  const { foto, isLoading, upload, isUploading, elimina, getSignedUrl } = useFotoCantiere();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Foto Cantiere</h1>
        <p className="text-muted-foreground mt-1">
          Documentazione fotografica georeferenziata dei cantieri
        </p>
      </div>

      <FotoUploader onUpload={upload} isUploading={isUploading} />

      <FotoGrid
        foto={foto}
        isLoading={isLoading}
        onElimina={elimina}
        getSignedUrl={getSignedUrl}
      />
    </div>
  );
}
