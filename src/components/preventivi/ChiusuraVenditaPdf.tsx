/**
 * ChiusuraVendita — blocco PDF condiviso di "chiusura vendita" per i preventivi
 * @react-pdf dei moduli edili (tetti, climatizzazione, pavimenti, piscine,
 * ristrutturazione, termoidraulico, bagni, elettrico).
 *
 * Le leve di chiusura (audit vendita Belfort/Abraham):
 *   1. Garanzia    — solo le garanzie dell'azienda passate dal modulo; senza,
 *                    il riquadro non compare.
 *   2. Validità    — il testo o i giorni di validità del template.
 *   3. CTA + firma — un solo prossimo passo + riga firma per accettazione.
 *
 * Niente promesse a nome dell'azienda: le frasi fisse su materiali e tempi, sul
 * blocco delle condizioni e sul sopralluogo dopo la firma finivano in ogni PDF,
 * anche dove non erano vere.
 *
 * Self-contained: riceve i colori come prop e costruisce i propri stili, così
 * non dipende dalla StyleSheet del singolo modulo.
 */
import * as React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { testoSopra } from "@/lib/pdf/contrastoColori";
import { fraseValiditaChiusura } from "@/lib/preventivi/validitaOfferta";

export interface ChiusuraVenditaColors {
  primary: string;
  accent: string;
  text: string;
  white: string;
}

interface ChiusuraVenditaProps {
  c: ChiusuraVenditaColors;
  companyName: string;
  /** t.validity_text del template: se c'è, vince sui giorni. */
  validityText?: string | null;
  /** t.default_validita_giorni del template. */
  validitaGiorni?: number | null;
  /** Garanzie scritte dall'azienda. Nessuna garanzia = nessun riquadro. */
  garanzie?: readonly string[] | null;
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

/** I passi dopo il preventivo che valgono per ogni azienda. */
const PROSSIMI_PASSI = [
  { n: "1", t: "Conferma", d: "Firma questo preventivo o rispondici anche solo via messaggio." },
  { n: "2", t: "Partenza lavori", d: "Concordiamo la data di inizio e il cronoprogramma definitivo." },
] as const;

export function ChiusuraVendita({
  c, companyName, validityText, validitaGiorni, garanzie, ctaTitolo,
}: ChiusuraVenditaProps) {
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
    stepsRow: { flexDirection: "row" as const, marginBottom: 10 },
    stepCol: {
      flex: 1,
      marginRight: 8,
      borderWidth: 1,
      borderColor: hexTint(c.primary, 0.8),
      borderRadius: 6,
      padding: 8,
      backgroundColor: hexTint(c.primary, 0.96),
    },
    stepBadge: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: c.primary,
      alignItems: "center" as const, justifyContent: "center" as const,
      marginBottom: 4,
    },
    // Il numero sta sul colore aziendale: bianco, o scuro se il colore è chiaro.
    stepBadgeText: { fontSize: 8.5, fontWeight: 700 as const, color: testoSopra(c.primary) },
    stepTitle: { fontSize: 9.5, fontWeight: 700 as const, color: c.primary, marginBottom: 2 },
    stepText: { fontSize: 8, color: hexTint(c.text, 0.15), lineHeight: 1.35 },
  });

  const validitaFrase = fraseValiditaChiusura(validityText, validitaGiorni);
  const garanzieAzienda = (garanzie ?? []).map((g) => g.trim()).filter(Boolean);

  return (
    <View style={s.wrap}>
      {garanzieAzienda.length > 0 && (
        <View style={s.garBox} wrap={false}>
          <Text style={s.garTitle}>La nostra garanzia</Text>
          {garanzieAzienda.map((g, i) => (
            <View key={i} style={s.garItem}>
              <Text style={s.garDot}>•</Text>
              <Text style={s.garText}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.urgBox} wrap={false}>
        <Text style={s.urgTitle}>Perché decidere ora</Text>
        <Text style={s.urgText}>{validitaFrase}</Text>
      </View>

      {/* I prossimi passi: la pagina di chiusura restava vuota all'80% e la
          firma "sospesa" — la strip dà orientamento. Solo i passi veri per ogni
          azienda: un sopralluogo dopo la firma c'è chi l'ha già fatto e chi no. */}
      <View style={s.stepsRow} wrap={false}>
        {PROSSIMI_PASSI.map((step, i) => (
          <View key={step.n} style={[s.stepCol, i === PROSSIMI_PASSI.length - 1 ? { marginRight: 0 } : {}]}>
            <View style={s.stepBadge}>
              <Text style={s.stepBadgeText}>{step.n}</Text>
            </View>
            <Text style={s.stepTitle}>{step.t}</Text>
            <Text style={s.stepText}>{step.d}</Text>
          </View>
        ))}
      </View>

      <View style={s.ctaBox} wrap={false}>
        <Text style={s.ctaTitle}>{(ctaTitolo ?? "").trim() || "Pronti a partire?"}</Text>
        <Text style={s.ctaText}>
          Il prossimo passo è semplice: confermaci questo preventivo e concordiamo insieme
          la data di inizio. Per qualsiasi dubbio, {companyName} è a tua disposizione.
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
