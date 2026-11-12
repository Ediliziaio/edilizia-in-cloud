import {describe,it,expect} from 'vitest';
import {protectedOrderSelect,protectedOrderUrl} from '@/lib/orders/protectedOrderRequests';
describe('Richieste commessa con proiezione server',()=>{
 it('mantiene filtri e selezioni nelle scritture e letture',()=>{
 const u=new URL(protectedOrderUrl('https://example.test/rest/v1/orders?id=eq.abc&select=id,total_amount'));
 expect(u.pathname).toBe('/rest/v1/orders_visibili');expect(u.searchParams.get('id')).toBe('eq.abc');expect(u.searchParams.get('select')).toBe('id,total_amount');
 });
 it('preserva gli alias annidati e gli hint dei join',()=>expect(protectedOrderSelect('id,orders!inner(id,righe:order_installments!order_id(amount)),order_employees(hours_worked)')).toBe('id,orders:orders_visibili!inner(id,righe:order_installments_visibili!order_id(amount)),order_employees:order_employees_visibili(hours_worked)'));
 it('non riscrive RPC o relazioni estranee',()=>{
 const u='https://example.test/rest/v1/rpc/orders';expect(protectedOrderUrl(u)).toBe(u);expect(protectedOrderSelect('external_teams(name)')).toBe('external_teams(name)');
 });
});

it('protegge anche le retribuzioni dell’anagrafica, inclusi i collegamenti annidati',()=>{
 expect(protectedOrderUrl('https://example.test/rest/v1/employees?select=id,gross_salary')).toContain('/employees_visibili?');
 expect(protectedOrderSelect('employee:employees!employee_id(id,gross_salary)')).toBe('employee:employees_visibili!employee_id(id,gross_salary)');
});
