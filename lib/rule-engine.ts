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

interface RuleFile {
  category: string;
  description: string;
  rules: RuleEntry[];
}

interface RuleEntry {
  field: string;
  label: string;
  homologated: any;
  restricted: any;
  not_homologated: any;
  comparison: string;
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

function compareNameVersion(collected: string, list: Array<{ name: string; versions: string[] }>): { matched: boolean; status: CompatibilityStatus; expected: string } {
  if (!collected || !collected.trim()) {
    return { matched: false, status: 'NAO_IDENTIFICADO', expected: '' };
  }
  const collectedLower = collected.toLowerCase();
  for (const entry of list) {
    const nameMatch = collectedLower.includes(entry.name.toLowerCase());
    if (!nameMatch) continue;
    for (const ver of entry.versions) {
      if (ver === '*') {
        return { matched: true, status: 'HOMOLOGADO', expected: `${entry.name} ${ver}` };
      }
      const collectedVer = extractVersion(collected);
      if (collectedVer && collectedVer.startsWith(normalizeVersion(ver).replace(/\.x$/, ''))) {
        return { matched: true, status: 'HOMOLOGADO', expected: `${entry.name} ${ver}` };
      }
    }
  }
  return { matched: false, status: 'NAO_HOMOLOGADO', expected: list.map(e => `${e.name} ${e.versions.join('/')}`).join(', ') };
}

function extractVersion(str: string): string | null {
  const match = str.match(/(\d+(\.\d+)*)/);
  return match ? match[1] : null;
}

function compareExact(collected: string, list: string[]): { matched: boolean; status: CompatibilityStatus; expected: string } {
  if (!collected || !collected.trim()) {
    return { matched: false, status: 'NAO_IDENTIFICADO', expected: '' };
  }
  const collectedLower = collected.trim().toLowerCase();
  for (const val of list) {
    if (val === '*') {
      return { matched: true, status: 'HOMOLOGADO', expected: val };
    }
    if (collectedLower === val.toLowerCase()) {
      return { matched: true, status: 'HOMOLOGADO', expected: val };
    }
  }
  return { matched: false, status: 'NAO_HOMOLOGADO', expected: list.join(', ') };
}

function compareNumericMin(collected: string, threshold: { min?: number; max?: number }): { matched: boolean; status: CompatibilityStatus } {
  const value = parseFloat(collected);
  if (isNaN(value)) {
    return { matched: false, status: 'NAO_IDENTIFICADO' };
  }
  if (threshold.min !== undefined && value >= threshold.min) {
    return { matched: true, status: 'HOMOLOGADO' };
  }
  if (threshold.max !== undefined && value <= threshold.max) {
    return { matched: true, status: 'NAO_HOMOLOGADO' };
  }
  return { matched: false, status: 'HOMOLOGADO_RESTRICOES' };
}

function validateRule(rule: RuleEntry, collectedValue: string): { status: CompatibilityStatus; expected: string; notes: string } {
  if (!collectedValue || !collectedValue.trim()) {
    return { status: 'NAO_IDENTIFICADO', expected: '', notes: 'Valor nao informado' };
  }

  const comparison = rule.comparison;

  if (comparison === 'name_version') {
    const hom = compareNameVersion(collectedValue, rule.homologated || []);
    if (hom.matched) return { status: 'HOMOLOGADO', expected: hom.expected, notes: '' };

    if (rule.restricted && rule.restricted.length > 0) {
      const rest = compareNameVersion(collectedValue, rule.restricted);
      if (rest.matched) {
        const reason = (rule.restricted as any[]).find((r) => {
          const collectedLower = collectedValue.toLowerCase();
          return collectedLower.includes(r.name.toLowerCase());
        })?.reason || '';
        return { status: 'HOMOLOGADO_RESTRICOES', expected: rest.expected, notes: reason };
      }
    }

    if (rule.not_homologated && rule.not_homologated.length > 0) {
      const notHom = compareNameVersion(collectedValue, rule.not_homologated);
      if (notHom.matched) {
        return { status: 'NAO_HOMOLOGADO', expected: notHom.expected, notes: 'Item nao homologado pela matriz de portabilidade' };
      }
    }

    return { status: 'EM_VALIDACAO', expected: hom.expected, notes: 'Item nao encontrado na matriz - em validacao' };
  }

  if (comparison === 'exact') {
    const hom = compareExact(collectedValue, rule.homologated || []);
    if (hom.matched) return { status: 'HOMOLOGADO', expected: hom.expected, notes: '' };

    if (rule.restricted && rule.restricted.length > 0) {
      for (const r of rule.restricted) {
        if (typeof r === 'object' && r.value) {
          if (collectedValue.trim().toLowerCase() === r.value.toLowerCase()) {
            return { status: 'HOMOLOGADO_RESTRICOES', expected: r.value, notes: r.reason || '' };
          }
        }
      }
    }

    if (rule.not_homologated && rule.not_homologated.length > 0) {
      const notHom = compareExact(collectedValue, rule.not_homologated);
      if (notHom.matched) {
        return { status: 'NAO_HOMOLOGADO', expected: notHom.expected, notes: 'Item nao homologado' };
      }
    }

    return { status: 'EM_VALIDACAO', expected: hom.expected, notes: 'Item nao encontrado na matriz - em validacao' };
  }

  if (comparison === 'numeric_min') {
    const homResult = compareNumericMin(collectedValue, rule.homologated || {});
    if (homResult.status === 'HOMOLOGADO') {
      const minVal = (rule.homologated as any)?.min;
      return { status: 'HOMOLOGADO', expected: `Minimo: ${minVal}`, notes: '' };
    }
    if (rule.restricted) {
      const restResult = compareNumericMin(collectedValue, rule.restricted);
      if (restResult.status === 'HOMOLOGADO_RESTRICOES') {
        const reason = (rule.restricted as any)?.reason || '';
        return { status: 'HOMOLOGADO_RESTRICOES', expected: `Recomendado: ${(rule.homologated as any)?.min}+`, notes: reason };
      }
    }
    if (rule.not_homologated) {
      const notHomResult = compareNumericMin(collectedValue, rule.not_homologated);
      if (notHomResult.status === 'NAO_HOMOLOGADO' || notHomResult.matched) {
        return { status: 'NAO_HOMOLOGADO', expected: `Minimo: ${(rule.homologated as any)?.min}`, notes: 'Abaixo do minimo homologado' };
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
  const homologated = items.filter(i => i.status === 'HOMOLOGADO').length;
  const restricted = items.filter(i => i.status === 'HOMOLOGADO_RESTRICOES').length;
  const score = (homologated * 100 + restricted * 60) / items.length;
  return Math.round(score);
}

export function countByStatus(items: ValidationItem[]): {
  homologated: number;
  restricted: number;
  inValidation: number;
  notHomologated: number;
  notIdentified: number;
} {
  return {
    homologated: items.filter(i => i.status === 'HOMOLOGADO').length,
    restricted: items.filter(i => i.status === 'HOMOLOGADO_RESTRICOES').length,
    inValidation: items.filter(i => i.status === 'EM_VALIDACAO').length,
    notHomologated: items.filter(i => i.status === 'NAO_HOMOLOGADO').length,
    notIdentified: items.filter(i => i.status === 'NAO_IDENTIFICADO').length,
  };
}
