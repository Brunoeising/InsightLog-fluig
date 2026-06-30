import standaloneRules from './config-rules/standalone-xml-rules.json';
import databaseParamsRules from './config-rules/database-params-rules.json';
import { supabase } from './supabase-client';

export interface ConfigParam {
  id: string;
  label: string;
  currentValue: string | null;
  expectedValue: string;
  status: 'ok' | 'warning' | 'error' | 'not_found';
  description: string;
  critical: boolean;
}

export function parseStandaloneXml(content: string): ConfigParam[] {
  const results: ConfigParam[] = [];

  for (const param of standaloneRules.parameters) {
    const regex = new RegExp(param.pattern, 'i');
    const match = content.match(regex);
    const currentValue = match ? match[1] : null;

    let status: ConfigParam['status'] = 'not_found';
    let expectedValue = '';

    if ('expected_exact' in param && param.expected_exact) {
      expectedValue = param.expected_exact;
      if (currentValue === param.expected_exact) status = 'ok';
      else if (currentValue) status = 'error';
    } else if ('recommended' in param && param.recommended) {
      const rec = param.recommended as { min?: number; max?: number };
      expectedValue = rec.min && rec.max ? `${rec.min} - ${rec.max}` : rec.min ? `>= ${rec.min}` : `<= ${rec.max}`;
      if (currentValue) {
        const numVal = parseInt(currentValue);
        if (!isNaN(numVal)) {
          if (rec.min && numVal < rec.min) status = param.critical ? 'error' : 'warning';
          else if (rec.max && numVal > rec.max) status = 'warning';
          else status = 'ok';
        }
      }
    }

    results.push({
      id: param.id,
      label: param.label,
      currentValue,
      expectedValue,
      status,
      description: param.description,
      critical: param.critical,
    });
  }

  return results;
}

export function validateDatabaseParams(params: Record<string, string>, dbType: string): ConfigParam[] {
  const rules = (databaseParamsRules.databases as any)[dbType];
  if (!rules) return [];

  const results: ConfigParam[] = [];
  for (const param of rules.parameters) {
    const currentValue = params[param.name] || null;
    let status: ConfigParam['status'] = 'not_found';
    let expectedValue = '';

    if ('expected' in param) {
      expectedValue = param.expected;
      if (currentValue?.toLowerCase() === param.expected.toLowerCase()) status = 'ok';
      else if (currentValue) status = 'error';
    } else if ('min' in param || 'min_mb' in param) {
      const min = param.min_mb || param.min;
      const rec = param.recommended_mb || param.recommended || min;
      expectedValue = `>= ${rec}${param.min_mb ? ' MB' : ''}`;
      if (currentValue) {
        const numVal = parseInt(currentValue.replace(/[^0-9]/g, ''));
        if (!isNaN(numVal)) {
          if (numVal < min) status = 'error';
          else if (numVal < rec) status = 'warning';
          else status = 'ok';
        }
      }
    } else if ('must_not_contain' in param) {
      expectedValue = `Nao deve conter: ${param.must_not_contain}`;
      if (currentValue && !currentValue.includes(param.must_not_contain)) status = 'ok';
      else if (currentValue) status = 'warning';
    }

    results.push({
      id: param.name,
      label: param.name,
      currentValue,
      expectedValue,
      status,
      description: param.description,
      critical: param.critical,
    });
  }

  return results;
}

export function getConfigScore(params: ConfigParam[]): number {
  if (params.length === 0) return 0;
  const scores = { ok: 100, warning: 60, error: 0, not_found: 20 };
  const total = params.reduce((sum, p) => sum + scores[p.status], 0);
  return Math.round(total / params.length);
}

export async function saveConfigValidation(data: {
  environmentName: string;
  configType: string;
  configContent: string;
  validationResults: ConfigParam[];
  aiCorrections?: string;
  correctedContent?: string;
  score: number;
}) {
  const { data: row, error } = await supabase
    .from('configuration_validations')
    .insert({
      environment_name: data.environmentName,
      config_type: data.configType,
      config_content: data.configContent,
      validation_results: data.validationResults as any,
      ai_corrections: data.aiCorrections || null,
      corrected_content: data.correctedContent || null,
      score: data.score,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return row;
}

export async function fetchConfigValidationHistory(page: number = 1, pageSize: number = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('configuration_validations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { validations: data || [], total: count || 0 };
}
