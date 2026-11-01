-- Migration: Cloud License Verification and Encrypted Backup
-- Schema version: 20261031000000_cloud_license_and_backup.sql

-- Enable pgcrypto / uuid-ossp if needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Table: public.licenses
-- Stores customer licenses, activation keys, permitted features, and hardware machine bindings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    machine_id TEXT,
    features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    updates_until DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure missing columns exist if table was previously created with minimal schema
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS license_key TEXT UNIQUE;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Indexes for querying by machine_id and activation key
CREATE INDEX IF NOT EXISTS idx_licenses_machine_id ON public.licenses(machine_id);
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses(license_key);

-- Enable Row Level Security (RLS) on licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Short comment explaining RLS Policy 1 (Select narrowest policy for anon):
-- Allows an anonymous client to read ONLY its own license record
-- if the request carries a matching x-machine-id header, preventing enumeration of other customers.
DROP POLICY IF EXISTS "Clients can only read their own license by machine_id" ON public.licenses;
CREATE POLICY "Clients can only read their own license by machine_id"
    ON public.licenses FOR SELECT TO anon
    USING (
        machine_id IS NOT NULL
        AND machine_id = (current_setting('request.headers', true)::json->>'x-machine-id')
    );

-- Short comment explaining RLS Policy 2 (Deny anon mutation):
-- Prohibits direct INSERT/UPDATE/DELETE from anonymous client connections.
-- License provisioning and binding are handled by Edge Functions or authenticated admins.
DROP POLICY IF EXISTS "Deny client write access to licenses" ON public.licenses;
CREATE POLICY "Deny client write access to licenses"
    ON public.licenses FOR ALL TO anon
    USING (false) WITH CHECK (false);

-- Short comment explaining Admin Access Policy:
-- Authenticated admins logged into the Admin Portal have full access to manage licenses.
DROP POLICY IF EXISTS "Admin full access to licenses" ON public.licenses;
CREATE POLICY "Admin full access to licenses"
    ON public.licenses FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 2. Table: public.backups
-- Tracks encrypted cloud backup archives tied to specific licenses
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    app_version TEXT
);

-- Indexes for querying license backups ordered by date
CREATE INDEX IF NOT EXISTS idx_backups_license_id ON public.backups(license_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON public.backups(created_at DESC);

-- Enable Row Level Security (RLS) on backups table
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Short comment explaining RLS Policy 3 (Select narrowest policy):
-- Clients can only see backup records associated with their own verified machine_id,
-- preventing any client from seeing or enumerating other stores' backups.
DROP POLICY IF EXISTS "Clients can only read backups for their own license" ON public.backups;
CREATE POLICY "Clients can only read backups for their own license"
    ON public.backups FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM public.licenses l
            WHERE l.id = backups.license_id
              AND l.machine_id IS NOT NULL
              AND l.machine_id = (current_setting('request.headers', true)::json->>'x-machine-id')
        )
    );

-- Short comment explaining RLS Policy 4 (Deny direct anon mutation):
-- Prohibits direct anonymous inserts or updates to backup records.
-- Records are securely created by verified Edge Functions using the service_role key.
DROP POLICY IF EXISTS "Deny direct client write access to backups" ON public.backups;
CREATE POLICY "Deny direct client write access to backups"
    ON public.backups FOR ALL TO anon
    USING (false) WITH CHECK (false);

-- Short comment explaining Admin Access Policy on backups:
-- Authenticated admins can view and manage all backups from the Admin Portal.
DROP POLICY IF EXISTS "Admin full access to backups" ON public.backups;
CREATE POLICY "Admin full access to backups"
    ON public.backups FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. Storage Bucket: backups (Private, no public access)
-- Storage layout: backups/{license_id}/{filename}
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'backups',
    'backups',
    false,
    524288000, -- Max 500 MB per backup snapshot
    ARRAY['application/octet-stream', 'application/gzip', 'application/x-sqlite3']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Short comment explaining Storage Policy:
-- Denies direct public/anon access to the backups storage bucket.
-- Uploads and downloads are exclusively authorized via short-lived signed URLs generated by Edge Functions.
DROP POLICY IF EXISTS "Deny direct public access to backups bucket" ON storage.objects;
CREATE POLICY "Deny direct public access to backups bucket"
    ON storage.objects FOR ALL TO anon, authenticated
    USING (bucket_id = 'backups' AND false)
    WITH CHECK (bucket_id = 'backups' AND false);

-- ============================================================================
-- 4. Initial Master License (ترخيص رئيسي مفعّل للاستخدام الفوري)
-- ============================================================================
INSERT INTO public.licenses (id, license_key, customer_name, customer_phone, machine_id, features, updates_until, status)
VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'MBX-2026-7777-GOLD',
    'موبيكس - Mobix',
    '01000000000',
    NULL, -- سيتم ربطه تلقائياً بأول جهاز يتم تفعيله عليه
    ARRAY['cloud_backup', 'repairs', 'inventory', 'reports'],
    '2030-12-31',
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    license_key = EXCLUDED.license_key,
    customer_name = EXCLUDED.customer_name;
