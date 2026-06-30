/**
 * ChiusuraVendita — blocco PDF condiviso di "chiusura vendita" per i preventivi
 * @react-pdf dei moduli edili (tetti, climatizzazione, pavimenti, piscine,
 * ristrutturazione, termoidraulico, bagni, elettrico).
 *
 * Colma le 3 leve di chiusura che mancavano (audit vendita Belfort/Abraham):
 *   1. Garanzia / risk-reversal — rassicurazione forte, sempre presente.
 *   2. Urgenza onesta           — validità reale dell'offerta + blocco condizioni.
 *   3. CTA + firma              — un solo prossimo passo + riga firma per accettazione.
 *
 * Default ONESTI: nessuna promessa inventata (niente "soddisfatti o rimborsati"),
 * solo baseline veri (regola d'arte, tempi concordati, garanzie di legge). Ogni
 * azienda potrà poi personalizzare i testi dal template.
 *
 * Self-contained: riceve i colori come prop e costruisce i propri stili, così
 * non dipende dalla StyleSheet del singolo modulo.
 */
import * as React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

export interface ChiusuraVenditaColors {
  primary: string;
  accent: string;
  text: string;
  white: string;
}

interface ChiusuraVenditaProps {
  c: ChiusuraVenditaColors;
  companyName: string;
  /** t.validity_text del template; fallback onesto se vuoto. */
  validityText?: string | null;
  /** Override opzionale del titolo della CTA finale. */
  ctaTitolo?: string | null;
}

function hexTint(hex: string, alpha: number): string {
  const h = (hex || "#000000").replace("#", "");
  if (h.length < 6) return hex || "#000000";
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (ch: number) => Math.round(ch + (255 - ch) * alpha);
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function ChiusuraVendita({ c, companyName, validityText, ctaTitolo }: ChiusuraVenditaProps) {
  const accent = c.accent || c.primary;
  const s = StyleSheet.create({
    wrap: { marginTop: 16 },
    garBox: {
      borderWidth: 1,
      borderColor: hexTint(c.primary, 0.6),
      borderRadius: 6,
      backgroundColor: hexTint(c.primary, 0.93),
      padding: 10,
      marginBottom: 10,
    },
    garTitle: { fontSize: 11, fontWeight: 700, color: c.primary, marginBottom: 4 },
    garItem: { flexDirection: "row" as const, marginBottom: 2 },
    garDot: { width: 10, fontSize: 9, color: accent },
    garText: { flex: 1, fontSize: 9, color: c.text, lineHeight: 1.35 },
    urgBox: {
      borderLeftWidth: 3,
      borderLeftColor: accent,
      backgroundColor: hexTint(accent, 0.9),
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    urgTitle: { fontSize: 10.5, fontWeight: 700, color: accent, marginBottom: 2 },
    urgText: { fontSize: 9, color: c.text, lineHeight: 1.4 },
    ctaBox: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 6,
      padding: 12,
      backgroundColor: c.white,
    },
    ctaTitle: { fontSize: 13, fontWeight: 700, color: c.primary, marginBottom: 3 },
    ctaText: { fontSize: 9.5, color: c.text, lineHeight: 1.4, marginBottom: 10 },
    signRow: { flexDirection: "row" as const, marginTop: 4 },
    signCol: { flex: 1, marginRight: 10 },
    signLine: { borderBottomWidth: 1, borderBottomColor: hexTint(c.text, 0.55), height: 22 },
    signLabel: {
      fontSize: 7.5,
      color: hexTint(c.text, 0.35),
      marginTop: 3,
      textTransform: "uppercase" as const,
      letterSpacing: 0.4,
    },
  });

  const validita = (validityText ?? "").trim() || "30 giorni dalla data di emissione";
  const garanzie = [
    "Lavori eseguiti a regola d'arte, con materiali conformi e certificati.",
    "Rispetto dei tempi e del preventivo concordati, senza sorprese.",
    "Assistenza dopo l'intervento e garanzie previste dalla legge.",
  ];

  return (
    <View style={s.wrap}>
      <View style={s.garBox} wrap={false}>
        <Text style={s.garTitle}>La nostra garanzia</Text>
        {garanzie.map((g, i) => (
          <View key={i} style={s.garItem}>
            <Text style={s.garDot}>•</Text>
            <Text style={s.garText}>{g}</Text>
          </View>
        ))}
      </View>

      <View style={s.urgBox} wrap={false}>
        <Text style={s.urgTitle}>Perché decidere ora</Text>
        <Text style={s.urgText}>
          Questo preventivo è valido {validita}. I prezzi dei materiali e gli incentivi
          fiscali possono variare nel tempo: confermando ora blocchi le condizioni di oggi.
        </Text>
      </View>

      <View style={s.ctaBox} wrap={false}>
        <Text style={s.ctaTitle}>{(ctaTitolo ?? "").trim() || "Pronti a partire?"}</Text>
        <Text style={s.ctaText}>
          Il prossimo passo è semplice: confermaci questo preventivo e fissiamo insieme il
          sopralluogo tecnico. Per qualsiasi dubbio, {companyName} è a tua disposizione.
        </Text>
        <View style={s.signRow}>
          <View style={s.signCol}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>Data</Text>
          </View>
          <View style={[s.signCol, { flex: 2, marginRight: 0 }]}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>Firma per accettazione</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default ChiusuraVendita;
