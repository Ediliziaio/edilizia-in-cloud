import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('compila la helper RLS prima della migrazione magazzini di agosto e conserva la FK', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.warehouses(id uuid primary key);
      create table public.order_items(id uuid primary key, order_id uuid);
      create table public.companies(id uuid primary key);
      create table public.profiles(id uuid primary key);
      create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    const migration = readFileSync('supabase/migrations/20260506095300_critical_rls_recursion_fix.sql', 'utf8');
    const prerequisite = migration.match(/ALTER TABLE public\.order_items[\s\S]*?;/)?.[0];
    expect(prerequisite).toBeDefined();
    await db.exec(prerequisite!);
    const depsStart = migration.indexOf('CREATE TABLE IF NOT EXISTS public.warehouse_assignments');
    const depsEnd = migration.indexOf('-- Helper 1:', depsStart);
    await db.exec(migration.slice(depsStart, depsEnd));
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.order_has_item_in_my_warehouse');
    const end = migration.indexOf('$$;', start) + 3;
    await db.exec(migration.slice(start, end));
    expect((await db.query('select public.is_warehouse_user() as assigned')).rows).toEqual([{ assigned: false }]);
    expect((await db.query('select public.order_has_item_in_my_warehouse(gen_random_uuid()) as visible')).rows).toEqual([{ visible: false }]);
    await expect(db.exec('insert into order_items values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())')).rejects.toThrow(/foreign key/);
    // Il successivo ADD COLUMN IF NOT EXISTS deve restare ripetibile.
    await db.exec(prerequisite!);
  } finally {
    await db.close();
  }
}, 30000);
