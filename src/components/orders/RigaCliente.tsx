/**
 * Un cliente in una tendina di scelta: nome, tipo, referente e, sotto, telefono, email,
 * indirizzo e partita IVA. «Condominio DEMO 2023 10» e «… 14» si distinguono dall'indirizzo.
 */
import { Building2, Landmark, Mail, MapPin, Phone, User, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  emailDaMostrare, indirizzoCliente, nomeCliente, referenteCliente, tipoCliente, type ClienteDaCercare,
} from "@/lib/orders/nuovaCommessaProposte";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const STILE_TIPO = {
  Privato: { icona: User, classe: "bg-slate-100 text-slate-700" },
  Azienda: { icona: Building2, classe: "bg-blue-50 text-blue-700" },
  PA: { icona: Landmark, classe: "bg-amber-50 text-amber-800" },
} as const;

export function RigaCliente({ cliente, className }: { cliente: ClienteDaCercare; className?: string }) {
  const t = useT();
  const tipo = tipoCliente(cliente);
  const referente = referenteCliente(cliente);
  const email = emailDaMostrare(cliente.email);
  const indirizzo = indirizzoCliente(cliente);
  const piva = cliente.vat_number?.trim() || null;
  const dettagli: Array<{ icona: typeof Phone; testo: string; titolo: string }> = [];
  if (cliente.phone?.trim()) dettagli.push({ icona: Phone, testo: cliente.phone.trim(), titolo: t("Telefono") });
  if (email) dettagli.push({ icona: Mail, testo: email, titolo: t("Email") });
  if (indirizzo) dettagli.push({ icona: MapPin, testo: indirizzo, titolo: t("Indirizzo") });
  if (piva) dettagli.push({ icona: Hash, testo: `P.IVA ${piva}`, titolo: t("Partita IVA") });
  const Tipo = tipo ? STILE_TIPO[tipo] : null;

  return (
    <span className={cn("block min-w-0 flex-1", className)}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{nomeCliente(cliente)}</span>
        {Tipo && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", Tipo.classe)}>
            <Tipo.icona className="h-3 w-3" /> {t(tipo)}
          </span>
        )}
        {referente && <span className="truncate text-xs text-muted-foreground">· {referente}</span>}
      </span>
      {dettagli.length > 0 ? (
        <span className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {dettagli.map((d) => (
            <span key={d.titolo} className="inline-flex min-w-0 max-w-full items-center gap-1" title={d.titolo}>
              <d.icona className="h-3 w-3 shrink-0" />
              <span className="truncate">{d.testo}</span>
            </span>
          ))}
        </span>
      ) : (
        <span aria-hidden className="mt-0.5 block text-xs italic text-muted-foreground/70">{t("Nessun recapito in anagrafica")}</span>
      )}
    </span>
  );
}
