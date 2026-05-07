import { useState } from 'react';
import { X, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const rows = [
  { aspetto: 'Valore legale', fes: 'Limitato', fea: 'Pieno (eIDAS)' },
  { aspetto: 'Autenticazione', fes: 'Email link', fea: 'OTP SMS + Email' },
  { aspetto: 'Documenti ammessi', fes: 'Generici', fea: 'Contratti, preventivi' },
  { aspetto: 'Costo', fes: 'Incluso', fea: 'Add-on' },
];

interface FEABannerEsVsFeaProps {
  dismissible?: boolean;
  className?: string;
}

export function FEABannerEsVsFea({ dismissible = true, className }: FEABannerEsVsFeaProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Card className={cn("relative", className)}>
      {dismissible && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
          onClick={() => setDismissed(true)}
          aria-label="Chiudi"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <CardHeader className={cn("pb-3", dismissible && "pr-10")}>
        <CardTitle className="text-base">
          Firma Elettronica Avanzata vs Firma Elettronica Semplice
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 rounded-tl">
                  Aspetto
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200">
                  FES
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 rounded-tr">
                  FEA
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-medium text-gray-700 border border-gray-200">
                    {row.aspetto}
                  </td>
                  <td className="px-3 py-2 text-gray-600 border border-gray-200">{row.fes}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium border border-gray-200">
                    {row.fea}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            Per documenti con valore legale completo, utilizza la FEA con OTP via SMS.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
