import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
const schema = z.object({amount:z.coerce.number<string|number>().min(0.01)});
it('mantiene separati il testo inserito e il numero validato dal modulo',async()=>{
 const salva=vi.fn();
 function Modulo(){
  const form=useForm<z.input<typeof schema>,unknown,z.output<typeof schema>>({resolver:zodResolver(schema),defaultValues:{amount:0}});
  return <Form {...form}><form onSubmit={form.handleSubmit(salva)}><FormField control={form.control} name="amount" render={({field})=><FormItem><FormLabel>Importo</FormLabel><FormControl><Input {...field}/></FormControl></FormItem>}/><button type="submit">Conferma</button></form></Form>;
 }
 render(<Modulo/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Importo'}),{target:{value:'12.50'}});
 fireEvent.click(screen.getByRole('button',{name:'Conferma'}));
 await waitFor(()=>expect(salva).toHaveBeenCalled());
 expect(salva.mock.calls[0][0]).toEqual({amount:12.5});
});
