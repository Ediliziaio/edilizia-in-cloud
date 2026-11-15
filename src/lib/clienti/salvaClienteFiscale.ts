// Salvataggio del cliente fiscale (lotto 1, 15/11/2026).
// Con un cliente (profiles) passa da salva_anagrafica_cliente(): l'anagrafica resta
// collegata (cliente_id) e la si crea se manca. Senza cliente (un'anagrafica nata da
// una fattura importata) si aggiorna la riga direttamente.

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import {
  campiProfiloDaForm,
  payloadSalvaAnagrafica,
  type ClienteFiscaleForm,
} from "@/lib/clienti/clienteFiscale";

export async function salvaClienteFiscale(opz: {
  clienteId?: string | null;
  anagraficaId?: string | null;
  form: ClienteFiscaleForm;
  conUfficio?: boolean;
  /** Allinea anche il profilo del cliente (tipo, ragione sociale, P.IVA, CF). */
  aggiornaProfilo?: boolean;
}): Promise<string> {
  const dati = payloadSalvaAnagrafica(opz.form, { conUfficio: opz.conUfficio });

  if (opz.clienteId) {
    const { data, error } = await supabase.rpc("salva_anagrafica_cliente", {
      p_cliente_id: opz.clienteId,
      p_dati: dati as never,
    });
    if (error) throw new Error(error.message);
    if (opz.aggiornaProfilo) {
      // Chi ha solo il permesso fatturazione può non poter scrivere il profilo:
      // l'anagrafica (che fa fede per la fattura) è già salvata.
      const { error: e2 } = await supabase.from("profiles").update(campiProfiloDaForm(opz.form)).eq("id", opz.clienteId);
      if (e2) logger.warn("Profilo cliente non allineato:", e2.message);
    }
    return data as string;
  }

  if (!opz.anagraficaId) throw new Error("Né cliente né anagrafica da salvare");
  const riga: Record<string, unknown> = { tipo_confermato_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(dati)) {
    if (k.startsWith("ufficio_")) continue;
    riga[k] = typeof v === "string" ? v || null : v;
  }
  if (riga.indirizzo_nazione == null) riga.indirizzo_nazione = "IT";
  const { data: salvata, error } = await supabase
    .from("anagrafiche_native")
    .update(riga as never)
    .eq("id", opz.anagraficaId)
    .select("id, tipo_cliente, codice_sdi")
    .single();
  if (error) throw new Error(error.message);

  // Un ente appena confermato PA: il suo codice di 6 caratteri diventa il primo ufficio,
  // come fa salva_anagrafica_cliente() per chi ha un cliente collegato.
  const codice = String(salvata?.codice_sdi ?? "").trim().toUpperCase();
  if (salvata?.tipo_cliente === "PA" && /^[A-Z0-9]{6}$/.test(codice) && codice !== "000000") {
    const { count } = await supabase
      .from("anagrafica_uffici_pa")
      .select("id", { count: "exact", head: true })
      .eq("anagrafica_id", opz.anagraficaId);
    if (!count) {
      const { error: e3 } = await supabase.from("anagrafica_uffici_pa").insert({
        anagrafica_id: opz.anagraficaId,
        descrizione: "Ufficio di fatturazione",
        codice_univoco_ufficio: codice,
        predefinito: true,
      });
      if (e3) logger.warn("Primo ufficio PA non creato:", e3.message);
    }
  }
  return opz.anagraficaId;
}
