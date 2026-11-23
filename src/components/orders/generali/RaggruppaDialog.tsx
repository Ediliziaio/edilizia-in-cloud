// src/components/orders/generali/RaggruppaDialog.tsx
// Dalla lista commesse: mettere commesse che esistono già dentro una generale nuova (piano, F8).
// Prima di creare si vede cosa entra, di quale cliente e per quale importo.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { messaggioGenerale, useRaggruppaCommesse, type MappaGenerali } from "@/hooks/useCommesseGenerali";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { controllaRaggruppo, type RigaRaggruppo } from "@/lib/orders/listaGenerali";

/** Come formattaEuro (senza decimali, «2.444 €»), ma nella lingua scelta. */
const formattaEuro = (n: number) =>
  new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" as unknown as boolean }).format(n);

interface Props {
  righe: RigaRaggruppo[];
  modelli: ModelloGenerale[];
  mappa: MappaGenerali;
  mostraImporti: boolean;
  onClose: () => void;
}

export function RaggruppaDialog({ righe, modelli, mappa, mostraImporti, onClose }: Props) {
  const navigate = useNavigate();
  const t = useT();
  const raggruppa = useRaggruppaCommesse();
  const c = controllaRaggruppo(righe, mappa);
  const [modello, setModello] = useState<ModelloGenerale | undefined>(modelli[0]);
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(c.clienteUnico);
  const [valoreTesto, setValoreTesto] = useState("");
  const def = modello ? DEFINIZIONI_MODELLI[modello] : null;
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  const puoCreare = !!modello && nome.trim().length > 0 && c.commesse.length > 0 && !valoreSbagliato && !raggruppa.isPending;

  const conferma = () => {
    if (!modello || !puoCreare) return;
    raggruppa.mutate({ nuova: { modello, nome: nome.trim(), clienteId, valore }, commesse: c.commesse }, {
      onSuccess: ({ id, collegate }) => {
        if (collegate) toast.success(c.commesse.length === 1 ? t("1 commessa raggruppata") : t("{n} commesse raggruppate", { n: c.commesse.length }));
        else toast.error(t("Commessa generale creata, ma le commesse non sono entrate: collegale dalla sua pagina."));
        onClose();
        navigate(`/azienda/ordini/${id}`);
      },
      onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
    });
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Raggruppa in una commessa generale")}</DialogTitle>
          <DialogDescription>
            {c.commesse.length === 1
              ? (mostraImporti
                ? t("1 commessa per {importo}. Restano commesse normali: cantiere, costi e fatture non cambiano.", { importo: formattaEuro(c.totale) })
                : t("1 commessa. Restano commesse normali: cantiere, costi e fatture non cambiano."))
              : (mostraImporti
                ? t("{n} commesse per {importo}. Restano commesse normali: cantiere, costi e fatture non cambiano.", { n: c.commesse.length, importo: formattaEuro(c.totale) })
                : t("{n} commesse. Restano commesse normali: cantiere, costi e fatture non cambiano.", { n: c.commesse.length }))}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
          {c.generaliEscluse > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {c.generaliEscluse === 1 ? t("Una delle scelte è già una generale: resta fuori.") : t("{n} delle scelte sono già generali: restano fuori.", { n: c.generaliEscluse })}
            </p>
          )}
          {c.giaInUnaGenerale > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {c.giaInUnaGenerale === 1 ? t("Una commessa è già in un'altra generale: verrà spostata qui.") : t("{n} commesse sono già in un'altra generale: verranno spostate qui.", { n: c.giaInUnaGenerale })}
            </p>
          )}
          {c.clientiDiversi && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("Le commesse hanno clienti diversi: scegli il cliente della generale, o lascialo vuoto.")}</p>
          )}
          {modelli.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="raggruppa-tipo">{t("Tipo")}</Label>
              <Select value={modello} onValueChange={(v) => setModello(v as ModelloGenerale)}>
                <SelectTrigger id="raggruppa-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelli.map((m) => <SelectItem key={m} value={m}>{t(DEFINIZIONI_MODELLI[m].nome)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="raggruppa-nome">{t("Nome")}</Label>
            <Input id="raggruppa-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raggruppa-cliente">{def ? t(def.cliente.etichetta) : t("Cliente")}</Label>
            <ScegliCliente id="raggruppa-cliente" valore={clienteId} onCambia={setClienteId} />
          </div>
          {mostraImporti && (
            <div className="space-y-1.5">
              <Label htmlFor="raggruppa-valore">{def ? t(def.valore.etichetta) : t("Valore")} {t("(facoltativo)")}</Label>
              <Input id="raggruppa-valore" inputMode="decimal" value={valoreTesto} onChange={(e) => setValoreTesto(e.target.value)} aria-invalid={valoreSbagliato} />
            </div>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>{t("Annulla")}</Button>
          <Button onClick={conferma} disabled={!puoCreare}>
            {raggruppa.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("Raggruppa")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
