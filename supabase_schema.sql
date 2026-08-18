-- ==============================================================================
-- FormForge Supabase Schema & Real-Time Sync Setup
-- Run this SQL in your Supabase SQL Editor (https://app.supabase.com)
-- ==============================================================================

-- 1. Create FORMS Table
CREATE TABLE IF NOT EXISTS public.forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'published',
    mode TEXT DEFAULT 'exam',
    theme TEXT DEFAULT 'indigo',
    time_limit INTEGER DEFAULT 30,
    passing_score NUMERIC DEFAULT 70,
    sections JSONB DEFAULT '[]'::jsonb,
    questions JSONB DEFAULT '[]'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    conditional_logic JSONB DEFAULT '[]'::jsonb,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create RESPONSES Table (Stores all student / candidate submissions)
CREATE TABLE IF NOT EXISTS public.responses (
    id TEXT PRIMARY KEY,
    form_id TEXT REFERENCES public.forms(id) ON DELETE CASCADE,
    form_title TEXT,
    respondent_name TEXT NOT NULL,
    respondent_email TEXT,
    respondent_id TEXT,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    flags JSONB DEFAULT '[]'::jsonb,
    manual_grades JSONB DEFAULT '{}'::jsonb,
    duration_seconds INTEGER DEFAULT 0,
    forced_by_timer BOOLEAN DEFAULT FALSE,
    scoring JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- 4. Set Policies for Public Anonymous Submissions and Reads
-- Allow anyone to read published forms
CREATE POLICY "Allow public read forms" 
ON public.forms FOR SELECT 
USING (true);

-- Allow admins/creators to insert/update forms
CREATE POLICY "Allow public manage forms" 
ON public.forms FOR ALL 
USING (true)
WITH CHECK (true);

-- Allow candidates to submit responses
CREATE POLICY "Allow public insert responses" 
ON public.responses FOR INSERT 
WITH CHECK (true);

-- Allow reading responses for analytics/results
CREATE POLICY "Allow public read responses" 
ON public.responses FOR SELECT 
USING (true);

-- Allow updating responses for manual grading
CREATE POLICY "Allow public update responses" 
ON public.responses FOR UPDATE 
USING (true)
WITH CHECK (true);

-- 5. Create Indices for ultra-fast query lookups
CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON public.forms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_form_id ON public.responses(form_id);
CREATE INDEX IF NOT EXISTS idx_responses_submitted_at ON public.responses(submitted_at DESC);
