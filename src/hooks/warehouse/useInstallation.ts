import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RecordInstallationInput {
  order_item_id: string;
  site_delivery_id?: string;
  installation_location?: string;
  photo_before: File;
  photo_after: File;
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

      if (!input.photo_before) throw new Error('Photo before is required');
      if (!input.photo_after) throw new Error('Photo after is required');

      // Get order_id from order_item
      const { data: orderItem, error: fetchError } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('id', input.order_item_id)
        .single();

      if (fetchError || !orderItem) throw new Error('Order item not found');

      let photo_before_url: string | null = null;
      let photo_after_url: string | null = null;

      // Upload before photo (MANDATORY)
      try {
        setUploadProgress(10);
        const fileName = `${Date.now()}_before_${input.photo_before.name}`;
        const filePath = `${effectiveCompany.id}/${orderItem.order_id}/before/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('installations')
          .upload(filePath, input.photo_before, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('installations').getPublicUrl(filePath);
        photo_before_url = data?.publicUrl;
        if (!photo_before_url) throw new Error('No URL for before photo');

        setUploadProgress(40);
      } catch (error) {
        console.error('Before photo error:', error);
        throw new Error('Errore nel caricamento foto prima', { cause: error });
      }

      // Upload after photo (MANDATORY)
      try {
        const fileName = `${Date.now()}_after_${input.photo_after.name}`;
        const filePath = `${effectiveCompany.id}/${orderItem.order_id}/after/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('installations')
          .upload(filePath, input.photo_after, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('installations').getPublicUrl(filePath);
        photo_after_url = data?.publicUrl;
        if (!photo_after_url) throw new Error('No URL for after photo');

        setUploadProgress(70);
      } catch (error) {
        console.error('After photo error:', error);
        throw new Error('Errore nel caricamento foto dopo', { cause: error });
      }

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
          photo_url: photo_after_url,
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
