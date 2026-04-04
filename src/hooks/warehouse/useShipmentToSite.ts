import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ShipmentItem {
  order_item_id: string;
  goods_receipt_id: string;
  qty_shipped: number;
}

export interface CreateShipmentInput {
  order_id: string;
  items: ShipmentItem[];
  shipment_ddt_number: string;
  destination_warehouse_id?: string;
  loading_photo: File;
  shipment_ddt_photo?: File;
}

export function useShipmentToSite() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const { mutateAsync: createShipment, isPending: isCreating } = useMutation({
    mutationFn: async (input: CreateShipmentInput) => {
      if (!effectiveCompany?.id) throw new Error('No company selected');

      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('Not authenticated');

      if (!input.loading_photo) throw new Error('Loading photo is required');

      let loading_photo_url: string | null = null;
      let shipment_ddt_photo_url: string | null = null;

      // Upload loading photo (MANDATORY)
      try {
        setUploadProgress(10);
        const fileName = `${Date.now()}_loading_${input.loading_photo.name}`;
        const filePath = `${effectiveCompany.id}/${input.order_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('shipments_to_site')
          .upload(filePath, input.loading_photo, { upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('shipments_to_site').getPublicUrl(filePath);
        loading_photo_url = data?.publicUrl;
        if (!loading_photo_url) throw new Error('No public URL for loading photo');

        setUploadProgress(40);
      } catch (error) {
        console.error('Loading photo error:', error);
        throw new Error('Errore nel caricamento foto carico');
      }

      // Upload DDT transport photo (OPTIONAL)
      if (input.shipment_ddt_photo) {
        try {
          const fileName = `${Date.now()}_ddt_${input.shipment_ddt_photo.name}`;
          const filePath = `${effectiveCompany.id}/${input.order_id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('shipments_to_site')
            .upload(filePath, input.shipment_ddt_photo, { upsert: false });

          if (uploadError) throw uploadError;

          const { data } = supabase.storage.from('shipments_to_site').getPublicUrl(filePath);
          shipment_ddt_photo_url = data?.publicUrl || null;

          setUploadProgress(60);
        } catch (error) {
          console.error('DDT photo error:', error);
          toast.error('Errore foto DDT trasporto (continuando senza)');
        }
      }

      // Create shipment
      setUploadProgress(80);
      const { data: shipment, error: insertError } = await supabase
        .from('shipments_to_site')
        .insert({
          order_id: input.order_id,
          company_id: effectiveCompany.id,
          transporter_id: user.data.user.id,
          destination_warehouse_id: input.destination_warehouse_id || null,
          items_json: input.items,
          shipment_ddt_number: input.shipment_ddt_number,
          loading_photo_url,
          shipment_ddt_photo_url,
          status: 'pending',
          departed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!shipment) throw new Error('No shipment returned');

      // Update order_items and add timeline events
      for (const item of input.items) {
        const { error: updateError } = await supabase
          .from('order_items')
          .update({
            shipment_id: shipment.id,
            fulfillment_status: 'shipped',
            last_shipment_date: new Date().toISOString(),
          })
          .eq('id', item.order_item_id);

        if (updateError) throw updateError;

        // Add timeline
        const { error: timelineError } = await supabase
          .from('order_item_timeline')
          .insert({
            order_item_id: item.order_item_id,
            company_id: effectiveCompany.id,
            event_type: 'shipped',
            event_by: user.data.user.id,
            photo_url: loading_photo_url,
            document_ref: shipment.id,
            notes: `Spedito verso cantiere - DDT: ${input.shipment_ddt_number}`,
            location: 'In transito',
          });

        if (timelineError) throw timelineError;
      }

      setUploadProgress(100);
      return shipment;
    },
    onSuccess: () => {
      toast.success('Spedizione registrata ✓');
      queryClient.invalidateQueries({ queryKey: ['warehouse', 'items'] });
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('useShipmentToSite error:', error);
      toast.error(`Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      setUploadProgress(0);
    },
  });

  return { createShipment, isCreating, uploadProgress };
}
