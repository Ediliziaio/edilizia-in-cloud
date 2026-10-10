import { useState, useRef } from "react";
import { Upload, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";
import type { Company } from "@/types/auth";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

interface LogoUploaderProps {
  company: Company | null;
  onLogoUpdated: (logoUrl?: string | null) => Promise<void> | void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const NON_PUO_MODIFICARE = "Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore.";

/**
 * Il logo dell'azienda (Profilo aziendale e White-Label).
 *
 * 09/10/2026: il salvataggio sul database non controllava l'esito. Se la regola di accesso non lasciava toccare la
 * riga (chi ha il permesso «Profilo aziendale» ma non quello generale delle impostazioni) l'aggiornamento non
 * cambiava niente e la pagina diceva «Logo caricato». Ora si controlla, e i file vecchi si cancellano solo DOPO
 * che il database ha accettato il nuovo indirizzo: prima si cancellavano per primi, e un rifiuto lasciava
 * un logo che puntava a un file che non c'era più.
 */
export function LogoUploader({ company, onLogoUpdated, disabled = false }: LogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  /** Cancella i file del logo di questa azienda, tranne (se c'è) quello da tenere. */
  const cancellaFileVecchi = async (companyId: string, daTenere?: string) => {
    const { data: esistenti } = await supabase.storage.from("company-logos").list(companyId);
    const daCancellare = (esistenti ?? []).map((f) => `${companyId}/${f.name}`).filter((percorso) => percorso !== daTenere);
    if (daCancellare.length > 0) await supabase.storage.from("company-logos").remove(daCancellare);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company || disabled) return;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato non supportato", { description: "Scegli un'immagine PNG, JPG o WEBP." });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File troppo grande", { description: "Il logo può pesare al massimo 2 MB." });
      return;
    }

    setIsUploading(true);

    try {
      // Get file extension
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${company.id}/logo.${ext}`;

      // Upload new logo (se c'era già un file con lo stesso nome lo sostituisce)
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      // Add cache-busting timestamp
      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update company record
      const { data: aggiornate, error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: logoUrl })
        .eq('id', company.id)
        .select('id');

      if (updateError) throw updateError;
      if (righeToccate(aggiornate) === 0) throw new MessaggioPerUtente(NON_PUO_MODIFICARE);

      // Il database ha accettato: ora si possono togliere i logo con un'altra estensione.
      try { await cancellaFileVecchi(company.id, filePath); } catch (erroreCoda) { logger.warn("Pulizia dei vecchi logo non riuscita:", erroreCoda); }

      toast.success("Logo caricato", { description: "Il logo dell'azienda è stato aggiornato." });

      await onLogoUpdated(logoUrl);
    } catch (error) {
      logger.error("Error uploading logo:", error);
      toast.error("Logo non caricato", { description: motivoDelRifiuto(error, "Riprova tra poco.") });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!company || disabled) return;

    const ok = await confirm({
      title: "Rimuovere il logo dell'azienda?",
      description: "Il logo verrà eliminato. Potrai caricarne uno nuovo quando vuoi.",
      confirmLabel: "Rimuovi logo",
      variant: "destructive",
    });
    if (!ok) return;

    setIsRemoving(true);

    try {
      // Prima il database: se rifiuta, i file restano dove sono e il logo continua a funzionare.
      const { data: aggiornate, error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: null })
        .eq('id', company.id)
        .select('id');

      if (updateError) throw updateError;
      if (righeToccate(aggiornate) === 0) throw new MessaggioPerUtente(NON_PUO_MODIFICARE);

      try { await cancellaFileVecchi(company.id); } catch (erroreCoda) { logger.warn("Pulizia dei file del logo non riuscita:", erroreCoda); }

      toast.success("Logo rimosso", { description: "Il logo dell'azienda è stato rimosso." });

      await onLogoUpdated(null);
    } catch (error) {
      logger.error("Error removing logo:", error);
      toast.error("Logo non rimosso", { description: motivoDelRifiuto(error, "Riprova tra poco.") });
    } finally {
      setIsRemoving(false);
    }
  };

  const currentLogo = company?.logo_url;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6 max-sm:gap-4">
        {/* Logo Preview */}
        <div className="flex-shrink-0">
          <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt={company?.name || "Logo dell'azienda"}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">Nessun logo</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload Controls */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading || isRemoving || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {currentLogo ? "Cambia logo" : "Carica logo"}
                </>
              )}
            </Button>

            {currentLogo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || isRemoving || disabled}
                onClick={handleRemoveLogo}
                className="text-destructive hover:text-destructive"
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rimozione...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Rimuovi
                  </>
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            PNG, JPG o WEBP, fino a 2 MB.
          </p>

          {!currentLogo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Finché non carichi il tuo, si usa questo:</span>
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-5" />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Scegli il file del logo"
      />
    </div>
  );
}
