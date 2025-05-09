import { ErrorCategory } from '@/lib/types';

export const ERROR_CATEGORIES: { value: ErrorCategory; label: string; color?: string }[] = [
  { value: 'DATABASE', label: 'Banco de Dados', color: 'hsl(var(--chart-1))' },
  { value: 'PERMISSION', label: 'Permissão', color: 'hsl(var(--chart-2))' },
  { value: 'WORKFLOW', label: 'Workflow', color: 'hsl(var(--chart-3))' },
  { value: 'PERFORMANCE', label: 'Performance', color: 'hsl(var(--chart-4))' },
  { value: 'NETWORK', label: 'Rede', color: 'hsl(var(--chart-5))' },
  { value: 'INFRASTRUCTURE', label: 'Infraestrutura', color: 'hsl(var(--chart-6))' },
  { value: 'OTHER', label: 'Outros', color: 'hsl(var(--muted))' },
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
