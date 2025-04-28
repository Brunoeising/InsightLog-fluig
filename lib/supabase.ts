import { createClient } from '@supabase/supabase-js';
import { LogAnalysisResult, LogErrorEntry, UserQuestion } from './types';

// Environment variables will be retrieved from .env.local in production
// For development, we'll use default values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Log analysis functions
export async function saveLogAnalysis(analysis: LogAnalysisResult) {
  const { data, error } = await supabase
    .from('log_analyses')
    .insert([
      {
        file_name: analysis.fileName,
        uploaded_at: analysis.uploadedAt,
        error_count: analysis.errorCount,
        warning_count: analysis.warningCount,
        summary: analysis.summary,
        suggestions: analysis.suggestions
      }
    ])
    .select();

  if (error) throw error;
  
  const analysisId = data?.[0]?.id;
  
  // Save errors associated with this analysis
  if (analysisId && analysis.errors.length > 0) {
    await saveLogErrors(analysisId, analysis.errors);
  }
  
  return analysisId;
}

export async function saveLogErrors(analysisId: string, errors: LogErrorEntry[]) {
  const errorsToInsert = errors.map(error => ({
    analysis_id: analysisId,
    level: error.level,
    message: error.message,
    timestamp: error.timestamp,
    category: error.category,
    context_before: error.contextBefore,
    context_after: error.contextAfter,
    suggestion: error.suggestion
  }));
  
  const { error } = await supabase
    .from('log_errors')
    .insert(errorsToInsert);
    
  if (error) throw error;
}

export async function getLogAnalyses() {
  const { data, error } = await supabase
    .from('log_analyses')
    .select('*')
    .order('uploaded_at', { ascending: false });
    
  if (error) throw error;
  return data;
}

export async function getLogAnalysisById(id: string) {
  // Get the analysis
  const { data: analysis, error: analysisError } = await supabase
    .from('log_analyses')
    .select('*')
    .eq('id', id)
    .single();
    
  if (analysisError) throw analysisError;
  
  // Get the errors for this analysis
  const { data: errors, error: errorsError } = await supabase
    .from('log_errors')
    .select('*')
    .eq('analysis_id', id);
    
  if (errorsError) throw errorsError;
  
  return {
    ...analysis,
    errors: errors || []
  };
}

export async function saveUserQuestion(question: UserQuestion) {
  const { data, error } = await supabase
    .from('user_questions')
    .insert([
      {
        analysis_id: question.logAnalysisId,
        question: question.question,
        created_at: question.createdAt
      }
    ])
    .select();
    
  if (error) throw error;
  return data?.[0]?.id;
}

export async function updateQuestionAnswer(questionId: string, answer: string) {
  const { error } = await supabase
    .from('user_questions')
    .update({ answer })
    .eq('id', questionId);
    
  if (error) throw error;
}