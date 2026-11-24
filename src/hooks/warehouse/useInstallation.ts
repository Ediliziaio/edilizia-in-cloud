import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RecordInstallationInput {
  order_item_id: string;
  site_delivery_id?: string;
  installation_location?: string;
  /** Le foto non sono mai obbligatorie (founder, 24/11/2026): si caricano se ci sono. */
  photo_before?: File | null;
  photo_after?: File | null;
  notes?: string;
}

export function useInstallation() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const { mutateAsync: recordInstallation, isPending: isRecording } = useMutation({
    mutationFn: async (input: RecordInstallationInput) => {
      if (!effectiveCompany?.id) throw new Error('No company selected');

      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('Not authenticated');

      // Get order_id from order_item
      const { data: orderItem, error: fetchError } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('id', input.order_item_id)
        .single();

      if (fetchError || !orderItem) throw new Error('Order item not found');

      // Foto facoltative: si carica quella che c'è.
      const carica = async (file: File | null | undefined, quando: "before" | "after"): Promise<string | null> => {
        if (!file) return null;
        const filePath = `${effectiveCompany.id}/${orderItem.order_id}/${quando}/${Date.now()}_${quando}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('installations').upload(filePath, file, { upsert: false });
        if (uploadError) throw new Error(quando === "before" ? 'Errore nel caricamento foto prima' : 'Errore nel caricamento foto dopo', { cause: uploadError });
        return supabase.storage.from('installations').getPublicUrl(filePath).data?.publicUrl ?? null;
      };
      setUploadProgress(10);
      const photo_before_url = await carica(input.photo_before, "before");
      setUploadProgress(40);
      const photo_after_url = await carica(input.photo_after, "after");
      setUploadProgress(70);

      // Create installation record
      setUploadProgress(85);
      const { data: installation, error: insertError } = await supabase
        .from('installations')
        .insert({
          order_item_id: input.order_item_id,
          site_delivery_id: input.site_delivery_id || null,
          company_id: effectiveCompany.id,
          installer_id: user.data.user.id,
          installation_location: input.installation_location || null,
          photo_before_url,
          photo_after_url,
          completed_at: new Date().toISOString(),
          status: 'completed',
          notes: input.notes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!installation) throw new Error('No installation returned');

      // Update order_item status
      const { error: updateError } = await supabase
        .from('order_items')
        .update({ installation_id: installation.id, fulfillment_status: 'installed' })
        .eq('id', input.order_item_id);

      if (updateError) throw updateError;

      // Add timeline event
      const { error: timelineError } = await supabase
        .from('order_item_timeline')
        .insert({
          order_item_id: input.order_item_id,
          company_id: effectiveCompany.id,
          event_type: 'installation_completed',
          event_by: user.data.user.id,
          photo_url: photo_after_url ?? photo_before_url,
          document_ref: installation.id,
          notes: `Installato presso ${input.installation_location || 'cantiere'}`,
          location: 'Cantiere',
        });

      if (timelineError) throw timelineError;

      setUploadProgress(100);
      return installation;
    },
    onSuccess: () => {
      toast.success('Installazione registrata ✓');
      queryClient.invalidateQueries({ queryKey: ['warehouse', 'items'] });
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('useInstallation error:', error);
      toast.error(`Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      setUploadProgress(0);
    },
  });

  return { recordInstallation, isRecording, uploadProgress };
}
