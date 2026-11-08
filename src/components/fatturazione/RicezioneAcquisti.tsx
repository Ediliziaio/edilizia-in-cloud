import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FiscalDocument } from "@/lib/fatturazione/fiscalWorkspace";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Da dove viene la data di ricezione degli acquisti del periodo, e la
 * possibilità di dichiararla per le fatture importate senza data SDI.
 * La regola e i controlli stanno nel database (fiscalita_dichiara_ricezione).
 */
export function RicezioneAcquisti({
  company,
  acquisti,
}: {
  company: string;
  acquisti: FiscalDocument[];
}) {
  const qc = useQueryClient();
  const permessi = usePermissions();
  const puo = permessi.isAdmin && !permessi.solaLettura && !permessi.isLoading;
  const conti = useMemo(() => {
    const c = { sdi: 0, dichiarata: 0, presunta: 0, da_verificare: 0 };
    for (const d of acquisti) if (d.ricezione_origine) c[d.ricezione_origine]++;
    return c;
  }, [acquisti]);
  const senzaSdi = useMemo(
    () =>
      acquisti
        .filter((d) => d.ricezione_origine && d.ricezione_origine !== "sdi")
        .sort((a, b) =>
          (a.ricezione_origine === "da_verificare" ? 0 : 1) -
            (b.ricezione_origine === "da_verificare" ? 0 : 1) ||
          String(a.data_fattura).localeCompare(String(b.data_fattura)),
        ),
    [acquisti],
  );
  const [aperto, setAperto] = useState(false);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [data, setData] = useState("");
  const [invio, setInvio] = useState(false);

  if (!acquisti.length) return null;

  const apri = () => {
    setScelte(new Set(senzaSdi.filter((d) => d.ricezione_origine === "da_verificare").map((d) => d.id)));
    setData("");
    setAperto(true);
  };
  const conferma = async (valore: string | null) => {
    if (!scelte.size) return;
    setInvio(true);
    try {
      const { data: esito, error } = await supabase.rpc("fiscalita_dichiara_ricezione" as never, {
        p_company: company,
        p_ids: [...scelte],
        p_data: valore,
      } as never);
      if (error) throw error;
      const e = esito as { aggiornate: number; saltate: number };
      toast.success(
        `${e.aggiornate} ${e.aggiornate === 1 ? "fattura aggiornata" : "fatture aggiornate"}` +
          (e.saltate ? ` · ${e.saltate} saltate (data SDI o precedente alla fattura)` : "") +
          ". Il periodo IVA si ricalcola con la nuova data.",
      );
      setAperto(false);
      await qc.invalidateQueries({ queryKey: ["fiscal-purchases"] });
      await qc.invalidateQueries({ queryKey: ["fiscal-liquidazione"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        /chiuso/i.test(msg)
          ? "Il periodo fiscale è chiuso: va riaperto prima di cambiare la data."
          : /futuro|precedere|SDI/i.test(msg)
            ? msg
            : "Data non salvata. Riprova.",
      );
    } finally {
      setInvio(false);
    }
  };
  const tutte = scelte.size === senzaSdi.length && senzaSdi.length > 0;

  return (
    <div className="rounded-xl border bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Data di ricezione degli acquisti</p>
          <p className="text-muted-foreground">
            {conti.sdi} dallo SDI · {conti.dichiarata} dichiarate · {conti.presunta} presunte alla data della fattura
            {conti.da_verificare > 0 && (
              <strong className="text-amber-700"> · {conti.da_verificare} di fine dicembre da verificare</strong>
            )}
          </p>
          {conti.presunta + conti.da_verificare > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Le importate non hanno la data di consegna dello SDI. Se una è arrivata dopo il 15 del mese
              successivo, o una di fine dicembre a gennaio, dichiarane la data: l'IVA passa al periodo giusto.
            </p>
          )}
        </div>
        {senzaSdi.length > 0 && puo && (
          <Button variant="outline" onClick={apri}>
            Dichiara data di ricezione
          </Button>
        )}
      </div>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dichiara la data di ricezione</DialogTitle>
            <DialogDescription>
              Per le fatture senza data SDI. La dichiarazione resta firmata con il tuo nome; se poi arriva la
              data dello SDI, vince quella.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={tutte}
                onCheckedChange={(x) => setScelte(new Set(x ? senzaSdi.map((d) => d.id) : []))}
              />
              Seleziona tutte ({senzaSdi.length})
            </label>
            <ul className="max-h-72 space-y-1 overflow-auto rounded-lg border p-2">
              {senzaSdi.map((d) => (
                <li key={d.id}>
                  <label className="flex items-start gap-2 rounded p-1 hover:bg-slate-50">
                    <Checkbox
                      checked={scelte.has(d.id)}
                      onCheckedChange={(x) =>
                        setScelte((s) => {
                          const n = new Set(s);
                          if (x) n.add(d.id);
                          else n.delete(d.id);
                          return n;
                        })
                      }
                    />
                    <span>
                      {d.numero_fattura} · {d.cedente_ragione_sociale} · fattura del {fiscalDate(d.data_fattura)}
                      <span className="block text-xs text-muted-foreground">
                        {d.ricezione_origine === "dichiarata"
                          ? `Ricevuta il ${fiscalDate(d.ricezione_dichiarata_il)} (dichiarata)`
                          : d.ricezione_origine === "da_verificare"
                            ? "Fine dicembre: da verificare"
                            : "Presunta alla data della fattura"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="ricezione-data" className="text-sm font-medium">
                  Arrivata il
                </label>
                <Input id="ricezione-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <p className="flex-1 text-xs text-muted-foreground">
                Vale per le {scelte.size} selezionate. Quelle con data SDI o con data della fattura successiva
                vengono saltate.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              disabled={invio || !scelte.size}
              onClick={() => void conferma(null)}
            >
              Togli la data dichiarata
            </Button>
            <Button disabled={invio || !scelte.size || !data} onClick={() => void conferma(data)}>
              {invio ? "Salvataggio…" : "Conferma data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
