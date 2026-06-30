import installationErrors from './troubleshoot-kb/installation-errors.json';
import { supabase } from './supabase-client';

interface ErrorMatch {
  id: string;
  title: string;
  description: string;
  solutionSteps: string[];
  relatedConfigFiles: string[];
  severity: string;
  confidence: number;
}

export function matchInstallationError(errorText: string, fluigVersion?: string): ErrorMatch[] {
  const matches: ErrorMatch[] = [];
  const errorLower = errorText.toLowerCase();

  for (const entry of installationErrors.errors) {
    const regex = new RegExp(entry.errorPattern, 'i');
    if (regex.test(errorText) || regex.test(errorLower)) {
      let confidence = 0.8;
      const words = entry.errorPattern.split('|');
      const matchCount = words.filter(w => new RegExp(w, 'i').test(errorText)).length;
      confidence = Math.min(0.95, 0.6 + (matchCount / words.length) * 0.35);

      matches.push({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        solutionSteps: entry.solutionSteps,
        relatedConfigFiles: entry.relatedConfigFiles,
        severity: entry.severity,
        confidence,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

export async function saveDiagnostic(data: {
  environmentName: string;
  errorInput: string;
  errorType: string;
  fluigVersion: string;
  aiDiagnosis: string;
  solutionSteps: string[];
  relatedArticles: string[];
}) {
  const { data: row, error } = await supabase
    .from('installation_diagnostics')
    .insert({
      environment_name: data.environmentName,
      error_input: data.errorInput,
      error_type: data.errorType,
      fluig_version: data.fluigVersion,
      ai_diagnosis: data.aiDiagnosis,
      solution_steps: data.solutionSteps,
      related_articles: data.relatedArticles,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return row;
}

export async function markDiagnosticResolved(id: string, resolved: boolean) {
  const { error } = await supabase
    .from('installation_diagnostics')
    .update({ resolved })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function fetchDiagnosticHistory(page: number = 1, pageSize: number = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('installation_diagnostics')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { diagnostics: data || [], total: count || 0 };
}
