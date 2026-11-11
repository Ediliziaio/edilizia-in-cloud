export const DDT_EXTRACTION_PROMPT = `Sei un esperto di logistica e amministrazione edilizia italiana ed europea.
Analizza il PDF/immagine allegato (Documento di Trasporto / DDT o CMR internazionale) ed estrai TUTTI i dati strutturati.

REGOLE GENERALI:
1. Numeri italiani: punto = migliaia, virgola = decimali. "1.234,56" → 1234.56
2. Date in ISO: YYYY-MM-DD (anche da formato 07.02.2026 → 2026-02-07)
3. NON inventare. Se manca o è illeggibile, ritorna null + warning specifico.
4. Per le righe merce: una riga per ogni item (anche se compatte sul DDT).
5. Riconosci codice articolo + descrizione + UM + quantità + (eventuale) prezzo.
6. Causale tipica: "Vendita", "Reso", "Conto lavorazione", "Trasferimento", "Trasporto internazionale".

REGOLE MITTENTE/DESTINATARIO (CRITICHE):
7. **DDT italiano**: usa le etichette e i dati fiscali, MAI la posizione dei riquadri. Il primo box può essere il destinatario e il secondo il luogo di consegna. Il mittente può essere nel logo o nel piè di pagina. Non confondere emittente, cliente e cantiere.
7a. Conserva in riferimenti.note_libere le annotazioni manoscritte, soprattutto quantità lasciate in cantiere e resto in magazzino. Non trasformare note di imballo (es. 5 rotoli) in altre righe o quantità sostitutive.
7b. Evidenzia in causale e warnings resi, restituzioni di noleggio e documenti «merce in entrata» del noleggiatore: non sono automaticamente acquisti di merce. Distingui servizi (es. costi pulizia) dagli articoli. UM assente = null. Numeri di pezzi e metri quadrati in colonne diverse non sono intercambiabili.
8. **CMR internazionale** (Lettera di Vettura "Convention Merchandises Routiers"):
   - Box numerato "1 / Expediteur / Absender / Sender / Mittente" = MITTENTE
   - Box numerato "2 / Destinataire / Empfänger / Consignee / Destinatario" = DESTINATARIO
   - Spesso compilati a mano nei riquadri appositi del modulo prestampato
   - NON confondere con il "16 Trasportatore/Carrier/Frachtführer" che è il VETTORE
9. **Anti-pattern frequenti da evitare**:
   - NON leggere l'IBAN/dati bancari come ragione sociale del vettore
   - NON considerare la banca (es. "Banca Transylvania") come vettore
   - NON copiare lo stesso ragione sociale in mittente E destinatario senza essere certo
   - Se il box destinatario è scritto a mano e illeggibile, cerca anche nel campo "luogo di consegna" (box 3 del CMR) e nelle note

REGOLE VETTORE:
10. Vettore = solo chi materialmente trasporta (riga 16 del CMR oppure "Vettore/Trasportatore" del DDT IT).
11. Tipo vettore: "mittente" se coincide col mittente, "destinatario" se coincide col destinatario, "terzi" altrimenti.
12. Targa veicolo (campo "Autoveicolo") va in vettore.note se non c'è campo dedicato.

Restituisci SOLO JSON valido (no markdown):
{
  "intestazione": {
    "numero_ddt": "string",
    "data_ddt": "YYYY-MM-DD",
    "data_inizio_trasporto": "YYYY-MM-DD o null",
    "ora_inizio_trasporto": "HH:MM o null",
    "causale": "string",
    "n_pagine": numero
  },
  "mittente": {
    "ragione_sociale": "string",
    "partita_iva": "string o null",
    "codice_fiscale": "string o null",
    "indirizzo": "string",
    "comune": "string",
    "provincia": "string",
    "cap": "string"
  },
  "destinatario": {
    "ragione_sociale": "string",
    "partita_iva": "string o null",
    "indirizzo": "string",
    "comune": "string",
    "provincia": "string",
    "cap": "string"
  },
  "luogo_destinazione": {
    "indirizzo": "string o null",
    "comune": "string o null",
    "note": "string o null"
  },
  "vettore": {
    "ragione_sociale": "string o null",
    "tipo": "mittente|destinatario|terzi|null"
  },
  "trasporto": {
    "porto": "franco|assegnato|null",
    "aspetto_esteriore_beni": "string o null",
    "n_colli": numero o null,
    "peso_lordo_kg": numero o null,
    "peso_netto_kg": numero o null,
    "volume_mc": numero o null,
    "tipo_imballaggio": "string o null"
  },
  "righe_merce": [
    {
      "codice_articolo": "string o null",
      "descrizione": "string",
      "unita_misura": "pz|kg|mc|ml|...",
      "quantita": numero,
      "prezzo_unitario_eur": numero o null,
      "importo_eur": numero o null,
      "iva_percentuale": numero o null
    }
  ],
  "totali": {
    "imponibile_eur": numero o null,
    "iva_eur": numero o null,
    "totale_documento_eur": numero o null
  },
  "riferimenti": {
    "ordine_acquisto": "string o null",
    "commessa": "string o null",
    "note_libere": "string o null"
  },
  "confidence": 0.0-1.0,
  "warnings": ["string"]
}`;

// Normalizza l'output AI prima di mostrarlo/salvarlo: l'AI può restituire
// oggetti quasi corretti ma con array mancanti o confidence fuori range.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDdtPayload(raw: any): Record<string, unknown> {
  const ddt = raw && typeof raw === "object" ? raw : {};
  const warnings = Array.isArray(ddt.warnings)
    ? ddt.warnings.filter(Boolean)
    : [];
  const righe = Array.isArray(ddt.righe_merce) ? ddt.righe_merce : [];

  if (righe.length === 0) {
    warnings.push(
      "Nessuna riga merce riconosciuta: verifica manualmente il DDT.",
    );
  }
  if (!ddt.intestazione?.numero_ddt) {
    warnings.push("Numero DDT non riconosciuto con certezza.");
  }
  if (!ddt.mittente?.ragione_sociale || !ddt.destinatario?.ragione_sociale) {
    warnings.push(
      "Mittente o destinatario incompleto: controlla i riquadri del documento.",
    );
  }

  return {
    ...ddt,
    righe_merce: righe.map((row: Record<string, unknown>) => ({
      ...row,
      descrizione: String(row?.descrizione ?? "").trim(),
      quantita: Number(row?.quantita ?? 0) || null,
      unita_misura: row?.unita_misura
        ? String(row.unita_misura).trim().toLowerCase()
        : null,
    })),
    confidence: Math.max(0, Math.min(1, Number(ddt.confidence ?? 0.55))),
    warnings: Array.from(new Set(warnings.map(String))),
  };
}
