import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateIt } from "@/lib/formatters";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { chiudibile, preselezione, sommaSelezionate, type ElencoSpese, type EsitoChiusura, type SpesaBancariaAperta } from "@/lib/finance/speseBancarie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TUTTI = "all";

/**
 * «Chiudi le spese bancarie»: tutte le commissioni, i canoni e i bolli che il motore riconosce,
 * senza fattura, in un lotto solo. Ognuna diventa un costo già pagato da quel movimento, come il
 * pulsante «Senza fattura → Commissioni bancarie». Il lotto è tutto o niente e si annulla da qui.
 */
export function ChiudiSpeseBancarie({ companyId, accounts, contoIniziale, dalIniziale, alIniziale, open, onOpenChange, onFatto }: {
  companyId: string;
  accounts: Array<{ id: string; nome: string; attivo?: boolean }>;
  contoIniziale?: string;
  dalIniziale?: string;
  alIniziale?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFatto: () => void;
}) {
  const t = useT();
  const [conto, setConto] = useState(contoIniziale || TUTTI);
  const [dal, setDal] = useState(dalIniziale ?? "");
  const [al, setAl] = useState(alIniziale ?? "");
  // Le scelte valgono per l'elenco su cui sono state fatte: un elenco nuovo riparte dalla preselezione.
  const [scelteFatte, setScelteFatte] = useState<{ righe: SpesaBancariaAperta[]; ids: Set<string> } | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoChiusura | null>(null);

  const elenco = useQuery({
    queryKey: ["tesoreria-spese-bancarie-aperte", companyId, conto, dal, al],
    enabled: open && !!companyId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await db.rpc("tesoreria_spese_bancarie_aperte", {
        p_company: companyId,
        p_conto: conto === TUTTI ? null : conto,
        p_dal: dal || null,
        p_al: al || null,
      });
      if (error) throw error;
      return data as ElencoSpese;
    },
  });
  const righe = useMemo(() => elenco.data?.movimenti ?? [], [elenco.data]);
  const scelte = useMemo(
    () => (scelteFatte && scelteFatte.righe === righe ? scelteFatte.ids : preselezione(righe)),
    [scelteFatte, righe],
  );
  const setScelte = (ids: Set<string>) => setScelteFatte({ righe, ids });

  const nomeConto = useMemo(() => new Map(accounts.map((a) => [a.id, a.nome])), [accounts]);
  const totaleScelte = sommaSelezionate(righe, scelte);
  const chiudibili = useMemo(() => righe.filter(chiudibile), [righe]);
  const tutte = chiudibili.length > 0 && chiudibili.every((r) => scelte.has(r.id));

  const cambiaScelta = (id: string, si: boolean) => {
    const n = new Set(scelte);
    if (si) n.add(id);
    else n.delete(id);
    setScelte(n);
  };

  async function chiudi() {
    if (inCorso || scelte.size === 0) return;
    setInCorso(true);
    try {
      const { data, error } = await db.rpc("tesoreria_chiudi_spese_bancarie", { p_company: companyId, p_movimenti: [...scelte] });
      if (error) throw error;
      const r = data as EsitoChiusura;
      setEsito(r);
      toast.success(t("{n} spese bancarie chiuse ({totale})", { n: String(r.chiusi.length), totale: money(r.totale) }));
      onFatto();
      void elenco.refetch();
    } catch (e) {
      toast.error(messaggioErrore(e, t("Le spese non sono state chiuse: nessun movimento è cambiato.")));
      void elenco.refetch();
    } finally {
      setInCorso(false);
    }
  }

  async function annulla() {
    if (inCorso || !esito?.chiusi.length) return;
    setInCorso(true);
    try {
      const { data, error } = await db.rpc("tesoreria_riapri_spese_bancarie", { p_company: companyId, p_movimenti: esito.chiusi });
      if (error) throw error;
      toast.success(t("{n} movimenti riaperti: costi e prima nota tolti", { n: String((data as { riaperti: number }).riaperti) }));
      setEsito(null);
      onFatto();
      void elenco.refetch();
    } catch (e) {
      toast.error(messaggioErrore(e, t("Annullamento non riuscito: nessun movimento è cambiato.")));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!inCorso) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Chiudi le spese bancarie")}</DialogTitle>
          <DialogDescription>
            {t("Commissioni, canoni e bolli senza fattura. Ognuna diventa un costo «spese bancarie» già pagato da quel movimento, con la sua prima nota. Tutto o niente: si può annullare.")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <UniformSelect
              aria-label={t("Filtra per conto")}
              value={conto}
              onChange={(e) => setConto(e.target.value)}
              className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value={TUTTI}>{t("Tutti i conti")}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </UniformSelect>
            <label className="text-xs text-muted-foreground">
              {t("Dal")}
              <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} className="h-9 w-40" />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("Al")}
              <Input type="date" value={al} onChange={(e) => setAl(e.target.value)} className="h-9 w-40" />
            </label>
          </div>

          {esito && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
              <span>
                {t("Chiuse {n} spese per {totale}.", { n: String(esito.chiusi.length), totale: money(esito.totale) })}
                {esito.lasciati_prima_nota.length > 0 &&
                  ` ${t("{n} lasciate aperte perché già nella prima nota.", { n: String(esito.lasciati_prima_nota.length) })}`}
              </span>
              <Button size="sm" variant="outline" onClick={() => void annulla()} disabled={inCorso}>{t("Annulla questo lotto")}</Button>
            </div>
          )}

          {elenco.isLoading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Cerco le spese bancarie aperte…")}</p>
          ) : elenco.isError ? (
            <p role="alert" className="text-sm text-destructive">{messaggioErrore(elenco.error, t("Elenco non disponibile"))}</p>
          ) : righe.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nessuna spesa bancaria aperta con questi filtri.")}</p>
          ) : (
            <>
              <p className="text-sm">
                {t("{n} spese aperte per {totale}.", { n: String(elenco.data!.numero), totale: money(elenco.data!.totale) })}
                {elenco.data!.da_controllare > 0 && ` ${t("{n} da controllare non sono selezionate.", { n: String(elenco.data!.da_controllare) })}`}
                {elenco.data!.troppi && ` ${t("Ne mostro le prime 200: chiuse queste, riapri l'elenco.")}`}
              </p>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2">
                        <Checkbox aria-label={t("Seleziona tutte")} checked={tutte} onCheckedChange={(v) => setScelte(v ? new Set(chiudibili.map((r) => r.id)) : new Set())} />
                      </th>
                      <th className="p-2">{t("Data")}</th>
                      <th className="p-2">{t("Causale")}</th>
                      <th className="p-2">{t("Conto")}</th>
                      <th className="p-2 text-right">{t("Importo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">
                          <Checkbox aria-label={t("Chiudi la spesa del {data}", { data: formatDateIt(r.data) })} checked={scelte.has(r.id)} disabled={!chiudibile(r)} onCheckedChange={(v) => cambiaScelta(r.id, v === true)} />
                        </td>
                        <td className="whitespace-nowrap p-2">{formatDateIt(r.data)}</td>
                        <td className="p-2">
                          <span className="line-clamp-2" title={r.descrizione}>{r.descrizione || "—"}</span>
                          {r.da_controllare && (
                            <Badge variant="outline" className="mt-1 border-amber-200 bg-amber-50 text-amber-700">
                              {r.motivo_controllo === "bonifico" ? t("Da controllare: sembra un bonifico") : t("Da controllare: sopra {soglia}", { soglia: money(elenco.data!.soglia) })}
                            </Badge>
                          )}
                          {r.gia_in_prima_nota && <Badge variant="outline" className="ml-1 mt-1">{t("Già nella prima nota: collegala dal dettaglio del movimento")}</Badge>}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{(r.conto_id && nomeConto.get(r.conto_id)) || "—"}</td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{money(r.importo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={inCorso}>{t("Fine")}</Button>
          <Button onClick={() => void chiudi()} disabled={inCorso || scelte.size === 0}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("Registra {n} spese ({totale})", { n: String(scelte.size), totale: money(totaleScelte) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
