/**
 * Input per il Sender ID con validazione alfanumerica max 11 caratteri.
 *
 * @param value - Valore corrente
 * @param onChange - Callback al cambio
 * @param error - Messaggio di errore
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SmsMittenteInputProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

const ALFANUMERICO = /^[A-Za-z0-9]*$/;

export function SmsMittenteInput({ value, onChange, error }: SmsMittenteInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (ALFANUMERICO.test(v) && v.length <= 11) onChange(v);
  };

  const charCount = value.length;
  const isValid = charCount >= 1 && charCount <= 11;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="mittente" className="text-sm font-medium">
        Mittente (Sender ID)
      </Label>
      <div className="relative">
        <Input
          id="mittente"
          value={value}
          onChange={handleChange}
          placeholder="Es: Edilizia"
          maxLength={11}
          className={error ? "border-destructive" : ""}
        />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${
          isValid ? "text-muted-foreground" : "text-destructive"
        }`}>
          {charCount}/11
        </span>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Solo lettere e numeri, massimo 11 caratteri. Verrà mostrato come mittente dell'SMS.
        </p>
      )}
    </div>
  );
}
