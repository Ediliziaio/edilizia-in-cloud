import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FornitoreEditor } from "@/components/suppliers/FornitoreEditor";
import {
  payloadFornitore,
  type Supplier,
  type SupplierFormData,
} from "@/lib/suppliers/anagraficaFornitore";
import { fornitoreDaBolla } from "@/lib/ddt/fornitoreDaBolla";
import { abbinaFornitore, normalizzaPiva } from "@/lib/ddt/abbinaFornitore";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { supabase } from "@/integrations/supabase/client";
import type { BollaLetta } from "@/lib/ddt/importBolle";

export function NuovoFornitoreDaBolla({
  bolla,
  companyId,
  fornitori,
  onChiudi,
  onCreato,
}: {
  bolla: BollaLetta;
  companyId: string;
  fornitori: Supplier[];
  onChiudi: () => void;
  onCreato: (fornitore: Supplier) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const client = useQueryClient();
  const salva = async (dati: SupplierFormData) => {
    setSalvando(true);
    try {
      // Rileggi la rubrica prima della scrittura: un altro terminale può averlo già creato.
      const esistenti = await loadCatalogPages<Supplier>((from, to) =>
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId)
          .order("id")
          .range(from, to),
      );
      const trovato = abbinaFornitore(
        {
          fornitoreNome: dati.name,
          fornitorePiva: dati.vat_number,
          fornitoreCodiceFiscale: dati.fiscal_code,
        },
        esistenti ?? [],
      );
      if (trovato) {
        const esistente = (esistenti ?? []).find((f) => f.id === trovato.id)!;
        if (
          dati.vat_number &&
          esistente.vat_number &&
          normalizzaPiva(dati.vat_number) !==
            normalizzaPiva(esistente.vat_number)
        ) {
          toast.error(
            "Esiste un fornitore con lo stesso nome ma partita IVA diversa. Verifica l’anagrafica prima di collegarlo.",
          );
          return;
        }
        onCreato(
          (esistenti ?? []).find((f) => f.id === trovato.id) as Supplier,
        );
        toast.info(
          "Fornitore già presente: collegato senza creare un duplicato.",
        );
        return;
      }
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ ...payloadFornitore(dati), company_id: companyId })
        .select("*")
        .single();
      if (error) throw error;
      await invalidaFornitori(client);
      onCreato(data as Supplier);
      toast.success("Fornitore creato e collegato alle bolle riconosciute.");
    } catch {
      toast.error(
        "Fornitore non creato. Controlla i dati e i permessi; le bolle restano disponibili.",
      );
    } finally {
      setSalvando(false);
    }
  };
  return (
    <FornitoreEditor
      aperta
      fornitore={null}
      esteroIniziale={false}
      datiIniziali={fornitoreDaBolla(bolla.grezzo, bolla.fornitoreLetto)}
      fornitori={fornitori}
      categorieEsistenti={[]}
      salvataggio={salvando}
      onChiudi={() => {
        if (!salvando) onChiudi();
      }}
      onSalva={(dati) => void salva(dati)}
    />
  );
}
