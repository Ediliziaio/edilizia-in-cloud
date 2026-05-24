import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useF24 } from '@/hooks/useF24';
import { useLiquidazioneIVA } from '@/hooks/useLiquidazioneIVA';
import { F24Generator } from '@/components/contabilita/F24Generator';
import { FiscalitaNavigation } from '@/components/fatturazione/FiscalitaNavigation';
import { LiquidazioneIVA } from '@/components/contabilita/LiquidazioneIVA';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

export default function ContabilitaFiscale() {
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(currentYear);

  const { effectiveCompany } = useAuth();
  void effectiveCompany;

  const {
    entries,
    isLoading: isLoadingF24,
    salva,
    isSalvando,
    marcaPagato,
    totaleAPagare,
    scadentiProssimi30gg,
  } = useF24(anno);

  const { calcola, isCalcolando, risultato, reset } = useLiquidazioneIVA();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <FiscalitaNavigation />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Contabilità Fiscale</h1>

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
      </div>

      <Tabs defaultValue="f24">
        <TabsList>
          <TabsTrigger value="f24">F24</TabsTrigger>
          <TabsTrigger value="liquidazione-iva">Liquidazione IVA</TabsTrigger>
          <TabsTrigger value="prima-nota">Prima Nota</TabsTrigger>
        </TabsList>

        <TabsContent value="f24" className="mt-4">
          <F24Generator
            entries={entries}
            isLoading={isLoadingF24}
            onSalva={salva}
            isSalvando={isSalvando}
            onMarcaPagato={marcaPagato}
            totaleAPagare={totaleAPagare}
            scadentiProssimi30gg={scadentiProssimi30gg}
          />
        </TabsContent>

        <TabsContent value="liquidazione-iva" className="mt-4">
          <LiquidazioneIVA
            calcola={calcola}
            isCalcolando={isCalcolando}
            risultato={risultato}
            reset={reset}
          />
        </TabsContent>

        <TabsContent value="prima-nota" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <FileText className="h-12 w-12 text-muted-foreground opacity-60" />
              <p className="text-muted-foreground text-center max-w-xs">
                Accedi alla Prima Nota completa per gestire movimenti contabili, entrate e uscite.
              </p>
              <Button asChild>
                <Link to="/azienda/prima-nota">Vai alla Prima Nota completa</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
