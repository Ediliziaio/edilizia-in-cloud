import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTecniciAzienda } from "@/hooks/useTecniciAzienda";
import { ETICHETTA_GRUPPO, gruppiTecnici } from "@/lib/sopralluoghi/sceltaTecnico";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { pianificaSopralluogo } from "@/lib/api/surveysBoard";
import type { SopralluogoBacheca } from "@/lib/sopralluoghi/bacheca";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const SENZA_TECNICO = "__nessuno__";
const DURATE = [30, 45, 60, 90, 120, 180];

const dataLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const oraLocale = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Fissa data, ora e tecnico di un sopralluogo e mette l'appuntamento nel calendario del
 * tecnico (da dove arriva su Google/Apple). Se il sopralluogo ha già un appuntamento, lo sposta.
 */
export function PianificaSopralluogoDialog({
  sopralluogo, onClose,
}: { sopralluogo: SopralluogoBacheca | null; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const { data: staff = [] } = useCompanyStaffUsers(sopralluogo ? companyId : null);
  const tecnici = useTecniciAzienda(companyId, !!sopralluogo);
  const google = useGoogleCalendarSync();
  const apple = useAppleCalendarSync();

  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [durata, setDurata] = useState("60");
  const [tecnico, setTecnico] = useState(SENZA_TECNICO);
  const [appOperai, setAppOperai] = useState(true);
  // Stessa regola del database (survey_private.field_actor): l'app operai è per questi ruoli.
  const persona = staff.find((u) => u.id === tecnico);
  const eOperaio = !!persona?.roles?.some((r) => r === "employee" || r === "subcontractor");

  useEffect(() => {
    if (!sopralluogo) return;
    const prevista = sopralluogo.scheduled_at ? new Date(sopralluogo.scheduled_at) : null;
    setData(prevista ? dataLocale(prevista) : dataLocale(new Date()));
    setOra(prevista ? oraLocale(prevista) : "09:00");
    setDurata("60");
    setTecnico(sopralluogo.technician_id ?? user?.id ?? SENZA_TECNICO);
    setAppOperai(true);
  }, [sopralluogo, user?.id]);

  const salva = useMutation({
    mutationFn: async () => {
      if (!sopralluogo || !companyId || !user) throw new Error(t("Dati mancanti"));
      const esito = await pianificaSopralluogo({
        surveyId: sopralluogo.id, companyId, data, ora, durataMin: Number(durata),
        tecnicoId: tecnico === SENZA_TECNICO ? null : tecnico, userId: user.id,
        appOperai: eOperaio && appOperai,
      });
      // Su Google e Apple: un errore qui non annulla la pianificazione (l'appuntamento c'è già).
      const sync: Promise<unknown>[] = [];
      if (esito.spostato) {
        if (google.hasAnyCompanyGoogleConnection) sync.push(google.updateEvent(esito.appointmentId));
        if (apple.hasAppleConnection) sync.push(apple.updateEvent(esito.appointmentId));
      } else {
        if (google.hasAnyCompanyGoogleConnection) sync.push(google.pushEvent(esito.appointmentId));
        if (apple.isAppleConnected) sync.push(apple.pushEvent(esito.appointmentId));
      }
      if (sync.length > 0) await Promise.allSettled(sync);
      return esito;
    },
    onSuccess: (esito) => {
      toast.success(esito.spostato ? t("Sopralluogo spostato in calendario") : t("Sopralluogo pianificato: è nel calendario"), {
        description: esito.appOperai ? t("Il tecnico lo apre e lo compila dall'app.") : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["survey-assignees", sopralluogo?.id] });
      queryClient.invalidateQueries({ queryKey: ["order-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["sopralluoghi-bacheca"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(t("Non pianificato"), { description: e.message }),
  });

  const valido = /^\d{4}-\d{2}-\d{2}$/.test(data) && /^\d{2}:\d{2}$/.test(ora);

  return (
    <Dialog open={!!sopralluogo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-orange-600" />
            {sopralluogo?.appointment_id ? t("Sposta il sopralluogo") : t("Pianifica il sopralluogo")}
          </DialogTitle>
          <DialogDescription>
            {sopralluogo?.code}{sopralluogo?.cliente_nome ? ` · ${sopralluogo.cliente_nome}` : ""}
            {sopralluogo?.address ? ` · ${[sopralluogo.address, sopralluogo.city].filter(Boolean).join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="sop-data">{t("Giorno")}</Label>
              <Input id="sop-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sop-ora">{t("Ora")}</Label>
              <Input id="sop-ora" type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("Durata")}</Label>
              <Select value={durata} onValueChange={setDurata}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATE.map((m) => <SelectItem key={m} value={String(m)}>{m < 60 ? t("{n} minuti", { n: m }) : m === 60 ? t("1 ora") : t("{n} ore", { n: m / 60 })}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("Tecnico")}</Label>
              <Select value={tecnico} onValueChange={setTecnico}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SENZA_TECNICO}>{t("Nessuno")}</SelectItem>
                  {gruppiTecnici(staff, tecnici).map((g) => (
                    <SelectGroup key={g.gruppo}>
                      <SelectLabel>{t(ETICHETTA_GRUPPO[g.gruppo])}</SelectLabel>
                      {g.persone.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || t("Utente")}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {eOperaio && (
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={appOperai} onChange={(e) => setAppOperai(e.target.checked)} />
              {t("Può aprirlo e compilarlo dall'app operai")}
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {t("L'appuntamento va nel calendario del tecnico e, se ha Google o Apple collegati, anche lì, con nome, telefono e indirizzo del cliente.")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salva.isPending}>{t("Annulla")}</Button>
          <Button onClick={() => salva.mutate()} disabled={!valido || salva.isPending} className="bg-orange-600 hover:bg-orange-700">
            {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {sopralluogo?.appointment_id ? t("Sposta") : t("Pianifica")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
