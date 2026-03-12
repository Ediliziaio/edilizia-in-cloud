import { useMemo } from "react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { formatCurrency } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { EditorState } from "./useEditorState";
import type { TipoDocumento, ScadenzaPagamento } from "@/types/fatturazione";

const TIPO_TITLES: Record<TipoDocumento, string> = {
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

interface Props {
  state: EditorState;
}

export function EditorPreviewPanel({ state }: Props) {
  const { data: azienda } = useAnagraficaAzienda();
  const snapshot = state.cliente_snapshot;
  const righe = state.righe ?? [];
  const riepilogo = state.riepilogo_iva ?? [];
  const scadenze = (state.scadenze_pagamento ?? []) as ScadenzaPagamento[];

  const docTitle = TIPO_TITLES[(state.tipo as TipoDocumento) ?? "fattura"] ?? "DOCUMENTO";

  return (
    <div className="h-full overflow-auto bg-muted/30 p-4">
      <div
        className="mx-auto bg-card shadow-lg border rounded-sm"
        style={{ width: "210mm", maxWidth: "100%", minHeight: "297mm", padding: "15mm", fontSize: "9pt" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            {azienda ? (
              <>
                <div className="text-base font-bold text-foreground">{azienda.ragione_sociale}</div>
                <div className="text-muted-foreground text-[8pt] space-y-0.5 mt-1">
                  <div>{azienda.indirizzo_via}{azienda.indirizzo_numero_civico ? `, ${azienda.indirizzo_numero_civico}` : ""}</div>
                  <div>{azienda.indirizzo_cap} {azienda.indirizzo_comune} ({azienda.indirizzo_provincia})</div>
                  <div>P.IVA: {azienda.partita_iva} · CF: {azienda.codice_fiscale}</div>
                  {azienda.pec && <div>PEC: {azienda.pec}</div>}
                  {azienda.telefono && <div>Tel: {azienda.telefono}</div>}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground italic text-xs">Configura anagrafica azienda</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tracking-wide text-primary">{docTitle}</div>
            <div className="text-sm font-mono font-semibold mt-1">{state.numero}</div>
            <div className="text-muted-foreground text-[8pt] mt-1">Data: {fmtDate(state.data_emissione)}</div>
            {state.data_scadenza && (
              <div className="text-muted-foreground text-[8pt]">Scadenza: {fmtDate(state.data_scadenza)}</div>
            )}
          </div>
        </div>

        {/* Client */}
        {snapshot?.ragione_sociale && (
          <div className="mb-6 border rounded p-3" style={{ maxWidth: "55%" }}>
            <div className="text-[7pt] uppercase text-muted-foreground tracking-wider mb-1">Destinatario</div>
            <div className="font-semibold text-foreground">{snapshot.ragione_sociale}</div>
            {snapshot.indirizzo_via && (
              <div className="text-muted-foreground text-[8pt]">
                {snapshot.indirizzo_via}, {snapshot.indirizzo_cap} {snapshot.indirizzo_comune}
                {snapshot.indirizzo_provincia ? ` (${snapshot.indirizzo_provincia})` : ""}
              </div>
            )}
            {snapshot.partita_iva && (
              <div className="text-muted-foreground text-[8pt]">P.IVA: {snapshot.partita_iva}</div>
            )}
            {snapshot.codice_fiscale && (
              <div className="text-muted-foreground text-[8pt]">CF: {snapshot.codice_fiscale}</div>
            )}
            <div className="text-muted-foreground text-[8pt] flex gap-3">
              {snapshot.codice_sdi && <span>SDI: {snapshot.codice_sdi}</span>}
              {snapshot.pec && <span>PEC: {snapshot.pec}</span>}
            </div>
            {/* CIG/CUP */}
            {(state.cig || state.cup) && (
              <div className="text-muted-foreground text-[8pt] mt-1 flex gap-3">
                {state.cig && <span>CIG: {state.cig}</span>}
                {state.cup && <span>CUP: {state.cup}</span>}
              </div>
            )}
          </div>
        )}

        {/* Lines table */}
        {righe.length > 0 && (
          <table className="w-full border-collapse mb-4" style={{ fontSize: "8pt" }}>
            <thead>
              <tr className="border-b-2 border-foreground/20">
                <th className="text-left py-1.5 font-semibold">#</th>
                <th className="text-left py-1.5 font-semibold">Descrizione</th>
                <th className="text-right py-1.5 font-semibold">Qtà</th>
                <th className="text-right py-1.5 font-semibold">Prezzo</th>
                {righe.some((r) => (r.sconto_percentuale ?? 0) > 0) && (
                  <th className="text-right py-1.5 font-semibold">Sc.%</th>
                )}
                <th className="text-right py-1.5 font-semibold">IVA%</th>
                <th className="text-right py-1.5 font-semibold">Totale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5">{r.descrizione || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.quantita} {r.unita_misura}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.prezzo_unitario)}</td>
                  {righe.some((r) => (r.sconto_percentuale ?? 0) > 0) && (
                    <td className="py-1.5 text-right tabular-nums">{r.sconto_percentuale ? `${r.sconto_percentuale}%` : ""}</td>
                  )}
                  <td className="py-1.5 text-right tabular-nums">{r.aliquota_iva}%{r.natura_iva ? ` (${r.natura_iva})` : ""}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(r.totale_riga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-end">
          <div className="space-y-1" style={{ minWidth: "220px" }}>
            <div className="flex justify-between text-[8pt]">
              <span className="text-muted-foreground">Imponibile</span>
              <span className="tabular-nums">{formatCurrency(state.imponibile_totale ?? 0)}</span>
            </div>
            {(state.sconto_globale_valore ?? 0) > 0 && (
              <div className="flex justify-between text-[8pt] text-destructive">
                <span>Sconto globale</span>
                <span className="tabular-nums">-{formatCurrency(state.sconto_globale_valore ?? 0)}</span>
              </div>
            )}
            {riepilogo.map((r, i) => (
              <div key={i} className="flex justify-between text-[8pt]">
                <span className="text-muted-foreground">IVA {r.aliquota}%{r.natura ? ` (${r.natura})` : ""}</span>
                <span className="tabular-nums">{formatCurrency(r.imposta)}</span>
              </div>
            ))}
            {state.bollo_virtuale && (
              <div className="flex justify-between text-[8pt]">
                <span className="text-muted-foreground">Bollo</span>
                <span className="tabular-nums">{formatCurrency(state.bollo_importo ?? 2)}</span>
              </div>
            )}
            {(state.cassa_importo ?? 0) > 0 && (
              <div className="flex justify-between text-[8pt]">
                <span className="text-muted-foreground">Cassa previdenziale</span>
                <span className="tabular-nums">+{formatCurrency(state.cassa_importo ?? 0)}</span>
              </div>
            )}
            {(state.ritenuta_importo ?? 0) > 0 && (
              <div className="flex justify-between text-[8pt] text-destructive">
                <span>Ritenuta d'acconto</span>
                <span className="tabular-nums">-{formatCurrency(state.ritenuta_importo ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1 text-sm">
              <span>Totale</span>
              <span className="tabular-nums">{formatCurrency(state.totale_da_pagare ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Payment info */}
        {state.metodo_pagamento_codice && (
          <div className="mt-6 border-t pt-3 text-[8pt] text-muted-foreground space-y-0.5">
            <div className="font-semibold text-foreground text-[8pt]">Modalità di pagamento</div>
            <div>{state.metodo_pagamento_codice} — {state.metodo_pagamento_nome ?? "Bonifico"}</div>
            {state.iban_pagamento && <div>IBAN: {state.iban_pagamento}</div>}
            {state.bic_pagamento && <div>BIC: {state.bic_pagamento}</div>}
            {state.nome_banca && <div>Banca: {state.nome_banca}</div>}
            {scadenze.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold text-foreground text-[8pt] mb-0.5">Scadenze</div>
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

        {/* Notes */}
        {state.note_documento && (
          <div className="mt-4 text-[8pt] text-muted-foreground border-t pt-2">
            <div className="font-semibold text-foreground mb-0.5">Note</div>
            <div className="whitespace-pre-wrap">{state.note_documento}</div>
          </div>
        )}
      </div>
    </div>
  );
}
