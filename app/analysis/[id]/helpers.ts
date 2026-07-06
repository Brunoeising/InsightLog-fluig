import { ErrorCategory } from '@/lib/types';

export const ERROR_CATEGORIES: { value: ErrorCategory; label: string; color?: string }[] = [
  { value: 'DATABASE',       label: 'Banco de Dados',         color: 'hsl(var(--chart-1))' },
  { value: 'PERMISSION',     label: 'Permissao',              color: 'hsl(var(--chart-2))' },
  { value: 'WORKFLOW',       label: 'Workflow',               color: 'hsl(var(--chart-3))' },
  { value: 'PERFORMANCE',    label: 'Performance',            color: 'hsl(var(--chart-4))' },
  { value: 'NETWORK',        label: 'Rede',                   color: 'hsl(var(--chart-5))' },
  { value: 'INFRASTRUCTURE', label: 'Infraestrutura',         color: 'hsl(210, 14%, 53%)' },
  { value: 'BPM',            label: 'BPM / Workflow',         color: 'hsl(217, 80%, 55%)' },
  { value: 'WCM',            label: 'Conteudo Web (WCM)',     color: 'hsl(142, 55%, 42%)' },
  { value: 'ECM',            label: 'Documentos (ECM)',       color: 'hsl(35, 88%, 48%)' },
  { value: 'FDN',            label: 'Foundation / Auth',      color: 'hsl(330, 60%, 52%)' },
  { value: 'INT',            label: 'Integracao (INT)',       color: 'hsl(195, 75%, 42%)' },
  { value: 'OTHER',          label: 'Outros',                 color: 'hsl(var(--muted))' },
];

export function getCategoryColor(
  category: string,
  categoryNameMap: Record<string, { name: string; color?: string }>
): string {
  const categoryEntry = categoryNameMap[category.toUpperCase()];
  return (
    categoryEntry?.color ||
    ERROR_CATEGORIES.find((cat) => cat.value === category.toUpperCase())?.color ||
    'hsl(var(--muted))'
  );
}
