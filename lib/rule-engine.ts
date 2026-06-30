import osRules from './portability-matrix/os-rules.json';
import databaseRules from './portability-matrix/database-rules.json';
import javaRules from './portability-matrix/java-rules.json';
import appserverRules from './portability-matrix/appserver-rules.json';
import nginxRules from './portability-matrix/nginx-rules.json';
import apacheRules from './portability-matrix/apache-rules.json';
import architectureRules from './portability-matrix/architecture-rules.json';

export type CompatibilityStatus =
  | 'HOMOLOGADO'
  | 'HOMOLOGADO_RESTRICOES'
  | 'EM_ANALISE'
  | 'EM_VALIDACAO'
  | 'NAO_HOMOLOGADO'
  | 'NAO_IDENTIFICADO';

export interface ValidationItem {
  category: string;
  field: string;
  label: string;
  collectedValue: string;
  expectedValue: string;
  status: CompatibilityStatus;
  notes: string;
}

interface NameVersionEntry {
  name: string;
  versions: string[];
  reason?: string;
}

interface RuleEntry {
  field: string;
  label: string;
  homologated: any;
  em_analise?: any;
  restricted: any;
  not_homologated: any;
  comparison: string;
}

interface RuleFile {
  category: string;
  description: string;
  rules: RuleEntry[];
}

const ruleFiles: Record<string, RuleFile> = {
  OS: osRules as unknown as RuleFile,
  DATABASE: databaseRules as unknown as RuleFile,
  JAVA: javaRules as unknown as RuleFile,
  APPSERVER: appserverRules as unknown as RuleFile,
  NGINX: nginxRules as unknown as RuleFile,
  APACHE: apacheRules as unknown as RuleFile,
  ARCHITECTURE: architectureRules as unknown as RuleFile,
};

function normalizeVersion(version: string): string {
  return version.trim().toLowerCase().replace(/\s+/g, '');
}

function extractVersion(str: string): string | null {
  const match = str.match(/(\d+(\.\d+)*)/);
  return match ? match[1] : null;
}

function matchNameVersion(
  collected: string,
  list: NameVersionEntry[]
): { matched: boolean; entry?: NameVersionEntry } {
  if (!collected || !collected.trim()) return { matched: false };
  const collectedLower = collected.toLowerCase();

  for (const entry of list) {
    const nameMatch = collectedLower.includes(entry.name.toLowerCase());
    if (!nameMatch) continue;

    for (const ver of entry.versions) {
      if (ver === '*') return { matched: true, entry };
      const collectedVer = extractVersion(collected);
      const normalizedVer = normalizeVersion(ver).replace(/\.x$/, '');
      if (collectedVer && collectedVer.startsWith(normalizedVer)) {
        return { matched: true, entry };
      }
    }
  }
  return { matched: false };
}

function matchExact(collected: string, list: string[]): boolean {
  if (!collected || !collected.trim()) return false;
  const collectedLower = collected.trim().toLowerCase();
  return list.some(v => v === '*' || collectedLower === v.toLowerCase());
}

function compareNumericMin(
  collected: string,
  threshold: { min?: number; max?: number }
): { matched: boolean; status: CompatibilityStatus } {
  const value = parseFloat(collected);
  if (isNaN(value)) return { matched: false, status: 'NAO_IDENTIFICADO' };
  if (threshold.min !== undefined && value >= threshold.min) {
    return { matched: true, status: 'HOMOLOGADO' };
  }
  if (threshold.max !== undefined && value <= threshold.max) {
    return { matched: true, status: 'NAO_HOMOLOGADO' };
  }
  return { matched: false, status: 'HOMOLOGADO_RESTRICOES' };
}

function buildExpectedString(list: NameVersionEntry[]): string {
  return list.map(e => `${e.name} ${e.versions.join('/')}`).join(', ');
}

function validateRule(
  rule: RuleEntry,
  collectedValue: string
): { status: CompatibilityStatus; expected: string; notes: string } {
  if (!collectedValue || !collectedValue.trim()) {
    return { status: 'NAO_IDENTIFICADO', expected: '', notes: 'Valor nao informado' };
  }

  if (rule.comparison === 'name_version') {
    const homList: NameVersionEntry[] = rule.homologated || [];
    const emAnaliseList: NameVersionEntry[] = rule.em_analise || [];
    const restrictedList: NameVersionEntry[] = rule.restricted || [];
    const notHomList: NameVersionEntry[] = rule.not_homologated || [];

    const hom = matchNameVersion(collectedValue, homList);
    if (hom.matched) {
      return { status: 'HOMOLOGADO', expected: buildExpectedString(homList), notes: '' };
    }

    const emAnalise = matchNameVersion(collectedValue, emAnaliseList);
    if (emAnalise.matched && emAnalise.entry) {
      return {
        status: 'EM_ANALISE',
        expected: buildExpectedString(homList),
        notes: emAnalise.entry.reason || 'Item em analise pela TOTVS - homologacao nao concluida',
      };
    }

    const rest = matchNameVersion(collectedValue, restrictedList);
    if (rest.matched && rest.entry) {
      return {
        status: 'HOMOLOGADO_RESTRICOES',
        expected: buildExpectedString(homList),
        notes: rest.entry.reason || '',
      };
    }

    const notHom = matchNameVersion(collectedValue, notHomList);
    if (notHom.matched && notHom.entry) {
      return {
        status: 'NAO_HOMOLOGADO',
        expected: buildExpectedString(homList),
        notes: (notHom.entry as any).reason || 'Item nao homologado pela matriz de portabilidade',
      };
    }

    return {
      status: 'EM_VALIDACAO',
      expected: buildExpectedString(homList),
      notes: 'Item nao encontrado na matriz - em validacao',
    };
  }

  if (rule.comparison === 'exact') {
    const homList: string[] = rule.homologated || [];
    const emAnaliseList: string[] = rule.em_analise || [];
    const notHomList: string[] = rule.not_homologated || [];

    if (matchExact(collectedValue, homList)) {
      return { status: 'HOMOLOGADO', expected: homList.join(', '), notes: '' };
    }

    if (emAnaliseList.length > 0 && matchExact(collectedValue, emAnaliseList)) {
      return { status: 'EM_ANALISE', expected: homList.join(', '), notes: 'Item em analise pela TOTVS' };
    }

    if (rule.restricted && rule.restricted.length > 0) {
      for (const r of rule.restricted) {
        if (typeof r === 'object' && r.value) {
          if (collectedValue.trim().toLowerCase() === r.value.toLowerCase()) {
            return { status: 'HOMOLOGADO_RESTRICOES', expected: r.value, notes: r.reason || '' };
          }
        }
      }
    }

    if (notHomList.length > 0 && matchExact(collectedValue, notHomList)) {
      return { status: 'NAO_HOMOLOGADO', expected: homList.join(', '), notes: 'Item nao homologado' };
    }

    return {
      status: 'EM_VALIDACAO',
      expected: homList.join(', '),
      notes: 'Item nao encontrado na matriz - em validacao',
    };
  }

  if (rule.comparison === 'numeric_min') {
    const homResult = compareNumericMin(collectedValue, rule.homologated || {});
    if (homResult.status === 'HOMOLOGADO') {
      return { status: 'HOMOLOGADO', expected: `Minimo: ${(rule.homologated as any)?.min}`, notes: '' };
    }

    if (rule.restricted) {
      const restResult = compareNumericMin(collectedValue, rule.restricted);
      if (restResult.status === 'HOMOLOGADO_RESTRICOES') {
        return {
          status: 'HOMOLOGADO_RESTRICOES',
          expected: `Recomendado: ${(rule.homologated as any)?.min}+`,
          notes: (rule.restricted as any)?.reason || '',
        };
      }
    }

    if (rule.not_homologated) {
      const notHomResult = compareNumericMin(collectedValue, rule.not_homologated);
      if (notHomResult.status === 'NAO_HOMOLOGADO' || notHomResult.matched) {
        return {
          status: 'NAO_HOMOLOGADO',
          expected: `Minimo: ${(rule.homologated as any)?.min}`,
          notes: 'Abaixo do minimo homologado',
        };
      }
    }

    return { status: 'EM_VALIDACAO', expected: '', notes: 'Nao foi possivel validar' };
  }

  return { status: 'EM_VALIDACAO', expected: '', notes: 'Tipo de comparacao nao suportado' };
}

export function validateInventory(inventory: Record<string, string>): ValidationItem[] {
  const results: ValidationItem[] = [];

  for (const [categoryKey, ruleFile] of Object.entries(ruleFiles)) {
    for (const rule of ruleFile.rules) {
      const collectedValue = inventory[rule.field] || '';
      const validation = validateRule(rule, collectedValue);
      results.push({
        category: categoryKey,
        field: rule.field,
        label: rule.label,
        collectedValue,
        expectedValue: validation.expected,
        status: validation.status,
        notes: validation.notes,
      });
    }
  }

  return results;
}

export function getCompatibilityScore(items: ValidationItem[]): number {
  if (items.length === 0) return 0;
  const scores: Record<CompatibilityStatus, number> = {
    HOMOLOGADO: 100,
    HOMOLOGADO_RESTRICOES: 60,
    EM_ANALISE: 40,
    EM_VALIDACAO: 20,
    NAO_HOMOLOGADO: 0,
    NAO_IDENTIFICADO: 0,
  };
  const total = items.reduce((sum, i) => sum + scores[i.status], 0);
  return Math.round(total / items.length);
}

export function countByStatus(items: ValidationItem[]): {
  homologated: number;
  restricted: number;
  inAnalysis: number;
  inValidation: number;
  notHomologated: number;
  notIdentified: number;
} {
  return {
    homologated: items.filter(i => i.status === 'HOMOLOGADO').length,
    restricted: items.filter(i => i.status === 'HOMOLOGADO_RESTRICOES').length,
    inAnalysis: items.filter(i => i.status === 'EM_ANALISE').length,
    inValidation: items.filter(i => i.status === 'EM_VALIDACAO').length,
    notHomologated: items.filter(i => i.status === 'NAO_HOMOLOGADO').length,
    notIdentified: items.filter(i => i.status === 'NAO_IDENTIFICADO').length,
  };
}
