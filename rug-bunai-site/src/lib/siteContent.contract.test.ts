/**
 * Contract tests for the `public.site_content` Supabase table.
 *
 * Regression context: the homepage image editor failed with
 *   PGRST205 "Could not find the table 'public.site_content' in the schema cache"
 * because the table lived only in the manual bootstrap file supabase/schema.sql
 * and had no numbered migration. These tests pin the frontend ↔ SQL contract so
 * any future drift (renamed table, renamed columns, wrong row key, missing RLS)
 * fails CI instead of the live Studio editor.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const MIGRATION_SQL = read('supabase/migrations/0006_site_content.sql');
const SCHEMA_SQL = read('supabase/schema.sql');
const STORE_TSX = read('src/lib/siteContent.tsx');

describe('site_content migration exists and matches the frontend contract', () => {
  it('a numbered migration creates public.site_content (schema.sql alone was the gap)', () => {
    expect(MIGRATION_SQL).toMatch(/create table if not exists public\.site_content/i);
  });

  it('declares exactly the columns the app queries: id, data, updated_at', () => {
    // The store does select('data') / .eq('id', 1) / update({ data, updated_at }).
    expect(MIGRATION_SQL).toMatch(/\bid\s+integer\b/i);
    expect(MIGRATION_SQL).toMatch(/\bdata\s+jsonb\s+not null/i);
    expect(MIGRATION_SQL).toMatch(/\bupdated_at\s+timestamptz/i);
  });

  it('pins the single row the app always reads/writes (id = 1)', () => {
    expect(MIGRATION_SQL).toMatch(/check \(id = 1\)/i);
  });

  it('enables RLS with a public read policy and an admin-only write policy', () => {
    expect(MIGRATION_SQL).toMatch(/enable row level security/i);
    expect(MIGRATION_SQL).toMatch(/for select[\s\S]*?using \(true\)/i);     // storefront hydration
    expect(MIGRATION_SQL).toMatch(/is_admin\(\)\) with check \(public\.is_admin\(\)\)/i); // writes
    // No anonymous/customer write path may exist for site content.
    expect(MIGRATION_SQL).not.toMatch(/for (insert|update|all)[^;]*using \(true\)/i);
  });

  it('is additive/idempotent — never drops or truncates anything', () => {
    expect(MIGRATION_SQL).not.toMatch(/\bdrop table\b/i);
    expect(MIGRATION_SQL).not.toMatch(/\btruncate\b/i);
    expect(MIGRATION_SQL).not.toMatch(/\bdelete from\b/i);
    // Only policies/triggers may be re-declared (drop-if-exists is required for idempotency).
    const ifExistsDrops = MIGRATION_SQL.match(/\bdrop\s+(policy|trigger)\s+if\s+exists\b/gi) ?? [];
    expect(ifExistsDrops.length).toBeGreaterThan(0);
    const allDropKeywords = MIGRATION_SQL.match(/^\s*drop\b/gim) ?? []; // every top-level DROP statement
    expect(allDropKeywords.length).toBe(ifExistsDrops.length);
    expect(MIGRATION_SQL).not.toMatch(/^\s*drop\s+(table|column|function|index|type)\b/im);
  });

  it('keeps schema.sql and the migration in sync on the same table name', () => {
    expect(SCHEMA_SQL).toMatch(/create table public\.site_content/i);
    expect(MIGRATION_SQL.toLowerCase()).toContain('site_content');
  });
});

describe('frontend store contract (what the SQL must support)', () => {
  it('the store targets table `site_content`, row id 1, column `data`', () => {
    expect(STORE_TSX).toContain(".from('site_content')");
    expect(STORE_TSX).toContain(".select('data').eq('id', 1)");
    // The insert/update payload variable is named `stamped` (it carries the
    // _rev/_savedAt concurrency stamps) — assert the shape, not the literal.
    expect(STORE_TSX).toMatch(/\.insert\(\{ id: 1, data: \w+ \}\)/);
    expect(STORE_TSX).toMatch(/update\(\{ data: \w+, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  });

  it('homepage images persist inside the JSONB payload (no extra columns needed)', () => {
    // saveProductHomeImage stores homeImageUrl inside productOverrides → data jsonb.
    expect(STORE_TSX).toContain('homeImageUrl');
    // The exact save-payload shape now includes optimistic-concurrency stamps
    // (_rev/_savedAt) alongside productOverrides — assert both halves persist
    // inside the single JSONB row rather than pinning one literal line.
    expect(STORE_TSX).toMatch(/productOverrides: overrides/);
    expect(STORE_TSX).toMatch(/_rev/);
  });
});
