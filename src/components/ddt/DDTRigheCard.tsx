// ============================================================================
// Merce sulla bolla — che cosa c'è scritto sul documento del fornitore
// ----------------------------------------------------------------------------
// È la prima domanda che si fa a una bolla: cosa è arrivato. Non il corriere,
// non la targa: la merce. Per questo sta in testa alla pagina.
//
// Da non confondere con «Ricezioni merce per articolo» (`goods_receipts`), che
// è un'altra cosa: quelle sono le quantità entrate in magazzino contro una riga
// d'ordine già esistente. Qui c'è la bolla così com'è, prezzi compresi, anche
// per i prodotti che in ordine non c'erano — ed è quello che permetterà di
// confrontare la fattura di fine mese con le bolle (fase 4 del piano).
//
// OGNI CAMPO SI CORREGGE A MANO. L'AI legge, la persona ha l'ultima parola, e
// quello che l'AI aveva letto non si perde: resta in `ai_originale`, e la riga
// corretta lo mostra. Una riga sbagliata qui diventa un costo sbagliato in
// commessa e poi una fattura che non torna: va vista e corretta guardando la
// foto, che su questa pagina sta accanto.
// ============================================================================

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ListTree, Loader2, Sparkles, AlertTriangle, Plus, Trash2, PenLine, Check, X,
} from "lucide-react";
import {
  useDDTRighe,
  useDDTRigheMutations,
  type DDTRiga,
  type DDTRigaNuova,
} from "@/hooks/useDDTRicezione";
import { importoRiga } from "@/lib/ddt/letturaAI";
import { cn } from "@/lib/utils";

const euro = (v: number) =>
  v.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true });

const numero = (v: number | null | undefined, max = 3) =>
  v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: max });

/** Il testo è quello che si digita; vuoto vuol dire «non si sa», cioè NULL. */
const testo = (v: string) => (v.trim() === "" ? null : v.trim());
const cifra = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

type Bozza = {
  codice_articolo: string;
  descrizione: string;
  unita_misura: string;
  quantita: string;
  prezzo_unitario: string;
};

const bozzaDa = (r: DDTRiga): Bozza => ({
  codice_articolo: r.codice_articolo ?? "",
  descrizione: r.descrizione,
  unita_misura: r.unita_misura ?? "",
  quantita: r.quantita != null ? String(r.quantita) : "",
  prezzo_unitario: r.prezzo_unitario != null ? String(r.prezzo_unitario) : "",
});

const BOZZA_VUOTA: Bozza = {
  codice_articolo: "",
  descrizione: "",
  unita_misura: "",
  quantita: "",
  prezzo_unitario: "",
};

/** Che cosa aveva letto l'AI su questa riga, per dirlo quando è stata corretta. */
function lettoDallAI(r: DDTRiga): string | null {
  const o = r.ai_originale;
  if (!o || typeof o !== "object") return null;
  const g = o as Record<string, unknown>;
  const pezzi = [
    g.codice_articolo ? String(g.codice_articolo) : null,
    g.descrizione ? String(g.descrizione) : null,
    g.quantita != null ? `× ${g.quantita}` : null,
    g.unita_misura ? String(g.unita_misura) : null,
    g.prezzo_unitario_eur != null ? `a ${g.prezzo_unitario_eur}` : null,
  ].filter(Boolean);
  return pezzi.length > 0 ? pezzi.join(" ") : null;
}

export function DDTRigheCard({
  ddtId,
  aiConfidenza,
  aiAvvisi,
  /** La quantità scritta in testata: se non torna con le righe va detto. */
  quantitaInTestata,
  /** Sola lettura per chi non può modificare la bolla. */
  modificabile = true,
}: {
  ddtId: string | null | undefined;
  aiConfidenza?: number | null;
  aiAvvisi?: string[] | null;
  quantitaInTestata?: number | null;
  modificabile?: boolean;
}) {
  const { data: righe = [], isLoading } = useDDTRighe(ddtId);
  const { aggiungiRighe, aggiornaRiga, eliminaRiga } = useDDTRigheMutations(ddtId);

  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Bozza>(BOZZA_VUOTA);
  const [nuova, setNuova] = useState<Bozza | null>(null);

  const importi = righe.map((r) => importoRiga(r)).filter((v): v is number => v != null);
  const totale = importi.length > 0 ? importi.reduce((s, v) => s + v, 0) : null;
  const quantitaRighe = righe.reduce((s, r) => s + (r.quantita ?? 0), 0);
  const senzaPrezzo = righe.filter((r) => importoRiga(r) == null).length;
  // Scarto fra la quantità in testata e la somma delle righe. Due numeri che
  // dicono la stessa cosa e non coincidono sono peggio di un numero solo.
  const scartoQuantita =
    quantitaInTestata != null && quantitaRighe > 0
      ? Math.round((quantitaInTestata - quantitaRighe) * 1000) / 1000
      : 0;

  const apriModifica = (r: DDTRiga) => {
    setInModifica(r.id);
    setBozza(bozzaDa(r));
    setNuova(null);
  };

  const salva = async () => {
    if (!inModifica) return;
    await aggiornaRiga.mutateAsync({
      id: inModifica,
      updates: {
        codice_articolo: testo(bozza.codice_articolo),
        descrizione: bozza.descrizione,
        unita_misura: testo(bozza.unita_misura),
        quantita: cifra(bozza.quantita),
        prezzo_unitario: cifra(bozza.prezzo_unitario),
        // Toccata a mano: l'importo del documento non vale più e si ricalcola,
        // e la riga smette di essere «letta dall'AI». `ai_originale` resta.
        importo: null,
        origine: "manuale",
      },
    });
    setInModifica(null);
  };

  const salvaNuova = async () => {
    if (!nuova || nuova.descrizione.trim() === "") return;
    const riga: DDTRigaNuova = {
      posizione: righe.length + 1,
      codice_articolo: testo(nuova.codice_articolo),
      descrizione: nuova.descrizione.trim(),
      unita_misura: testo(nuova.unita_misura),
      quantita: cifra(nuova.quantita),
      prezzo_unitario: cifra(nuova.prezzo_unitario),
      importo: null,
      iva_percentuale: null,
      order_item_id: null,
      origine: "manuale",
      ai_originale: null,
      testo_grezzo: null,
      note: null,
    };
    await aggiungiRighe.mutateAsync([riga]);
    setNuova(null);
  };

  const inCorso = aggiornaRiga.isPending || aggiungiRighe.isPending || eliminaRiga.isPending;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="h-4 w-4 text-primary" />
            Merce sulla bolla
            <Badge variant="secondary" className="text-xs">
              {righe.length}
            </Badge>
            {aiConfidenza != null && (
              <Badge variant="outline" className="text-[10px] font-normal gap-1">
                <Sparkles className="h-3 w-3" />
                letta dall'AI · {Math.round(aiConfidenza * 100)}%
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {totale != null && (
              <span className="text-xs text-muted-foreground">
                Valore merce: <strong className="tabular-nums">{euro(totale)}</strong>
              </span>
            )}
            {modificabile && !nuova && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  setNuova(BOZZA_VUOTA);
                  setInModifica(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Aggiungi riga
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : righe.length === 0 && !nuova ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nessuna riga registrata per questa bolla. Senza le righe non si può
            confrontare la bolla con la fattura del fornitore.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                  <th className="w-[15%]">Codice</th>
                  <th>Descrizione</th>
                  <th className="w-[10%] text-right">Q.tà</th>
                  <th className="w-[8%]">UM</th>
                  <th className="w-[13%] text-right">€/UM</th>
                  <th className="w-[13%] text-right">Importo</th>
                  {modificabile && <th className="w-[8%]" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((r) =>
                  inModifica === r.id ? (
                    <tr key={r.id} className="bg-primary/5 [&>td]:px-1.5 [&>td]:py-1.5">
                      <td>
                        <Input
                          value={bozza.codice_articolo}
                          onChange={(e) => setBozza({ ...bozza, codice_articolo: e.target.value })}
                          className="h-7 text-xs font-mono"
                          placeholder="codice"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.descrizione}
                          onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="descrizione"
                          autoFocus
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.quantita}
                          onChange={(e) => setBozza({ ...bozza, quantita: e.target.value })}
                          inputMode="decimal"
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.unita_misura}
                          onChange={(e) => setBozza({ ...bozza, unita_misura: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.prezzo_unitario}
                          onChange={(e) => setBozza({ ...bozza, prezzo_unitario: e.target.value })}
                          inputMode="decimal"
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td className="text-right text-muted-foreground">
                        {cifra(bozza.quantita) != null && cifra(bozza.prezzo_unitario) != null
                          ? euro(
                              Math.round(
                                cifra(bozza.quantita)! * cifra(bozza.prezzo_unitario)! * 100,
                              ) / 100,
                            )
                          : "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            className="h-6 w-6"
                            onClick={salva}
                            disabled={inCorso || bozza.descrizione.trim() === ""}
                          >
                            {inCorso ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setInModifica(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="[&>td]:px-2 [&>td]:py-1.5 hover:bg-muted/20">
                      <td className="font-mono text-[11px] text-muted-foreground">
                        {r.codice_articolo || "—"}
                      </td>
                      <td className="max-w-[260px]">
                        <span className="flex items-center gap-1.5">
                          <span className="block truncate" title={r.descrizione}>
                            {r.descrizione}
                          </span>
                          {r.origine === "manuale" && r.ai_originale && (
                            <span
                              className="shrink-0"
                              title={`Corretta a mano. L'AI aveva letto: ${lettoDallAI(r) ?? "—"}`}
                            >
                              <PenLine className="h-3 w-3 text-amber-600" />
                            </span>
                          )}
                          {r.origine === "ai" && (
                            <span className="shrink-0" title="Letta dall'AI, non ancora controllata">
                              <Sparkles className="h-3 w-3 text-violet-500" />
                            </span>
                          )}
                        </span>
                        {r.origine === "manuale" && lettoDallAI(r) && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            l'AI aveva letto: {lettoDallAI(r)}
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{numero(r.quantita)}</td>
                      <td className="text-muted-foreground">{r.unita_misura || "—"}</td>
                      <td className="text-right tabular-nums">
                        {r.prezzo_unitario != null ? euro(r.prezzo_unitario) : "—"}
                      </td>
                      <td
                        className={cn(
                          "text-right tabular-nums font-medium",
                          importoRiga(r) == null && "text-amber-600",
                        )}
                      >
                        {importoRiga(r) != null ? euro(importoRiga(r)!) : "da valorizzare"}
                      </td>
                      {modificabile && (
                        <td>
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => apriModifica(r)}
                              title="Correggi la riga"
                            >
                              <PenLine className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => eliminaRiga.mutate(r.id)}
                              title="Togli la riga"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}

                {nuova && (
                  <tr className="bg-emerald-50/60 [&>td]:px-1.5 [&>td]:py-1.5">
                    <td>
                      <Input
                        value={nuova.codice_articolo}
                        onChange={(e) => setNuova({ ...nuova, codice_articolo: e.target.value })}
                        className="h-7 text-xs font-mono"
                        placeholder="codice"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.descrizione}
                        onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="descrizione della merce"
                        autoFocus
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.quantita}
                        onChange={(e) => setNuova({ ...nuova, quantita: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.unita_misura}
                        onChange={(e) => setNuova({ ...nuova, unita_misura: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="pz"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.prezzo_unitario}
                        onChange={(e) => setNuova({ ...nuova, prezzo_unitario: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td className="text-right text-muted-foreground">—</td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          className="h-6 w-6"
                          onClick={salvaNuova}
                          disabled={inCorso || nuova.descrizione.trim() === ""}
                        >
                          {inCorso ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setNuova(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {righe.length > 0 && (
                <tfoot className="border-t bg-muted/20 font-medium">
                  <tr className="[&>td]:px-2 [&>td]:py-1.5">
                    <td colSpan={2} className="text-muted-foreground">
                      Totale
                    </td>
                    <td className="text-right tabular-nums">{numero(quantitaRighe)}</td>
                    <td colSpan={2} />
                    <td className="text-right tabular-nums">
                      {totale != null ? euro(totale) : "—"}
                    </td>
                    {modificabile && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Quello che non torna, detto invece che lasciato scoprire */}
        {scartoQuantita !== 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            La quantità in testata è {numero(quantitaInTestata)}, la somma delle righe
            è {numero(quantitaRighe)}: {numero(Math.abs(scartoQuantita))} di differenza.
            Vale quello che c'è sulle righe — la testata è un totale che qualcuno ha
            digitato.
          </p>
        )}

        {senzaPrezzo > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {senzaPrezzo} {senzaPrezzo === 1 ? "riga" : "righe"} senza prezzo: la bolla
            non è valorizzabile per intero, e la fattura di fine mese non si potrà
            ripartire su quella parte.
          </p>
        )}

        {aiAvvisi && aiAvvisi.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-amber-700">
            {aiAvvisi.map((a) => (
              <li key={a} className="flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                {a}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
