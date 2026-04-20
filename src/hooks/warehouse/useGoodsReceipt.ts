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

      // P2 FIX wave 4: usa RPC atomica insert_goods_receipt_atomic
      // per evitare che il receipt venga creato senza l'update su
      // order_items o senza il timeline event. PL/pgSQL garantisce
      // rollback se qualcosa fallisce.
      setUploadProgress(95);
      const { data: receiptId, error: rpcError } = await supabase.rpc(
        "insert_goods_receipt_atomic",
        {
          p_order_item_id: input.order_item_id,
          p_warehouse_id: input.warehouse_id,
          p_quantity_received: input.quantity_received,
          p_quality_check_status: input.quality_check_status,
          p_supplier_id: input.supplier_id || null,
          p_ddt_number: input.ddt_number || null,
          p_ddt_photo_url: ddt_photo_url,
          p_ddt_ricezione_id: input.ddt_ricezione_id || null,
          p_quality_notes: input.quality_notes || null,
          p_notes: input.notes || null,
        },
      );

      if (rpcError) throw rpcError;
      if (!receiptId) throw new Error("RPC insert_goods_receipt_atomic non ha restituito id");

      setUploadProgress(100);
      return { id: receiptId as string };
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
