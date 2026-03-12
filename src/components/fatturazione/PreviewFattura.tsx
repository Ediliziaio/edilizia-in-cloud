import { formatCurrency } from "@/lib/formatters";
import { format, parseISO, isPast } from "date-fns";
import { it } from "date-fns/locale";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda, TipoDocumento, ScadenzaPagamento, RiepilogoIVA, RigaDocumento } from "@/types/fatturazione";

const TIPO_LABELS: Record<TipoDocumento, string> = {
  fattura: "FATTURA",
  fattura_pa: "FATTURA PA",
  nota_credito: "NOTA DI CREDITO",
  nota_debito: "NOTA DI DEBITO",
  autofattura: "AUTOFATTURA",
  fattura_riepilogativa: "FATTURA RIEPILOGATIVA",
  proforma: "PROFORMA",
  preventivo: "PREVENTIVO",
  ddt: "DOCUMENTO DI TRASPORTO",
};

function fmtDate(d: string | undefined): string {
  if (!d) return "";
  try { return format(parseISO(d), "d MMMM yyyy", { locale: it }); } catch { return d; }
}

function isDatePast(d: string | undefined): boolean {
  if (!d) return false;
  try { return isPast(parseISO(d)); } catch { return false; }
}

function esc(s: string | null | undefined): string {
  return s ?? "";
}

interface Props {
  documento: EditorState;
  azienda: AnagraficaAzienda | null;
  scale?: number;
}

export function PreviewFattura({ documento, azienda, scale = 0.65 }: Props) {
  const snap = documento.cliente_snapshot;
  const righe = (documento.righe ?? []) as RigaDocumento[];
  const riepilogo = (documento.riepilogo_iva ?? []) as RiepilogoIVA[];
  const scadenze = (documento.scadenze_pagamento ?? []) as ScadenzaPagamento[];
  const tipo = (documento.tipo as TipoDocumento) ?? "fattura";
  const docLabel = TIPO_LABELS[tipo] ?? "DOCUMENTO";
  const hasSconto = righe.some((r) => (r.sconto_percentuale ?? 0) > 0);
  const colorePrimario = azienda?.colore_primario || "#0ea5e9";

  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
      <div
        className="bg-white text-foreground shadow-lg border rounded-sm mx-auto"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "15mm",
          fontSize: "9pt",
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          lineHeight: 1.5,
          color: "#1a1a1a",
        }}
      >
        {/* ─── Header ─── */}
        <div className="flex justify-between items-start" style={{ marginBottom: "24px" }}>
          <div style={{ maxWidth: "55%" }}>
            {azienda?.logo_url && (
              <img src={azienda.logo_url} alt="Logo" style={{ height: "40px", marginBottom: "8px", objectFit: "contain" }} />
            )}
            {azienda ? (
              <>
                <div style={{ fontSize: "14pt", fontWeight: 700 }}>{azienda.ragione_sociale}</div>
                {azienda.forma_giuridica && (
                  <div style={{ fontSize: "8pt", color: "#64748b" }}>{azienda.forma_giuridica}</div>
                )}
                <div style={{ fontSize: "8pt", color: "#64748b", marginTop: "4px" }}>
                  <div>{azienda.indirizzo_via}{azienda.indirizzo_numero_civico ? `, ${azienda.indirizzo_numero_civico}` : ""}</div>
                  <div>{azienda.indirizzo_cap} {azienda.indirizzo_comune} ({azienda.indirizzo_provincia})</div>
                  <div style={{ fontFamily: "monospace" }}>P.IVA: {azienda.partita_iva}</div>
                  {azienda.codice_fiscale !== azienda.partita_iva && (
                    <div style={{ fontFamily: "monospace" }}>C.F.: {azienda.codice_fiscale}</div>
                  )}
                  {azienda.pec && <div>PEC: {azienda.pec}</div>}
                  {azienda.codice_rea && <div>REA: {azienda.codice_rea}</div>}
                  {azienda.capitale_sociale && <div>Cap. Soc.: {formatCurrency(azienda.capitale_sociale)}</div>}
                  {azienda.telefono && <div>Tel: {azienda.telefono}</div>}
                  {azienda.sito_web && <div>{azienda.sito_web}</div>}
                </div>
              </>
            ) : (
              <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "8pt" }}>Configura anagrafica azienda</div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: "4px",
                backgroundColor: colorePrimario,
                color: "white",
                fontSize: "14pt",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              {docLabel}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "13pt", fontWeight: 600, marginTop: "8px" }}>
              N° {documento.numero || "BOZZA"}
            </div>
            <div style={{ fontSize: "8pt", color: "#64748b", marginTop: "6px" }}>
              <div>Data: {fmtDate(documento.data_emissione)}</div>
              {documento.data_scadenza && (
                <div style={{ color: isDatePast(documento.data_scadenza) ? "#dc2626" : "#64748b" }}>
                  Scadenza: {fmtDate(documento.data_scadenza)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Client Box ─── */}
        {snap?.ragione_sociale && (
          <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "12px 16px", maxWidth: "55%", marginBottom: "20px" }}>
            <div style={{ fontSize: "7pt", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "1px", marginBottom: "4px" }}>Destinatario</div>
            <div style={{ fontWeight: 600, fontSize: "11pt" }}>{snap.ragione_sociale}</div>
            {snap.indirizzo_via && (
              <div style={{ fontSize: "8pt", color: "#64748b" }}>
                {snap.indirizzo_via}, {snap.indirizzo_cap} {snap.indirizzo_comune}
                {snap.indirizzo_provincia ? ` (${snap.indirizzo_provincia})` : ""}
              </div>
            )}
            <div style={{ fontSize: "8pt", color: "#64748b" }}>
              {snap.partita_iva && <div style={{ fontFamily: "monospace" }}>P.IVA: {snap.partita_iva}</div>}
              {snap.codice_fiscale && <div style={{ fontFamily: "monospace" }}>C.F.: {snap.codice_fiscale}</div>}
              {snap.codice_sdi && <span>SDI: {snap.codice_sdi}  </span>}
              {snap.pec && <span>PEC: {snap.pec}</span>}
            </div>
          </div>
        )}

        {/* NC storno reference */}
        {tipo === "nota_credito" && documento.documento_correlato_id && (
          <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", fontSize: "8pt", color: "#92400e" }}>
            Nota di Credito a storno di documento correlato
          </div>
        )}

        {/* PA CIG/CUP */}
        {snap?.tipo_cliente === "PA" && (documento.cig || documento.cup) && (
          <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", fontSize: "8pt", color: "#1e40af" }}>
            {documento.cig && <span>CIG: {documento.cig}  </span>}
            {documento.cup && <span>CUP: {documento.cup}</span>}
          </div>
        )}

        {/* ─── Items Table ─── */}
        {righe.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "8pt" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9" }}>
                <th style={{ padding: "8px", textAlign: "left", fontSize: "7pt", textTransform: "uppercase", color: "#475569", letterSpacing: "0.5px" }}>#</th>
                <th style={{ padding: "8px", textAlign: "left", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>Descrizione</th>
                <th style={{ padding: "8px", textAlign: "right", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>Q.tà</th>
                <th style={{ padding: "8px", textAlign: "center", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>U.M.</th>
                <th style={{ padding: "8px", textAlign: "right", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>Prezzo</th>
                {hasSconto && <th style={{ padding: "8px", textAlign: "right", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>Sc.%</th>}
                <th style={{ padding: "8px", textAlign: "center", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>IVA</th>
                <th style={{ padding: "8px", textAlign: "right", fontSize: "7pt", textTransform: "uppercase", color: "#475569" }}>Importo</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={r.id} style={{ backgroundColor: i % 2 === 1 ? "#f8fafc" : "transparent", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{i + 1}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <div>{r.descrizione || "—"}</div>
                    {r.codice_articolo && <div style={{ fontSize: "7pt", color: "#94a3b8" }}>Cod: {r.codice_articolo}</div>}
                    {r.note_riga && <div style={{ fontSize: "7pt", color: "#94a3b8", fontStyle: "italic" }}>{r.note_riga}</div>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.quantita}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{r.unita_misura}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(r.prezzo_unitario)}</td>
                  {hasSconto && (
                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.sconto_percentuale ? `${r.sconto_percentuale}%` : ""}</td>
                  )}
                  <td style={{ padding: "6px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    {r.aliquota_iva}%{r.natura_iva ? ` (${r.natura_iva})` : ""}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(r.totale_riga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ─── IVA Summary + Totals (side by side) ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", marginTop: "8px" }}>
          {/* IVA Summary Table */}
          {riepilogo.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "7pt", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "1px", marginBottom: "4px" }}>Riepilogo IVA</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "4px 8px", textAlign: "left", fontSize: "7pt", color: "#475569" }}>Aliquota</th>
                    <th style={{ padding: "4px 8px", textAlign: "right", fontSize: "7pt", color: "#475569" }}>Imponibile</th>
                    <th style={{ padding: "4px 8px", textAlign: "right", fontSize: "7pt", color: "#475569" }}>Imposta</th>
                  </tr>
                </thead>
                <tbody>
                  {riepilogo.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "4px 8px" }}>{r.aliquota}%{r.natura ? ` (${r.natura})` : ""}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(r.imponibile)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(r.imposta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals Block */}
          <div style={{ minWidth: "240px" }}>
            <table style={{ width: "100%", fontSize: "8pt" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 8px", color: "#64748b" }}>Imponibile</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(documento.imponibile_totale ?? 0)}</td>
                </tr>
                {(documento.sconto_globale_valore ?? 0) > 0 && (
                  <tr>
                    <td style={{ padding: "4px 8px", color: "#dc2626" }}>Sconto globale</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>-{formatCurrency(documento.sconto_globale_valore ?? 0)}</td>
                  </tr>
                )}
                {(documento.cassa_importo ?? 0) > 0 && (
                  <tr>
                    <td style={{ padding: "4px 8px", color: "#64748b" }}>Cassa previdenziale</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>+{formatCurrency(documento.cassa_importo ?? 0)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: "4px 8px", color: "#64748b" }}>IVA</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(documento.iva_totale ?? 0)}</td>
                </tr>
                {documento.bollo_virtuale && (
                  <tr>
                    <td style={{ padding: "4px 8px", color: "#64748b" }}>Bollo</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(documento.bollo_importo ?? 2)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: "2px solid #0f172a" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, fontSize: "12pt", color: colorePrimario }}>TOTALE</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: "12pt", fontVariantNumeric: "tabular-nums", color: colorePrimario }}>{formatCurrency(documento.totale_documento ?? 0)}</td>
                </tr>
                {(documento.ritenuta_importo ?? 0) > 0 && (
                  <>
                    <tr>
                      <td style={{ padding: "4px 8px", color: "#dc2626" }}>Ritenuta d'acconto</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>-{formatCurrency(documento.ritenuta_importo ?? 0)}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10pt", color: colorePrimario }}>Netto a pagare</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: "10pt", fontVariantNumeric: "tabular-nums", color: colorePrimario }}>{formatCurrency(documento.totale_da_pagare ?? 0)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Payment Block ─── */}
        {documento.metodo_pagamento_codice && (
          <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "12px 16px", marginTop: "20px", fontSize: "8pt", color: "#475569" }}>
            <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: "4px" }}>Modalità di pagamento</div>
            <div>{documento.metodo_pagamento_codice} — {esc(documento.metodo_pagamento_nome) || "Bonifico"}</div>
            {documento.iban_pagamento && <div style={{ fontFamily: "monospace" }}>IBAN: {documento.iban_pagamento}</div>}
            {documento.intestatario_conto && <div>Intestatario: {documento.intestatario_conto}</div>}
            {documento.bic_pagamento && <div>BIC: {documento.bic_pagamento}</div>}
            {documento.nome_banca && <div>Banca: {documento.nome_banca}</div>}
            {scadenze.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: "2px" }}>Scadenze</div>
                {scadenze.map((sc, i) => (
                  <div key={i}>
                    Rata {sc.numero_rata}: {fmtDate(sc.data_scadenza)} — {formatCurrency(sc.importo)}
                    {sc.pagato && " ✓"}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Notes ─── */}
        {documento.note_documento && (
          <div style={{ marginTop: "16px", fontSize: "8pt", color: "#475569", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
            <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: "2px" }}>Note</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{documento.note_documento}</div>
          </div>
        )}

        {/* RF19 forfettario disclaimer */}
        {azienda?.regime_fiscale === "RF19" && (
          <div style={{ marginTop: "12px", fontSize: "7pt", color: "#94a3b8", fontStyle: "italic" }}>
            Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, L. n. 190/2014. 
            Non soggetta a ritenuta d'acconto ai sensi del comma 67, L. n. 190/2014.
            Imposta di bollo assolta sull'originale per importi superiori a € 77,47.
          </div>
        )}

        {/* ─── Footer ─── */}
        <div style={{ marginTop: "40px", paddingTop: "12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "7pt", color: "#94a3b8" }}>
          <div>{azienda?.ragione_sociale} — P.IVA {azienda?.partita_iva}</div>
          <div style={{ color: colorePrimario }}>Documento generato da Edilizia in Cloud</div>
        </div>
      </div>
    </div>
  );
}
