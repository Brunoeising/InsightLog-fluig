/*
  # Fix Storage Policies for File Upload

  1. Changes
    - Drop and recreate storage policies with correct syntax
    - Add explicit DELETE policy for users to manage their files
    - Add explicit UPDATE policy for users to manage their files
    
  2. Security
    - Maintains RLS security
    - Users can only access their own files
    - Full CRUD operations for users on their own files
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;

-- Create comprehensive storage policies
CREATE POLICY "Users can upload own files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'logs' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);