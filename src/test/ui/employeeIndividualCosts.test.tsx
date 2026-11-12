import{afterEach,describe,it,expect,vi}from'vitest';
import{cleanup,render,screen}from'@testing-library/react';
import '@testing-library/jest-dom/vitest';
import{EmployeesTab}from'@/components/employees/EmployeesTab';
import type{Employee}from'@/types/employees';
vi.mock('@/hooks/useParametriCostoPersonale',()=>({useParametriCostoPersonale:()=>({data:null as null})}));
afterEach(cleanup);
const employee:Employee={id:'test-person',first_name:'Mario',last_name:'Rossi',email:null,phone:null,gross_salary:2800,net_salary:2100,monthly_hours:160,costo_orario:35,is_active:true,user_id:null,role_type:'operaio'};
const props={employees:[employee],isLoading:false,soloLettura:true,onNew:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onViewAttachments:vi.fn(),onCreateUser:vi.fn()};
describe('costi individuali nell’anagrafica',()=>{
 it('senza autorizzazione mostra la persona e le ore ma non retribuzioni o tariffa',()=>{render(<EmployeesTab {...props}/>);expect(screen.getByText('Mario Rossi')).toBeInTheDocument();expect(screen.getByText('160h')).toBeInTheDocument();expect(screen.queryByText('Stipendio lordo')).not.toBeInTheDocument();expect(screen.queryByText('Stipendio netto')).not.toBeInTheDocument();expect(screen.queryByText('Costo orario')).not.toBeInTheDocument();expect(screen.queryByText(/€/)).not.toBeInTheDocument()});
 it('con autorizzazione espone retribuzioni e costo orario',()=>{render(<EmployeesTab {...props} canViewIndividualCosts/>);expect(screen.getByText('Stipendio lordo')).toBeInTheDocument();expect(screen.getByText('Stipendio netto')).toBeInTheDocument();expect(screen.getByText('Costo orario')).toBeInTheDocument();expect(screen.getByText(/2\.800/)).toBeInTheDocument()});
});
