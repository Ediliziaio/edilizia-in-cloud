import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { chiaveQueryCassa, invocaCassa } from "@/lib/cassaInCloud";
import type { CollegamentoCassa } from "../../../../shared/cassaInCloud";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const entita = [
  { id: "RECEIPT", nome: "Scontrini" },
  { id: "RECONCILIATION", nome: "Chiusure di cassa" },
  { id: "INVOICE", nome: "Fatture" },
];

export function CassaInCloudAuto({ companyId, punto, onClose }: { companyId: string; punto: CollegamentoCassa; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [segreti, setSegreti] = useState<Record<string, string>>({});
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const id = punto.punto_vendita_id;
  const config = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "webhook", id],
    queryFn: ({ signal }) => invocaCassa<{ url: string; entita: string[] }>(companyId, "configurazione_webhook", { punto_vendita_id: id }, signal),
  });

  async function salva(action: "sincronizzazione" | "imposta_webhook", args: Record<string, string>) {
    if (occupato) return;
    setOccupato(true);
    setErrore(null);
    try {
      await invocaCassa(companyId, action, { ...args, punto_vendita_id: id });
      setSegreti((current) => ({ ...current, ...(args.entita && { [args.entita]: "" }) }));
      await qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Salvataggio non riuscito."));
    } finally {
      setOccupato(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto && !occupato) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Sincronizzazione · {nome}", { nome: String(punto.nome ?? "") })}</DialogTitle>
          <DialogDescription>{t("Aggiorna gli scontrini e le chiusure di questo punto vendita. La chiave API deve poter leggere entrambi.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="auto-cassa">{t("Sincronizzazione automatica")}</Label>
            <Switch id="auto-cassa" checked={!!punto.sync_attivo} disabled={occupato}
              onCheckedChange={(attiva) => void salva("sincronizzazione", { attiva: String(attiva) })} />
          </div>
          {punto.errore_sync && <p role="alert" className="text-sm text-destructive">{punto.errore_sync}</p>}
          <details className="space-y-3 rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("Notifiche dal punto vendita (webhook)")}</summary>
            <p className="text-sm text-muted-foreground">
              {t("Nel portale Cassa in Cloud puoi inviare notifiche per scontrini, chiusure di cassa e fatture di questo punto vendita. Usa lo stesso indirizzo per i webhook e abilita creazione, modifica ed eliminazione.")}
              {" "}<a className="underline" href="https://cassaincloud.zendesk.com/hc/it/articles/13263957698717" target="_blank" rel="noreferrer">{t("Guida Cassa in Cloud")}</a>
            </p>
            {config.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Caricamento indirizzo…")}</p>}
            {config.isError && <p role="alert" className="text-sm text-destructive">{t("Indirizzo non disponibile.")} <button onClick={() => void config.refetch()} className="underline">{t("Riprova")}</button></p>}
            {config.data && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cassa-url-webhook">{t("Indirizzo da copiare")}</Label>
                  <Input id="cassa-url-webhook" readOnly value={config.data.url} onFocus={(e) => e.target.select()} />
                </div>
                {entita.map((e) => {
                  const configurato = config.data.entita.includes(e.id);
                  return (
                    <div key={e.id} className="space-y-1">
                      <Label htmlFor={`cassa-segreto-${e.id}`}>{t("Segreto webhook · {nome}", { nome: t(e.nome) })}</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input id={`cassa-segreto-${e.id}`} className="min-w-40 flex-1" type="password" autoComplete="new-password"
                          placeholder={configurato ? t("Segreto salvato") : undefined} maxLength={512} value={segreti[e.id] ?? ""}
                          disabled={occupato} onChange={(ev) => setSegreti((s) => ({ ...s, [e.id]: ev.target.value }))} />
                        <Button type="button" size="sm" disabled={occupato || !segreti[e.id]?.trim()}
                          onClick={() => void salva("imposta_webhook", { entita: e.id, segreto: segreti[e.id] })}>{t("Salva")}</Button>
                        {configurato && <Button type="button" variant="ghost" size="sm" disabled={occupato}
                          onClick={() => void salva("imposta_webhook", { entita: e.id, rimuovi: "true" })}>{t("Rimuovi")}</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </details>
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
