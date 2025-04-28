/*
  # Create logs storage bucket

  1. Storage
    - Creates the 'logs' bucket for storing log files
    - Sets bucket to private (not publicly accessible)
  
  2. Security
    - Adds policy for authenticated users to upload files
    - Adds policy for authenticated users to read their own files
*/

-- Create the logs bucket if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('logs', 'logs')
ON CONFLICT (id) DO NOTHING;

-- Set bucket to private
UPDATE storage.buckets
SET public = false
WHERE id = 'logs';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;

-- Create storage policies
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);