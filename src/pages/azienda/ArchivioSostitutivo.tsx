import { useState } from 'react';
import { formatDate } from '@/lib/formatters';
import { useArchivioSostitutivo } from '@/hooks/useArchivioSostitutivo';
import { ArchivioUploader } from '@/components/archivio/ArchivioUploader';
import { ArchivioTable } from '@/components/archivio/ArchivioTable';
import { FiscalitaNavigation } from '@/components/fatturazione/FiscalitaNavigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Archive, AlertTriangle, Scale } from 'lucide-react';

// formatDate imported for project convention consistency
void formatDate;

export default function ArchivioSostitutivo() {
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(currentYear);

  const {
    documenti,
    isLoading,
    upload,
    isUploading,
    inScadenzaProssimi365gg,
    getSignedUrl,
  } = useArchivioSostitutivo(anno);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <FiscalitaNavigation />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Archivio documenti fiscali</h1>
        {/* Questa pagina archivia file caricati a mano e ne calcola l'impronta
            SHA-256. Non è la conservazione sostitutiva a norma: non c'è un
            conservatore accreditato, né marca temporale, né pacchetto di
            archiviazione, né una riverifica delle impronte. Finché non ci sono,
            la pagina non lo dichiara. */}
        <p className="text-muted-foreground mt-1">
          Archivio dei documenti fiscali, da tenere per 10 anni. Non sostituisce la conservazione a norma.
        </p>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setAnno((y) => y - 1)}
          aria-label="Anno precedente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="w-14 text-center font-semibold text-lg">{anno}</span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setAnno((y) => y + 1)}
          aria-label="Anno successivo"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Documenti archiviati */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documenti archiviati
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">{documenti.length}</p>
            )}
          </CardContent>
        </Card>

        {/* In scadenza prossimi 12 mesi */}
        <Card className={inScadenzaProssimi365gg.length > 0 ? 'border-orange-300' : ''}>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 ${
                inScadenzaProssimi365gg.length > 0
                  ? 'text-orange-500'
                  : 'text-muted-foreground'
              }`}
            />
            <CardTitle
              className={`text-sm font-medium ${
                inScadenzaProssimi365gg.length > 0
                  ? 'text-orange-600'
                  : 'text-muted-foreground'
              }`}
            >
              In scadenza nei prossimi 12 mesi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p
                className={`text-2xl font-bold ${
                  inScadenzaProssimi365gg.length > 0 ? 'text-orange-600' : ''
                }`}
              >
                {inScadenzaProssimi365gg.length}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Conservazione legale */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Da tenere per
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">10 anni</p>
            <p className="text-xs text-muted-foreground mt-0.5">termine di legge</p>
          </CardContent>
        </Card>
      </div>

      <ArchivioUploader onUpload={upload} isUploading={isUploading} />

      <ArchivioTable
        documenti={documenti}
        isLoading={isLoading}
        inScadenzaProssimi365gg={inScadenzaProssimi365gg}
        getSignedUrl={getSignedUrl}
      />
    </div>
  );
}
