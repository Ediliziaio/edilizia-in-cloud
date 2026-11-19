import { useEffect, useRef, useState } from "react";
import type { AnagraficaAzienda } from "@/types/fatturazione";
import { PreviewFattura } from "./PreviewFattura";

/** L'anteprima delle impostazioni usa il foglio della fattura vera, adattato al pannello. */
export function FatturaTemplatePreview({ azienda, logoAziendale, numero }: {
  azienda: AnagraficaAzienda;
  logoAziendale?: string | null;
  numero: string;
}) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(0.6);
  useEffect(() => {
    const nodo = contenitore.current;
    if (!nodo) return;
    const aggiorna = () => setScala(Math.min(1, nodo.clientWidth / (210 * 96 / 25.4)));
    aggiorna();
    const observer = new ResizeObserver(aggiorna);
    observer.observe(nodo);
    return () => observer.disconnect();
  }, []);
  return <div ref={contenitore} aria-label="Anteprima della fattura" className="max-h-[70dvh] overflow-y-auto overflow-x-hidden rounded-lg bg-slate-100">
    <div style={{ zoom: scala, width: "210mm" }}>
      <PreviewFattura azienda={azienda} logoAziendale={logoAziendale} scale={1} documento={{
        tipo: "fattura", numero, data_emissione: new Date().toLocaleDateString("sv-SE"),
        cliente_snapshot: { tipo_cliente: "B2B", ragione_sociale: "Cliente Esempio S.r.l.", indirizzo_via: "Via Roma 1", indirizzo_cap: "00100", indirizzo_comune: "Roma", indirizzo_nazione: "IT" },
        righe: [{ id: "esempio", numero_linea: 1, descrizione: "Lavorazioni eseguite come da accordi", quantita: 1, unita_misura: "corpo", prezzo_unitario: 1000, imponibile: 1000, aliquota_iva: "22", imposta: 220, totale_riga: 1220 }],
        imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220, totale_da_pagare: 1220,
      }} />
    </div>
  </div>;
}
