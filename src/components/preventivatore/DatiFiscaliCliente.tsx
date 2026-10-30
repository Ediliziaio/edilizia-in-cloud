/**
 * Privato o azienda nel passo Cliente dei preventivatori (30/10/2026): il
 * privato ha il codice fiscale, l'azienda ragione sociale, partita IVA e codice
 * fiscale se diverso. Arrivano dal contatto del CRM quando lo si sceglie, e si
 * possono scrivere o correggere qui in ogni momento. Gli avvisi dicono se un
 * codice non torna, senza bloccare il salvataggio.
 */
import { useId } from "react";
import { Building2, FileBadge, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { avvisiDatiFiscali, type TipoCliente } from "@/lib/preventivatore/datiFiscaliCliente";

export type CampoFiscaleCliente = "cliente_tipo" | "cliente_ragione_sociale" | "cliente_codice_fiscale" | "cliente_partita_iva";

interface Props {
  form: Partial<Record<CampoFiscaleCliente, string | null>>;
  onChange: (campo: CampoFiscaleCliente, valore: string | null) => void;
  className?: string;
}

export function DatiFiscaliCliente({ form, onChange, className }: Props) {
  const id = useId();
  const tipo: TipoCliente = form.cliente_tipo === "azienda" ? "azienda" : "privato";
  const avvisi = avvisiDatiFiscali({ tipo, codiceFiscale: form.cliente_codice_fiscale, partitaIva: form.cliente_partita_iva });
  const etichetta = "flex h-4 items-center gap-1 text-xs";
  return (
    <div className={cn("space-y-3", className)}>
      <div role="radiogroup" aria-label="Tipo di cliente" className="inline-flex rounded-lg border bg-slate-50 p-0.5">
        {(["privato", "azienda"] as const).map(t => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tipo === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            onClick={() => onChange("cliente_tipo", t)}>
            {t === "privato" ? <><User className="h-3.5 w-3.5" />Privato</> : <><Building2 className="h-3.5 w-3.5" />Azienda</>}
          </button>
        ))}
      </div>
      <div className={cn("grid items-start gap-3 max-sm:gap-2", tipo === "azienda" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {tipo === "azienda" && (
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-rs`} className={etichetta}><Building2 className="h-3 w-3 text-slate-500" />Ragione sociale</Label>
            <Input id={`${id}-rs`} className="h-9" maxLength={200} placeholder="Rossi Costruzioni S.r.l."
              value={form.cliente_ragione_sociale ?? ""} onChange={e => onChange("cliente_ragione_sociale", e.target.value || null)} />
          </div>
        )}
        {tipo === "azienda" && (
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-piva`} className={etichetta}><FileBadge className="h-3 w-3 text-slate-500" />Partita IVA</Label>
            <Input id={`${id}-piva`} className="h-9 font-mono" inputMode="numeric" maxLength={20} placeholder="11 cifre"
              value={form.cliente_partita_iva ?? ""} onChange={e => onChange("cliente_partita_iva", e.target.value || null)} />
            {avvisi.partitaIva && <p role="status" className="text-[11px] text-amber-700">{avvisi.partitaIva}</p>}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-cf`} className={etichetta}><FileBadge className="h-3 w-3 text-slate-500" />{tipo === "azienda" ? "Codice fiscale (se diverso)" : "Codice fiscale"}</Label>
          <Input id={`${id}-cf`} className="h-9 font-mono [&:not(:placeholder-shown)]:uppercase" maxLength={20}
            placeholder={tipo === "azienda" ? "Di solito uguale alla partita IVA" : "16 caratteri"}
            value={form.cliente_codice_fiscale ?? ""} onChange={e => onChange("cliente_codice_fiscale", e.target.value || null)} />
          {avvisi.codiceFiscale && <p role="status" className="text-[11px] text-amber-700">{avvisi.codiceFiscale}</p>}
        </div>
      </div>
    </div>
  );
}
