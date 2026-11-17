CREATE TABLE IF NOT EXISTS public.documents (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  page_label TEXT NOT NULL,
  image_path TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('aadhaar', 'passport')),
  subtype TEXT NOT NULL,
  fields JSONB NOT NULL,
  quality TEXT NOT NULL,
  blur_constant DOUBLE PRECISION NOT NULL DEFAULT 0,
  ocr_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '365 days')
);

CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON public.documents (updated_at);
CREATE INDEX IF NOT EXISTS documents_owner_id_idx ON public.documents (owner_id);
CREATE INDEX IF NOT EXISTS documents_expires_at_idx ON public.documents (expires_at);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own documents" ON public.documents;
DROP POLICY IF EXISTS "users insert own documents" ON public.documents;
DROP POLICY IF EXISTS "users update own documents" ON public.documents;
DROP POLICY IF EXISTS "users delete own documents" ON public.documents;

CREATE POLICY "users read own documents" ON public.documents
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "users insert own documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "users update own documents" ON public.documents
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "users delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

CREATE POLICY "Users can upload own documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "Users can read own documents" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Run this cleanup from a scheduled Supabase Edge Function using the service role:
-- DELETE FROM public.documents WHERE expires_at < NOW();