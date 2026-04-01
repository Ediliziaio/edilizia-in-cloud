import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle } from 'lucide-react';

export default function DiventaPartner() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', partner_type: 'referrer',
    network_size: '', notes: '',
  });
  const [loading, setLoading]     = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.email) {
      toast.error('Nome ed email sono obbligatori');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('partner_applications').insert({
        name:         form.name,
        email:        form.email.toLowerCase(),
        phone:        form.phone || null,
        partner_type: form.partner_type,
        network_size: parseInt(form.network_size) || null,
        notes:        form.notes || null,
        status:       'pending',
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast.error('Errore invio', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className='text-center space-y-4 max-w-md'>
        <CheckCircle className='h-16 w-16 text-green-600 mx-auto' />
        <h2 className='text-2xl font-bold'>Candidatura ricevuta!</h2>
        <p className='text-muted-foreground'>Ti risponderemo entro 2 giorni lavorativi.</p>
      </div>
    </div>
  );

  return (
    <div className='max-w-xl mx-auto px-6 py-16 space-y-8'>
      <div className='space-y-2'>
        <h1 className='text-3xl font-bold'>Diventa Partner</h1>
        <p className='text-muted-foreground'>
          Guadagna commissioni ricorrenti portando imprese edili su Edilizia in Cloud.
        </p>
      </div>

      <div className='space-y-4'>
        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1.5'>
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className='space-y-1.5'>
            <Label>Email *</Label>
            <Input type='email' value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <div className='space-y-1.5'>
            <Label>Telefono</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className='space-y-1.5'>
            <Label>Tipo partner</Label>
            <Select value={form.partner_type} onValueChange={v => setForm({ ...form, partner_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='referrer'>Referrer privato</SelectItem>
                <SelectItem value='agency'>Agenzia / Studio</SelectItem>
                <SelectItem value='reseller'>Rivenditore</SelectItem>
                <SelectItem value='association'>Associazione di categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label>Quante imprese edili conosci nel tuo network?</Label>
          <Input
            type='number'
            value={form.network_size}
            onChange={e => setForm({ ...form, network_size: e.target.value })}
            placeholder='es. 15'
          />
        </div>

        <div className='space-y-1.5'>
          <Label>Note aggiuntive (opzionale)</Label>
          <Textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder='Presentati brevemente: chi sei, come conosci le imprese edili...'
            rows={3}
          />
        </div>

        <Button className='w-full' onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 className='h-4 w-4 animate-spin mr-2' /> : <Send className='h-4 w-4 mr-2' />}
          Invia candidatura
        </Button>
      </div>
    </div>
  );
}
