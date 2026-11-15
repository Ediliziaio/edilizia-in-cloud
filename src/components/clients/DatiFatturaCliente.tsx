// «Dati per la fattura» nella scheda cliente (lotto 1-2, 15/11/2026): il tipo
// (Privato / Azienda / PA) e i codici dall'anagrafica fiscale collegata, con la modifica
// e, per la PA, gli uffici. Senza anagrafica propone di completarla.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { useAnagraficaFiscaleCliente } from "@/hooks/useAnagraficaFiscaleCliente";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatiFiscaliClienteDialog } from "@/components/clients/DatiFiscaliClienteDialog";
import { UfficiPaCard } from "@/components/clients/UfficiPaCard";
import { useUfficiPa } from "@/hooks/useUfficiPa";
import { etichettaTipoCliente, formDaAnagrafica, formDaProfilo, type ClienteBase } from "@/lib/clienti/clienteFiscale";

export function DatiFatturaCliente({ customer, puoModificare }: { customer: ClienteBase; puoModificare: boolean }) {
  const [aperto, setAperto] = useState(false);
  const { data: ana, isLoading } = useAnagraficaFiscaleCliente(customer.id);
  const pa = ana?.tipo_cliente === "PA";
  const { tutti: uffici } = useUfficiPa(pa ? ana?.id : null);

  if (isLoading) return null;
  const iniziale = ana ? formDaAnagrafica(ana as unknown as Record<string, unknown>) : formDaProfilo(customer);
  // Profilo e anagrafica che dicono cose diverse: lo si fa vedere, non si sceglie da soli.
  const disallineato = ana && (ana.tipo_cliente === "B2C") === !!customer.is_business;

  const riga = (l: string, v: string | null | undefined, mono = false) =>
    v ? (
      <div className="flex justify-between gap-2 text-[11px] py-0.5">
        <span className="text-muted-foreground">{l}</span>
        <span className={`text-right break-all ${mono ? "font-mono" : ""}`}>{v}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-1.5 px-1">
      <div className="flex items-center gap-2">
        {ana ? <Badge variant="secondary">{etichettaTipoCliente(ana.tipo_cliente)}</Badge> : <Badge variant="outline">Da completare</Badge>}
        {puoModificare && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] ml-auto" onClick={() => setAperto(true)}>
            <Pencil className="h-3 w-3 mr-1" /> {ana ? "Modifica" : "Completa"}
          </Button>
        )}
      </div>
      {!ana && <p className="text-[11px] text-muted-foreground">Mancano i dati per fatturare a questo cliente.</p>}
      {disallineato && (
        <p className="text-[11px] text-amber-700">
          La scheda dice «{customer.is_business ? "azienda" : "persona"}», i dati per la fattura «{etichettaTipoCliente(ana?.tipo_cliente)}»: controlla con «Modifica».
        </p>
      )}
      {ana && (
        <div>
          {riga("P.IVA", ana.partita_iva, true)}
          {riga("Codice fiscale", ana.codice_fiscale, true)}
          {riga(pa ? "Ufficio predefinito" : "Codice destinatario", ana.codice_sdi, true)}
          {riga("PEC", ana.pec)}
          {pa && riga("Codice IPA", ana.codice_ipa, true)}
          {pa && riga("Split payment", ana.split_payment == null ? "come l'azienda" : ana.split_payment ? "sì" : "no")}
          {riga("Referente amm.", ana.referente_amministrativo)}
          <Link to={`/azienda/documenti/anagrafiche/${ana.id}`} className="text-[11px] text-primary hover:underline">
            Apri la scheda fiscale
          </Link>
        </div>
      )}
      {pa && ana && <UfficiPaCard anagraficaId={ana.id} puoModificare={puoModificare} compatta />}
      <DatiFiscaliClienteDialog
        open={aperto}
        onOpenChange={setAperto}
        iniziale={iniziale}
        clienteId={customer.id}
        anagraficaId={ana?.id}
        chiediUfficio={!pa || uffici.length === 0}
      />
    </div>
  );
}
