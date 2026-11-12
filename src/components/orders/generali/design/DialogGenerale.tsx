import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { DialogContent } from '@/components/ui/dialog';

type Props=ComponentPropsWithoutRef<typeof DialogContent>;
/** Compatibilità delle schede esistenti: dimensioni e layout sono del Dialog condiviso. */
export const DialogContentGenerale=forwardRef<ElementRef<typeof DialogContent>,Props>(function DialogContentGenerale({ampiezza='modulo',...props},ref){
  return <DialogContent ref={ref} {...props} ampiezza={ampiezza} />;
});
