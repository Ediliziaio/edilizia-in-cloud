// Uffici di fatturazione di un cliente PA: elenco, aggiungi, modifica, predefinito,
// disattiva (lotto 2, 15/11/2026).

import { useState } from "react";
import { Landmark, Pencil, Plus, Star, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUfficiPa, messaggioErroreUfficio } from "@/hooks/useUfficiPa";
import { problemiUfficioPa, type UfficioPa, type UfficioPaForm } from "@/lib/clienti/ufficiPa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function UfficiPaCard({
  anagraficaId,
  puoModificare,
  compatta = false,
}: {
  anagraficaId: string;
  puoModificare: boolean;
  /** Nella colonna stretta della scheda cliente: pulsanti a icona, meno margini. */
  compatta?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const { tutti, isLoading, aggiungi, modifica, rendiPredefinito, disattiva } = useUfficiPa(anagraficaId);
  const [aperto, setAperto] = useState<{ ufficio: UfficioPa | null } | null>(null);

  const esegui = async (azione: () => Promise<unknown>, ok: string) => {
    try {
      await azione();
      toast({ title: ok });
    } catch (e) {
      toast({ title: t("Non salvato"), description: messaggioErroreUfficio(e), variant: "destructive" });
    }
  };

  return (
    <Card className={compatta ? "shadow-none" : undefined}>
      <CardHeader className={`flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 ${compatta ? "p-2 pb-1" : "pb-3"}`}>
        <CardTitle className={`flex items-center gap-2 ${compatta ? "text-xs" : "text-sm"}`}>
          <Landmark className="h-4 w-4" /> {compatta ? t("Uffici PA") : t("Uffici di fatturazione (PA)")}
        </CardTitle>
        {puoModificare && (
          <Button size="sm" variant="outline" className={compatta ? "h-7 px-2 text-xs" : undefined} onClick={() => setAperto({ ufficio: null })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {compatta ? t("Aggiungi") : t("Aggiungi ufficio")}
          </Button>
        )}
      </CardHeader>
      <CardContent className={`space-y-2 ${compatta ? "p-2 pt-0 text-xs" : "text-sm"}`}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {!isLoading && tutti.length === 0 && (
          <p className="text-muted-foreground">
            {t("Nessun ufficio. Senza il codice univoco ufficio la fattura elettronica alla PA non parte.")}
          </p>
        )}
        {tutti.map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border ${compatta ? "px-2 py-1.5" : "px-3 py-2"} ${u.attivo ? "" : "opacity-60"}`}>
            <span className="font-mono font-medium">{u.codice_univoco_ufficio}</span>
            <span className="flex-1 min-w-0 truncate">{u.descrizione || "—"}</span>
            {u.predefinito && <Badge>{t("Predefinito")}</Badge>}
            {!u.attivo && <Badge variant="secondary">{t("Disattivato")}</Badge>}
            {puoModificare && (
              <div className="flex gap-1">
                {u.attivo && !u.predefinito && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={compatta ? "h-7 px-2" : undefined}
                    aria-label={t("Rendi predefinito")}
                    title={t("Rendi predefinito")}
                    onClick={() => esegui(() => rendiPredefinito.mutateAsync(u.id), t("Ufficio predefinito cambiato"))}
                  >
                    <Star className="h-3.5 w-3.5" />
                    {!compatta && <span className="ml-1">{t("Predefinito")}</span>}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className={compatta ? "h-7 px-2" : undefined} aria-label={t("Modifica ufficio")} onClick={() => setAperto({ ufficio: u })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={compatta ? "h-7 px-2 text-xs" : undefined}
                  onClick={() =>
                    esegui(
                      () => disattiva.mutateAsync({ id: u.id, attivo: !u.attivo }),
                      u.attivo ? t("Ufficio disattivato") : t("Ufficio riattivato"),
                    )
                  }
                >
                  {u.attivo ? t("Disattiva") : t("Riattiva")}
                </Button>
              </div>
            )}
          </div>
        ))}
        {tutti.length > 0 && !tutti.some((u) => u.predefinito) && (
          <p className="text-xs text-amber-700">{t("Nessun ufficio predefinito: la fattura non saprà a quale ufficio andare.")}</p>
        )}
      </CardContent>

      {aperto && (
        <DialogUfficio
          ufficio={aperto.ufficio}
          altri={tutti}
          onClose={() => setAperto(null)}
          onSalva={async (f) => {
            if (aperto.ufficio) await modifica.mutateAsync({ id: aperto.ufficio.id, ...f });
            else await aggiungi.mutateAsync(f);
          }}
        />
      )}
    </Card>
  );
}

function DialogUfficio({
  ufficio,
  altri,
  onClose,
  onSalva,
}: {
  ufficio: UfficioPa | null;
  altri: UfficioPa[];
  onClose: () => void;
  onSalva: (f: UfficioPaForm) => Promise<void>;
}) {
  const t = useT();
  const { toast } = useToast();
  const [f, setF] = useState<UfficioPaForm>({
    descrizione: ufficio?.descrizione ?? "",
    codice: ufficio?.codice_univoco_ufficio ?? "",
    note: ufficio?.note ?? "",
  });
  const [provato, setProvato] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const errori = problemiUfficioPa(f, altri, ufficio?.id);

  const salva = async () => {
    setProvato(true);
    if (Object.keys(errori).length) return;
    setSalvo(true);
    try {
      await onSalva(f);
      toast({ title: ufficio ? t("Ufficio aggiornato") : t("Ufficio aggiunto") });
      onClose();
    } catch (e) {
      toast({ title: t("Non salvato"), description: messaggioErroreUfficio(e), variant: "destructive" });
    } finally {
      setSalvo(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ufficio ? t("Modifica ufficio") : t("Nuovo ufficio")}</DialogTitle>
          <DialogDescription>{t("Il codice univoco ufficio è sull'ordine dell'ente o su indicepa.gov.it.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="uff-codice">{t("Codice univoco ufficio *")}</Label>
            <Input
              id="uff-codice"
              className="font-mono uppercase"
              maxLength={6}
              value={f.codice}
              onChange={(e) => setF({ ...f, codice: e.target.value.toUpperCase() })}
              aria-invalid={provato && !!errori.codice}
            />
            {provato && errori.codice && <p className="text-xs text-destructive">{errori.codice}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uff-descr">{t("Nome dell'ufficio *")}</Label>
            <Input id="uff-descr" value={f.descrizione} placeholder={t("Lavori pubblici")} onChange={(e) => setF({ ...f, descrizione: e.target.value })} />
            {provato && errori.descrizione && <p className="text-xs text-destructive">{errori.descrizione}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uff-note">{t("Note")}</Label>
            <Input id="uff-note" value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Annulla")}</Button>
          <Button onClick={salva} disabled={salvo}>
            {salvo && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} {t("Salva")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
