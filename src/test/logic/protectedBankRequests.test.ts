import { expect,it } from "vitest";
import { protectedBankUrl } from "@/lib/finance/protectedBankRequests";
const base="https://example.supabase.co/rest/v1/";
it("protegge letture, esportazioni ed embed senza alterare le scritture",()=>{
 for(const table of ["bank_accounts","bank_transactions"]){
  for(const method of ["GET","HEAD"])expect(new URL(protectedBankUrl(base+table+"?select=*",method)).pathname).toBe(`/rest/v1/${table}_operativi`);
  for(const method of ["POST","PATCH","DELETE"])expect(protectedBankUrl(base+table,method)).toBe(base+table);
 }
 const input=base+"bank_reconciliations?select=id,bank_transactions(amount,bank_accounts(account_name))";
 expect(new URL(protectedBankUrl(input)).searchParams.get("select")).toBe("id,bank_transactions:bank_transactions_operativi(amount,bank_accounts:bank_accounts_operativi(account_name))");
 expect(protectedBankUrl(protectedBankUrl(input))).toBe(protectedBankUrl(input));
 expect(protectedBankUrl(base+"rpc/get_treasury_summary")).toBe(base+"rpc/get_treasury_summary");
});
