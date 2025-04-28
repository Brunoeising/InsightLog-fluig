/*
  # Log Analysis Schema

  1. New Tables
    - `log_analyses`
      - `id` (uuid, primary key)
      - `file_name` (text)
      - `uploaded_at` (timestamp)
      - `error_count` (integer)
      - `warning_count` (integer)
      - `summary` (text)
      - `suggestions` (text array)
      - `user_id` (uuid, foreign key to auth.users)
      - `created_at` (timestamp)
    
    - `log_errors`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to log_analyses)
      - `level` (text)
      - `message` (text)
      - `timestamp` (text)
      - `category` (text)
      - `context_before` (text array)
      - `context_after` (text array)
      - `suggestion` (text)
      - `created_at` (timestamp)
    
    - `user_questions`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to log_analyses)
      - `question` (text)
      - `answer` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create log_analyses table
CREATE TABLE IF NOT EXISTS log_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  uploaded_at timestamptz NOT NULL,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  summary text,
  suggestions text[],
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create log_errors table
CREATE TABLE IF NOT EXISTS log_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES log_analyses(id) ON DELETE CASCADE,
  level text NOT NULL,
  message text NOT NULL,
  timestamp text NOT NULL,
  category text NOT NULL,
  context_before text[],
  context_after text[],
  suggestion text,
  created_at timestamptz DEFAULT now()
);

-- Create user_questions table
CREATE TABLE IF NOT EXISTS user_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES log_analyses(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE log_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_questions ENABLE ROW LEVEL SECURITY;

-- Create policies for log_analyses
CREATE POLICY "Users can view own analyses"
  ON log_analyses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON log_analyses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policies for log_errors
CREATE POLICY "Users can view errors from own analyses"
  ON log_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_errors.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert errors for own analyses"
  ON log_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_errors.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );

-- Create policies for user_questions
CREATE POLICY "Users can view own questions"
  ON user_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = user_questions.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own questions"
  ON user_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = user_questions.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );