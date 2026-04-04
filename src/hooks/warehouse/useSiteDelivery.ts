import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ConfirmDeliveryInput {
  shipment_id: string;
  order_id: string;
  received_by_name: string;
  delivery_photo: File;
  signature_photo: File;
  quality_status: 'ok' | 'partial' | 'damaged';
  quantity_delivered: number;
  delivery_notes?: string;
}

export function useSiteDelivery() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const { mutateAsync: confirmDelivery, isPending: isConfirming } = useMutation({
    mutationFn: async (input: ConfirmDeliveryInput) => {
      if (!effectiveCompany?.id) throw new Error('No company selected');

      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('Not authenticated');

      if (!input.delivery_photo) throw new Error('Delivery photo is required');
      if (!input.signature_photo) throw new Error('Signature is required');

      let delivery_photo_url: string | null = null;
      let signature_photo_url: string | null = null;

      // Upload delivery photo (MANDATORY)
      try {
        setUploadProgress(10);
        const fileName = `${Date.now()}_delivery_${input.delivery_photo.name}`;
        const filePath = `${effectiveCompany.id}/${input.order_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('site_deliveries')
          .upload(filePath, input.delivery_photo, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('site_deliveries').getPublicUrl(filePath);
        delivery_photo_url = data?.publicUrl;
        if (!delivery_photo_url) throw new Error('No URL for delivery photo');

        setUploadProgress(40);
      } catch (error) {
        console.error('Delivery photo error:', error);
        throw new Error('Errore nel caricamento foto consegna');
      }

      // Upload signature (MANDATORY)
      try {
        const fileName = `${Date.now()}_signature_${input.signature_photo.name}`;
        const filePath = `${effectiveCompany.id}/${input.order_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('site_deliveries')
          .upload(filePath, input.signature_photo, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('site_deliveries').getPublicUrl(filePath);
        signature_photo_url = data?.publicUrl;
        if (!signature_photo_url) throw new Error('No URL for signature');

        setUploadProgress(70);
      } catch (error) {
        console.error('Signature error:', error);
        throw new Error('Errore nel caricamento firma');
      }

      // Create delivery record
      setUploadProgress(85);
      const { data: delivery, error: insertError } = await supabase
        .from('site_deliveries')
        .insert({
          shipment_id: input.shipment_id,
          order_id: input.order_id,
          company_id: effectiveCompany.id,
          received_by_name: input.received_by_name,
          received_by_user_id: user.data.user.id,
          delivery_photo_url,
          signature_photo_url,
          quality_status: input.quality_status,
          quantity_delivered: input.quantity_delivered,
          delivery_notes: input.delivery_notes || null,
          status: 'delivered',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!delivery) throw new Error('No delivery returned');

      // Update shipment status
      const { error: shipmentError } = await supabase
        .from('shipments_to_site')
        .update({ status: 'delivered', arrived_at: new Date().toISOString() })
        .eq('id', input.shipment_id);

      if (shipmentError) throw shipmentError;

      // Get and update order_items with this shipment
      const { data: orderItems, error: fetchError } = await supabase
        .from('order_items')
        .select('id')
        .eq('shipment_id', input.shipment_id);

      if (fetchError) throw fetchError;

      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          const { error: updateError } = await supabase
            .from('order_items')
            .update({ fulfillment_status: 'delivered' })
            .eq('id', item.id);

          if (updateError) throw updateError;

          // Add timeline event
          const { error: timelineError } = await supabase
            .from('order_item_timeline')
            .insert({
              order_item_id: item.id,
              company_id: effectiveCompany.id,
              event_type: 'delivered_site',
              event_by: user.data.user.id,
              photo_url: delivery_photo_url,
              document_ref: delivery.id,
              notes: `Consegnato a ${input.received_by_name} - Qualità: ${input.quality_status}`,
              location: 'Cantiere',
            });

          if (timelineError) throw timelineError;
        }
      }

      setUploadProgress(100);
      return delivery;
    },
    onSuccess: () => {
      toast.success('Consegna registrata ✓');
      queryClient.invalidateQueries({ queryKey: ['warehouse', 'items'] });
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('useSiteDelivery error:', error);
      toast.error(`Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      setUploadProgress(0);
    },
  });

  return { confirmDelivery, isConfirming, uploadProgress };
}
