import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CreateGoodsReceiptInput {
  order_item_id: string;
  /** ID del magazzino di destinazione. Obbligatorio post-migration Magazzino V2. */
  warehouse_id: string;
  /** Opzionale: lega questa ricezione a una testata DDT già esistente. */
  ddt_ricezione_id?: string;
  supplier_id?: string;
  quantity_received: number;
  ddt_number?: string;
  ddt_photo?: File;
  quality_check_status: 'ok' | 'damaged' | 'partial' | 'pending';
  quality_notes?: string;
  notes?: string;
}

export function useGoodsReceipt() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const { mutateAsync: createGoodsReceipt, isPending: isCreating } = useMutation({
    mutationFn: async (input: CreateGoodsReceiptInput) => {
      if (!effectiveCompany?.id) throw new Error('No company selected');

      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('Not authenticated');

      let ddt_photo_url: string | null = null;

      // Upload DDT photo if provided (OPTIONAL)
      if (input.ddt_photo) {
        try {
          setUploadProgress(10);
          const fileName = `${Date.now()}_${input.ddt_photo.name}`;
          const filePath = `${effectiveCompany.id}/${input.order_item_id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('goods_receipts')
            .upload(filePath, input.ddt_photo, { upsert: false });

          if (uploadError) throw uploadError;

          setUploadProgress(50);

          const { data } = supabase.storage.from('goods_receipts').getPublicUrl(filePath);
          ddt_photo_url = data?.publicUrl || null;
          setUploadProgress(90);
        } catch (error) {
          console.error('DDT photo upload error:', error);
          toast.error('Errore nel caricamento foto DDT (continuando senza)');
        }
      }

      // Create goods receipt
      setUploadProgress(95);
      const receiptPayload = {
        order_item_id: input.order_item_id,
        warehouse_id: input.warehouse_id,
        company_id: effectiveCompany.id,
        supplier_id: input.supplier_id || null,
        quantity_received: input.quantity_received,
        ddt_number: input.ddt_number || null,
        ddt_photo_url,
        quality_check_status: input.quality_check_status,
        quality_notes: input.quality_notes || null,
        notes: input.notes || null,
        received_by: user.data.user.id,
        ...(input.ddt_ricezione_id ? { ddt_ricezione_id: input.ddt_ricezione_id } : {}),
      };
      const { data: receipt, error: insertError } = await supabase
        .from('goods_receipts')
        .insert(receiptPayload)
        .select()
        .single();

      if (insertError) throw insertError;
      if (!receipt) throw new Error('No receipt returned');

      // Update order_item
      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          quantity_received: input.quantity_received,
          receipt_id: receipt.id,
          fulfillment_status: 'received',
          last_goods_receipt_date: new Date().toISOString(),
        })
        .eq('id', input.order_item_id);

      if (updateError) throw updateError;

      // Add timeline event
      const { error: timelineError } = await supabase
        .from('order_item_timeline')
        .insert({
          order_item_id: input.order_item_id,
          company_id: effectiveCompany.id,
          event_type: 'received',
          event_by: user.data.user.id,
          photo_url: ddt_photo_url,
          document_ref: receipt.id,
          notes: `Ricevuto ${input.quantity_received} pz - Qualità: ${input.quality_check_status}`,
          location: 'Magazzino',
        });

      if (timelineError) throw timelineError;

      setUploadProgress(100);
      return receipt;
    },
    onSuccess: () => {
      toast.success('Ricezione registrata ✓');
      queryClient.invalidateQueries({ queryKey: ['warehouse', 'items'] });
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('useGoodsReceipt error:', error);
      toast.error(`Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      setUploadProgress(0);
    },
  });

  return { createGoodsReceipt, isCreating, uploadProgress };
}
