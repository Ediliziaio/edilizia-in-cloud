/**
 * Privato, azienda o Pubblica Amministrazione nel passo Cliente dei
 * preventivatori (30/10/2026). La scelta sta in cima, sopra nome e cognome
 * (`SceltaTipoCliente`); sotto, i dati fiscali che servono a quel tipo
 * (`DatiFiscaliCliente`): il privato ha il codice fiscale, l'azienda ragione
 * sociale, partita IVA e codice fiscale se diverso, l'ente pubblico il nome
 * dell'ente, il codice fiscale a 11 cifre e il codice univoco ufficio.
 * Arrivano dal contatto del CRM quando lo si sceglie, e si possono scrivere o
 * correggere qui in ogni momento. Gli avvisi non bloccano il salvataggio.
 */
import { useId } from "react";
import { Building2, FileBadge, Landmark, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { avvisiDatiFiscali, TIPI_CLIENTE, tipoCliente, type TipoCliente } from "@/lib/preventivatore/datiFiscaliCliente";

export type CampoFiscaleCliente = "cliente_tipo" | "cliente_ragione_sociale" | "cliente_codice_fiscale" | "cliente_partita_iva" | "cliente_codice_univoco";

const ICONE: Record<TipoCliente, typeof User> = { privato: User, azienda: Building2, pa: Landmark };

/** La scelta in cima al passo Cliente: Privato · Azienda · Pubblica Amministrazione. */
export function SceltaTipoCliente({ valore, onChange, className }: { valore: string | null | undefined; onChange: (tipo: TipoCliente) => void; className?: string }) {
  const tipo = tipoCliente(valore);
  return (
    <div role="radiogroup" aria-label="Tipo di cliente" className={cn("inline-flex max-w-full flex-wrap rounded-lg border bg-slate-50 p-0.5", className)}>
      {TIPI_CLIENTE.map(({ valore: t, etichetta }) => {
        const Icona = ICONE[t];
        return (
          <button key={t} type="button" role="radio" aria-checked={tipo === t}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tipo === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            onClick={() => onChange(t)}>
            <Icona className="h-3.5 w-3.5" />{etichetta}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  form: Partial<Record<CampoFiscaleCliente, string | null>>;
  onChange: (campo: CampoFiscaleCliente, valore: string | null) => void;
  className?: string;
}

/** I dati fiscali del tipo scelto in `SceltaTipoCliente`. */
export function DatiFiscaliCliente({ form, onChange, className }: Props) {
  const id = useId();
  const tipo = tipoCliente(form.cliente_tipo);
  const avvisi = avvisiDatiFiscali({ tipo, codiceFiscale: form.cliente_codice_fiscale, partitaIva: form.cliente_partita_iva, codiceSdi: form.cliente_codice_univoco });
  const etichetta = "flex h-4 items-center gap-1 text-xs";
  const campo = (chiave: CampoFiscaleCliente, nome: string, Icona: typeof User, attributi: { placeholder: string; maxLength: number; mono?: boolean; numeri?: boolean; maiuscolo?: boolean }, avviso?: string) => (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`${id}-${chiave}`} className={etichetta}><Icona className="h-3 w-3 text-slate-500" />{nome}</Label>
      <Input id={`${id}-${chiave}`} className={cn("h-9", attributi.mono && "font-mono", attributi.maiuscolo && "[&:not(:placeholder-shown)]:uppercase")}
        maxLength={attributi.maxLength} placeholder={attributi.placeholder} inputMode={attributi.numeri ? "numeric" : undefined}
        value={form[chiave] ?? ""} onChange={e => onChange(chiave, e.target.value || null)} />
      {avviso && <p role="status" className="text-[11px] text-amber-700">{avviso}</p>}
    </div>
  );
  return (
    <div className={cn("grid items-start gap-3 max-sm:gap-2", tipo === "privato" ? "sm:grid-cols-2" : tipo === "pa" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3", className)}>
      {tipo === "azienda" && campo("cliente_ragione_sociale", "Ragione sociale", Building2, { placeholder: "Rossi Costruzioni S.r.l.", maxLength: 200 })}
      {tipo === "pa" && campo("cliente_ragione_sociale", "Ente", Landmark, { placeholder: "Comune di …", maxLength: 200 })}
      {tipo === "azienda" && campo("cliente_partita_iva", "Partita IVA", FileBadge, { placeholder: "11 cifre", maxLength: 20, mono: true, numeri: true }, avvisi.partitaIva)}
      {campo("cliente_codice_fiscale", tipo === "azienda" ? "Codice fiscale (se diverso)" : "Codice fiscale", FileBadge,
        { placeholder: tipo === "azienda" ? "Di solito uguale alla partita IVA" : tipo === "pa" ? "11 cifre dell'ente" : "16 caratteri", maxLength: 20, mono: true, maiuscolo: true }, avvisi.codiceFiscale)}
      {tipo === "pa" && campo("cliente_partita_iva", "Partita IVA (se c'è)", FileBadge, { placeholder: "11 cifre", maxLength: 20, mono: true, numeri: true }, avvisi.partitaIva)}
      {tipo === "pa" && campo("cliente_codice_univoco", "Codice univoco ufficio", FileBadge, { placeholder: "6 caratteri (IPA)", maxLength: 10, mono: true, maiuscolo: true }, avvisi.codiceSdi)}
    </div>
  );
}
