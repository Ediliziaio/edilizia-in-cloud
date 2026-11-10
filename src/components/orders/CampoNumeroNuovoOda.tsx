// Il numero del nuovo ordine al fornitore: precompilato col prossimo della
// numerazione (del fornitore, se ne ha una, o dell'azienda), modificabile.
// Lasciato com'è o vuoto, il numero lo assegna il database alla creazione.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnteprimaNumeroOda } from "@/hooks/useNumerazioneOda";

export function CampoNumeroNuovoOda({ supplierId, value, onChange }: {
  supplierId: string | null;
  /** null = non toccato: si vede l'anteprima. */
  value: string | null;
  onChange: (numero: string | null, anteprima: string | null) => void;
}) {
  const anteprima = useAnteprimaNumeroOda(supplierId);
  const suggerito = anteprima.data ?? null;
  return (
    <div className="space-y-2">
      <Label htmlFor="nuovo-oda-numero">Numero</Label>
      <Input
        id="nuovo-oda-numero"
        value={value ?? suggerito ?? ""}
        maxLength={60}
        placeholder={anteprima.isLoading ? "Calcolo del prossimo numero…" : "Lo assegna il sistema"}
        onChange={(e) => onChange(e.target.value, suggerito)}
        aria-describedby="nuovo-oda-numero-aiuto"
      />
      <p id="nuovo-oda-numero-aiuto" className="text-[11px] text-slate-500">
        È il prossimo della numerazione. Puoi cambiarlo; se lo svuoti lo assegna il sistema.
      </p>
    </div>
  );
}
