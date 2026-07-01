'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertCircle,
  BarChart2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Database,
  FileText,
  Search,
  Server,
  Upload,
} from 'lucide-react';
import { LogAnalysisResult, SystemInfo } from '@/lib/types';
import { getCurrentUser, supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { AppShell } from '@/components/app-shell';
import { UploadButton } from '@/components/upload-button';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Últimos 7 dias', days: 7 },
  { value: '30d', label: 'Últimos 30 dias', days: 30 },
  { value: '90d', label: 'Últimos 90 dias', days: 90 },
  { value: 'all', label: 'Todo o histórico', days: null },
] as const;

type DateRange = typeof DATE_RANGE_OPTIONS[number]['value'];

type HistoryAnalysis = LogAnalysisResult & {
  systemInfo?: SystemInfo;
};

function formatDate(date: string) {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateThreshold(range: DateRange) {
  const option = DATE_RANGE_OPTIONS.find((item) => item.value === range);
  if (!option?.days) return null;

  const date = new Date();
  date.setDate(date.getDate() - option.days);
  return date.toISOString();
}

function CompactSystemInfo({ systemInfo }: { systemInfo?: SystemInfo }) {
  const items = [
    { label: 'Fluig', value: systemInfo?.fluig_version, icon: FileText },
    { label: 'Servidor', value: systemInfo?.server_type || systemInfo?.os_name, icon: Server },
    { label: 'Banco', value: systemInfo?.database_name, icon: Database },
  ].filter((item) => item.value);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Informações de ambiente não identificadas neste log.
      </div>
    );
  }

  return (
 <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
  {items.map((item) => {
    const Icon = item.icon;
    return (
      <div
        key={item.label}
        title={item.value}
        className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 transition-colors hover:bg-muted/50"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="truncate text-xs text-foreground">{item.value}</p>
        </div>
      </div>
    );
  })}
</div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<HistoryAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAnalyses, setTotalAnalyses] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    async function fetchAnalyses() {
      setIsLoading(true);

      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push('/auth/login');
          return;
        }

        const from = (currentPage - 1) * pageSize;
        const to = from + pageSize - 1;
        const dateThreshold = getDateThreshold(dateRange);
        const trimmedSearch = searchTerm.trim();

        let query = supabase
          .from('log_analyses')
          .select(
            `
            id,
            fileName:file_name,
            uploadedAt:uploaded_at,
            errorCount:error_count,
            warningCount:warning_count,
            summary,
            suggestions,
            fluig_version,
            os_name,
            server_type,
            database_name,
            database_version,
            server_url,
            java_version,
            solr_enabled,
            ls_enabled
          `,
            { count: 'planned' }
          )
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false })
          .range(from, to);

        if (dateThreshold) {
          query = query.gte('uploaded_at', dateThreshold);
        }

        if (trimmedSearch) {
          query = query.ilike('file_name', `%${trimmedSearch}%`);
        }

        const { data: analysesData, error: analysesError, count } = await query;

        if (analysesError) throw analysesError;

        setTotalAnalyses(count || 0);
        setAnalyses((analysesData || []).map((item) => ({
          ...item,
          errors: [],
          warnings: [],
          performanceIssues: [],
          systemInfo: {
            fluig_version: item.fluig_version,
            os_name: item.os_name,
            server_type: item.server_type,
            database_name: item.database_name,
            database_version: item.database_version,
            server_url: item.server_url,
            java_version: item.java_version,
            solr_enabled: item.solr_enabled,
            ls_enabled: item.ls_enabled,
          },
        })));
      } catch (error) {
        toast({
          title: 'Erro ao carregar histórico',
          description: 'Não foi possível carregar o histórico de análises.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalyses();
  }, [toast, router, currentPage, pageSize, searchTerm, dateRange]);

  const totalPages = Math.max(1, Math.ceil(totalAnalyses / pageSize));
  const visibleRange = useMemo(() => {
    if (totalAnalyses === 0) return '0 registros';
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalAnalyses);
    return `${start}-${end} de ${totalAnalyses}`;
  }, [currentPage, pageSize, totalAnalyses]);

  const updateSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const updateDateRange = (value: DateRange) => {
    setDateRange(value);
    setCurrentPage(1);
  };

  const handleAnalysisSelect = (analysis: HistoryAnalysis) => {
    router.push(`/analysis/${analysis.id}`);
  };

  return (
    <AppShell contentClassName="bg-gradient-to-b from-background via-background to-secondary/20">
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border bg-card p-6 shadow-sm md:p-7">         
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
                Histórico e análise de logs
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                Consulte análises anteriores, filtre arquivos recentes e envie novos logs para diagnóstico técnico.
              </p>
            </div>
          </div>

          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="p-5 md:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Nova análise</h2>
                  <p className="text-xs text-muted-foreground">Envie arquivos .log de até 50MB</p>
                </div>
              </div>
              <UploadButton />
            </CardContent>
          </Card>
        </section>

        <Card className="shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Buscar por nome do arquivo"
                  className="pl-9"
                />
              </div>
              <Select value={dateRange} onValueChange={(value) => updateDateRange(value as DateRange)}>
                <SelectTrigger>
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Itens por página" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size.toString()}>{size} por página</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="flex min-h-[280px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </CardContent>
          </Card>
        ) : analyses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground opacity-30" />
              <h2 className="text-xl font-semibold text-foreground">Nenhuma análise encontrada</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Ajuste os filtros ou envie um novo arquivo de log para iniciar um diagnóstico.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {analyses.map((analysis) => (
                <Card
                  key={analysis.id}
                  className="group cursor-pointer border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  onClick={() => handleAnalysisSelect(analysis)}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-4">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-foreground">{analysis.fileName}</h3>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(analysis.uploadedAt)}
                            </p>
                          </div>
                        </div>

                        <CompactSystemInfo systemInfo={analysis.systemInfo} />
                      </div>

                      <div className="flex shrink-0 flex-col gap-3 lg:items-end">
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Badge variant="destructive" className="gap-1.5 px-2.5 py-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {analysis.errorCount} erro{analysis.errorCount !== 1 ? 's' : ''}
                          </Badge>
                          <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
                            <Clock className="h-3.5 w-3.5" />
                            {analysis.warningCount} alerta{analysis.warningCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-2 lg:w-auto"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleAnalysisSelect(analysis);
                          }}
                        >
                          <BarChart2 className="h-4 w-4" />
                          Ver análise
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <Card>
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">{visibleRange}</p>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-24 text-center text-sm text-muted-foreground">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
