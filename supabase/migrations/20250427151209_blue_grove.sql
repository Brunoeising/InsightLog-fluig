/*
  # Create storage bucket for log files

  1. New Storage Bucket
    - Creates 'logs' bucket for storing log files
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create the logs bucket if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('logs', 'logs')
ON CONFLICT (id) DO NOTHING;

-- Set bucket to private
UPDATE storage.buckets
SET public = false
WHERE id = 'logs';

-- Create storage policies
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'logs' AND auth.uid()::text = (storage.foldername(name))[1]);