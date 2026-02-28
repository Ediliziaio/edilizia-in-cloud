import { useState, useRef } from "react";
import { Upload, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/types/auth";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";

interface LogoUploaderProps {
  company: Company | null;
  onLogoUpdated: () => Promise<void>;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function LogoUploader({ company, onLogoUpdated }: LogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato non supportato", { description: "Seleziona un'immagine PNG, JPG o WEBP" });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File troppo grande", { description: "La dimensione massima è 2MB" });
      return;
    }

    setIsUploading(true);

    try {
      // Get file extension
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${company.id}/logo.${ext}`;

      // Delete existing logo files first (to handle extension changes)
      const { data: existingFiles } = await supabase.storage
        .from('company-logos')
        .list(company.id);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(f => `${company.id}/${f.name}`);
        await supabase.storage.from('company-logos').remove(filesToDelete);
      }

      // Upload new logo
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
      const { error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: logoUrl })
        .eq('id', company.id);

      if (updateError) throw updateError;

      toast.success("Logo caricato", { description: "Il logo aziendale è stato aggiornato" });

      await onLogoUpdated();
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error("Errore", { description: "Impossibile caricare il logo. Riprova." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!company) return;

    setIsRemoving(true);

    try {
      // List and delete all files in company folder
      const { data: existingFiles } = await supabase.storage
        .from('company-logos')
        .list(company.id);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(f => `${company.id}/${f.name}`);
        await supabase.storage.from('company-logos').remove(filesToDelete);
      }

      // Update company record to remove logo_url
      const { error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: null })
        .eq('id', company.id);

      if (updateError) throw updateError;

      toast.success("Logo rimosso", { description: "Il logo aziendale è stato rimosso" });

      await onLogoUpdated();
    } catch (error) {
      console.error('Error removing logo:', error);
      toast.error("Errore", { description: "Impossibile rimuovere il logo. Riprova." });
    } finally {
      setIsRemoving(false);
    }
  };

  const currentLogo = company?.logo_url;

  return (
    <div className="space-y-4">
      <Label>Logo Aziendale</Label>
      
      <div className="flex items-start gap-6">
        {/* Logo Preview */}
        <div className="flex-shrink-0">
          <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt={company?.name || "Logo aziendale"}
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
              disabled={isUploading || isRemoving}
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
                  {currentLogo ? "Cambia Logo" : "Carica Logo"}
                </>
              )}
            </Button>

            {currentLogo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || isRemoving}
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
            Formati supportati: PNG, JPG, WEBP. Dimensione massima: 2MB.
          </p>

          {!currentLogo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Fallback attuale:</span>
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
      />
    </div>
  );
}
