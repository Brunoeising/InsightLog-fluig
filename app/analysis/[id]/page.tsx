"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ChevronLeft,
    FileText,
    AlertTriangle,
    AlertCircle,
    CheckCircle2,
    MessageSquare,
    Search,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Gauge,
    Loader2,
    Layers,
    Sparkles
} from 'lucide-react';
import { LogAnalysisResult, LogErrorEntry, LogEntry, PerformanceIssue, ErrorCategory } from '@/lib/types';
import { ErrorDetails } from '@/components/error-details';
import { AIChat } from '@/components/ai-chat';
import { AIResponse } from '@/components/ai-response';
import { PerformanceDetails } from '@/components/performance-details';
import { SystemInfo } from '@/components/system-info';
import { AppShell } from '@/components/app-shell';
import { getCurrentUser, supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { readFullAnalysisCache, writeFullAnalysisCache, invalidateAnalysisCache } from '@/lib/analysis-prefetch-cache';

import { getCategoryColor } from './helpers';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const BATCH_SIZE = 1000;

const ERROR_CATEGORIES: { value: ErrorCategory; label: string; color?: string }[] = [
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

function formatAiGeneratedAt(date?: string | null) {
    if (!date) return null;

    return new Date(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function readJsonResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json')
        ? response.json()
        : { error: await response.text() };
}



export default function AnalysisPage() {
    const router = useRouter();
    const { toast } = useToast();
    const params = useParams();
    const analysisId = params.id as string;
    const [analysis, setAnalysis] = useState<LogAnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isRegeneratingAI, setIsRegeneratingAI] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<ErrorCategory[]>(
        ERROR_CATEGORIES.map(cat => cat.value)
    );
    const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
    const [categoryNameMap, setCategoryNameMap] = useState<Record<string, { name: string; color?: string }>>({});
    const [allExpanded, setAllExpanded] = useState(false);
    const [pageSize, setPageSize] = useState(25);
    const [currentErrorPage, setCurrentErrorPage] = useState(1);
    const [currentWarningPage, setCurrentWarningPage] = useState(1);
    const [currentPerformancePage, setCurrentPerformancePage] = useState(1);
    const [filteredErrors, setFilteredErrors] = useState<LogErrorEntry[]>([]);
    const [filteredWarnings, setFilteredWarnings] = useState<LogEntry[]>([]);
    const [filteredPerformanceIssues, setFilteredPerformanceIssues] = useState<PerformanceIssue[]>([]);
    const [groupedErrors, setGroupedErrors] = useState<Record<string, LogErrorEntry[]>>({});
    const [isCategoriesLoaded, setIsCategoriesLoaded] = useState(false);

    // Define groupErrors BEFORE the useEffect
    const groupErrors = (errors: LogErrorEntry[]): Record<string, LogErrorEntry[]> => {
        const grouped: Record<string, LogErrorEntry[]> = {};

        errors.forEach((error) => {
            const key = `${error.message}-${error.category || 'OTHER'}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(error);
        });

        return grouped;
    };

    // Update groupedErrors when filteredErrors changes
    useEffect(() => {
        setGroupedErrors(groupErrors(filteredErrors));
    }, [filteredErrors]);

    const handleSelectAll = () => {
        if (selectedCategories.length === errorCategories.length &&
            errorCategories.every(({ category }) => selectedCategories.includes(category as ErrorCategory))) {
            setSelectedCategories([]);
        } else {
            setSelectedCategories(errorCategories.map(({ category }) => category as ErrorCategory));
        }
    };

    const handleCategoryToggle = (category: ErrorCategory) => {
        setSelectedCategories((prev) =>
            prev.includes(category)
                ? prev.filter((c) => c !== category)
                : [...prev, category]
        );
    };

    const resolveCategoryName = (category: string) => {
        return categoryNameMap[category.toUpperCase()]?.name || category;
    };

    const fetchLogEntriesBatch = useCallback(async (analysisId: string, offset: number, includeCount = false) => {
        const { data, error, count } = await supabase
            .from('log_entries')
            .select(
                `
                id,
                level,
                message,
                timestamp,
                category,
                context_before,
                context_after,
                suggestion,
                category_id,
                caused_by
                `,
                includeCount ? { count: 'exact' } : undefined
            )
            .eq('analysis_id', analysisId)
            .range(offset, offset + BATCH_SIZE - 1);

        if (error) throw error;
        return { entries: data || [], total: count || 0 };
    }, []);

    const loadAnalysisData = useCallback(
        async (analysisId: string) => {
            setIsLoadingData(true);
            setIsCategoriesLoaded(false);
            try {
                const user = await getCurrentUser();
                if (!user) {
                    router.push('/auth/login');
                    return;
                }

                // Serve from session cache on revisits — skip all Supabase queries
                const cached = readFullAnalysisCache(analysisId);
                if (cached) {
                    setCategoryNameMap(cached.categoryMap);
                    setAnalysis(cached.analysis);
                    setFilteredErrors(cached.analysis.errors || []);
                    setFilteredWarnings(cached.analysis.warnings || []);
                    setFilteredPerformanceIssues(cached.analysis.performanceIssues || []);
                    const allCatKeys = [
                        ...ERROR_CATEGORIES.map(cat => cat.value),
                        ...Object.keys(cached.categoryMap).map(k => k as ErrorCategory),
                    ].filter((v, i, a) => a.indexOf(v) === i);
                    setSelectedCategories(allCatKeys);
                    setIsCategoriesLoaded(true);
                    return;
                }

                const { data: analysisData, error: analysisError } = await supabase
                    .from('log_analyses')
                    .select(`
                        id,
                        file_name,
                        file_path,
                        file_url,
                        uploaded_at,
                        error_count,
                        warning_count,
                        processing_status,
                        processing_error,
                        total_entries_in_file,
                        total_errors_in_file,
                        total_warnings_in_file,
                        total_performance_issues_in_file,
                        parsed_entries_count,
                        ai_status,
                        ai_generated_at,
                        ai_generation_in_progress,
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
                    `)
                    .eq('id', analysisId)
                    .single();

                if (analysisError || !analysisData) {
                    router.push('/history');
                    return;
                }

                const processingStatus = analysisData.processing_status || 'COMPLETED';
                const isStillProcessing = !['COMPLETED', 'FAILED'].includes(processingStatus);
                let allErrors: LogErrorEntry[] = [];
                let allWarnings: LogEntry[] = [];
                let offset = 0;
                let hasMore = true;
                let totalEntries = 0;

                let performanceData: PerformanceIssue[] = [];

                if (!isStillProcessing) {
                    const { data: fetchedPerformanceData } = await supabase
                        .from('log_performance_issues')
                        .select('*')
                        .eq('analysis_id', analysisId);
                    performanceData = fetchedPerformanceData || [];

                    while (hasMore) {
                        const { entries, total } = await fetchLogEntriesBatch(analysisId, offset, offset === 0);
                        if (offset === 0) {
                            totalEntries = total;
                        }
                        const batchErrors = entries
                            .filter((entry) => entry.level === 'ERROR')
                            .map((error) => ({
                                ...error,
                                contextBefore: error.context_before || [],
                                contextAfter: error.context_after || [],
                                causedBy: error.caused_by || [],
                            }));
                        const batchWarnings = entries
                            .filter((entry) => entry.level === 'WARN')
                            .map((warning) => ({
                                level: warning.level,
                                message: warning.message,
                                timestamp: warning.timestamp,
                            }));
                        allErrors = [...allErrors, ...batchErrors];
                        allWarnings = [...allWarnings, ...batchWarnings];
                        offset += BATCH_SIZE;
                        hasMore = entries.length === BATCH_SIZE && offset < totalEntries;
                    }
                }
                const [customCategoriesResult, defaultCategoriesResult] = await Promise.all([
                    supabase
                        .from('error_categories')
                        .select('id, name, terms, color')
                        .eq('user_id', user.id),
                    supabase
                        .from('default_error_categories')
                        .select('id, name, terms, color'),
                ]);
                const customCategories = customCategoriesResult.data || [];
                const defaultCategories = defaultCategoriesResult.data || [];
                const allCategories = [...(customCategories || []), ...(defaultCategories || [])];
                const nameMap: Record<string, { name: string; color?: string }> = {};
                for (const cat of allCategories) {
                    nameMap[cat.name.toUpperCase()] = { name: cat.name, color: cat.color };
                }
                setCategoryNameMap(nameMap);
                setAnalysis({
                    id: analysisData.id,
                    fileName: analysisData.file_name,
                    filePath: analysisData.file_path || undefined,
                    fileUrl: analysisData.file_url || undefined,
                    uploadedAt: analysisData.uploaded_at,
                    errorCount: analysisData.error_count,
                    warningCount: analysisData.warning_count,
                    summary: analysisData.summary || 'Resumo indisponível para esta análise.',
                    suggestions: analysisData.suggestions || [],
                    errors: allErrors,
                    warnings: allWarnings,
                    performanceIssues: performanceData || [],
                    processingStatus: processingStatus as any,
                    processingError: analysisData.processing_error,
                    totalEntriesInFile: analysisData.total_entries_in_file || undefined,
                    totalErrorsInFile: analysisData.total_errors_in_file || undefined,
                    totalWarningsInFile: analysisData.total_warnings_in_file || undefined,
                    totalPerformanceIssuesInFile: analysisData.total_performance_issues_in_file || undefined,
                    parsedEntriesCount: analysisData.parsed_entries_count || undefined,
                    aiStatus: analysisData.ai_status as any,
                    aiGeneratedAt: analysisData.ai_generated_at,
                    aiGenerationInProgress: analysisData.ai_generation_in_progress,
                    systemInfo: {
                        fluig_version: analysisData.fluig_version || undefined,
                        os_name: analysisData.os_name || undefined,
                        server_type: analysisData.server_type || undefined,
                        database_name: analysisData.database_name || undefined,
                        database_version: analysisData.database_version || undefined,
                        server_url: analysisData.server_url || undefined,
                        java_version: analysisData.java_version || undefined,
                        solr_enabled: analysisData.solr_enabled ?? undefined,
                        ls_enabled: analysisData.ls_enabled ?? undefined,
                    },
                });
                
                setFilteredErrors(allErrors);
                setFilteredWarnings(allWarnings);
                setFilteredPerformanceIssues(performanceData || []);
                // Update selectedCategories with all categories (standard and custom)
                setSelectedCategories([
                    ...ERROR_CATEGORIES.map(cat => cat.value),
                    ...allCategories.map(cat => cat.name.toUpperCase() as ErrorCategory)
                ].filter((value, index, self) => self.indexOf(value) === index)); // Remove duplicates
                setIsCategoriesLoaded(true);

                // Write to session cache so re-visits are instant
                const builtAnalysis: LogAnalysisResult = {
                    id: analysisData.id,
                    fileName: analysisData.file_name,
                    filePath: analysisData.file_path || undefined,
                    fileUrl: analysisData.file_url || undefined,
                    uploadedAt: analysisData.uploaded_at,
                    errorCount: analysisData.error_count,
                    warningCount: analysisData.warning_count,
                    summary: analysisData.summary || 'Resumo indisponível para esta análise.',
                    suggestions: analysisData.suggestions || [],
                    errors: allErrors,
                    warnings: allWarnings,
                    performanceIssues: performanceData || [],
                    processingStatus: processingStatus as any,
                    processingError: analysisData.processing_error,
                    totalEntriesInFile: analysisData.total_entries_in_file || undefined,
                    totalErrorsInFile: analysisData.total_errors_in_file || undefined,
                    totalWarningsInFile: analysisData.total_warnings_in_file || undefined,
                    totalPerformanceIssuesInFile: analysisData.total_performance_issues_in_file || undefined,
                    parsedEntriesCount: analysisData.parsed_entries_count || undefined,
                    aiStatus: analysisData.ai_status as any,
                    aiGeneratedAt: analysisData.ai_generated_at,
                    aiGenerationInProgress: analysisData.ai_generation_in_progress,
                    systemInfo: {
                        fluig_version: analysisData.fluig_version || undefined,
                        os_name: analysisData.os_name || undefined,
                        server_type: analysisData.server_type || undefined,
                        database_name: analysisData.database_name || undefined,
                        database_version: analysisData.database_version || undefined,
                        server_url: analysisData.server_url || undefined,
                        java_version: analysisData.java_version || undefined,
                        solr_enabled: analysisData.solr_enabled ?? undefined,
                        ls_enabled: analysisData.ls_enabled ?? undefined,
                    },
                };
                writeFullAnalysisCache(builtAnalysis, nameMap);
            } catch (error) {
                console.error('Error loading analysis data:', error);
            } finally {
                setIsLoadingData(false);
                setIsLoading(false);
            }
        },
        [fetchLogEntriesBatch, router]
    );

    useEffect(() => {
        if (!analysisId) {
            router.push('/');
            return;
        }
        loadAnalysisData(analysisId);
    }, [analysisId, router, loadAnalysisData]);

    const handleRegenerateSummary = async () => {
        if (!analysis?.id) return;

        setIsRegeneratingAI(true);
        setAnalysis((current) => current
            ? { ...current, aiStatus: 'PROCESSING', aiGenerationInProgress: true }
            : current
        );

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setAnalysis((current) => current
                    ? { ...current, aiGenerationInProgress: false }
                    : current
                );
                router.push('/auth/login');
                return;
            }

            const response = await fetch('/api/ai/regenerate-summary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ analysisId: analysis.id }),
            });
            const result = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(result.error || `Falha ao gerar resumo com IA (${response.status}).`);
            }

            setAnalysis((current) => {
                if (!current) return current;
                const updated = {
                    ...current,
                    summary: result.summary ?? current.summary,
                    suggestions: result.suggestions ?? current.suggestions,
                    aiStatus: result.aiStatus ?? 'COMPLETED',
                    aiGeneratedAt: result.aiGeneratedAt ?? new Date().toISOString(),
                    aiGenerationInProgress: false,
                };
                // Invalidate session cache so re-visits fetch fresh data from Supabase
                invalidateAnalysisCache(current.id!);
                return updated;
            });

            toast({
                title: 'Resumo gerado com IA',
                description: 'A análise foi atualizada com um resumo detalhado.',
            });
        } catch (error: any) {
            setAnalysis((current) => current
                ? { ...current, aiStatus: 'FAILED', aiGenerationInProgress: false }
                : current
            );
            toast({
                title: 'Erro ao gerar resumo com IA',
                description: error?.message || 'Não foi possível gerar o resumo neste momento.',
                variant: 'destructive',
            });
        } finally {
            setIsRegeneratingAI(false);
        }
    };

    // Filter function
    useEffect(() => {
        if (!analysis?.errors) return;

        const term = searchTerm.toLowerCase();

        // Filter errors
        const errors = analysis.errors.filter(error =>
            selectedCategories.includes(error.category) &&
            (
                error.message.toLowerCase().includes(term) ||
                (error.category || '').toLowerCase().includes(term) ||
                (error.contextBefore || []).some(ctx => ctx.toLowerCase().includes(term)) ||
                (error.contextAfter || []).some(ctx => ctx.toLowerCase().includes(term)) ||
                (error.causedBy || []).some((cause: string) => cause.toLowerCase().includes(term))

            )
        );

        setFilteredErrors(errors);
        setCurrentErrorPage(1);

        // Filter warnings
        const warnings = analysis.warnings?.filter(warning =>
            warning.message.toLowerCase().includes(term)
        ) || [];
        setFilteredWarnings(warnings);
        setCurrentWarningPage(1);

        // Filter performance issues
        const performanceIssues = analysis.performanceIssues?.filter(issue =>
            issue.message.toLowerCase().includes(term) ||
            issue.type.toLowerCase().includes(term) ||
            (issue.context || '').toLowerCase().includes(term)
        ) || [];
        setFilteredPerformanceIssues(performanceIssues);
        setCurrentPerformancePage(1);
    }, [searchTerm, analysis, selectedCategories]);

    const toggleAllErrors = () => {
        if (allExpanded) {
            setExpandedErrors(new Set());
        } else {
            setExpandedErrors(new Set(Object.keys(groupedErrors)));
        }
        setAllExpanded(!allExpanded);
    };

    if (isLoading) {
        return (
            <AppShell>
                <div className="mx-auto max-w-7xl space-y-6">
                    {/* Header skeleton */}
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-9 rounded-md" />
                            <Skeleton className="h-6 w-56" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-28 rounded-full" />
                        </div>
                    </div>

                    {/* System info skeleton */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 rounded-xl" />
                        ))}
                    </div>

                    {/* Summary + categories skeleton */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="md:col-span-2 rounded-2xl border p-6 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-28" />
                                    <Skeleton className="h-4 w-44" />
                                </div>
                                <Skeleton className="h-9 w-36 rounded-md" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-4/6" />
                            <div className="mt-4 space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                        </div>
                        <div className="rounded-2xl border p-6 space-y-4">
                            <Skeleton className="h-5 w-36" />
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-4 w-8" />
                                    </div>
                                    <Skeleton className="h-2 w-full rounded-full" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Search skeleton */}
                    <Skeleton className="h-10 w-full rounded-md mb-4" />

                    {/* Tabs skeleton */}
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-9 w-28 rounded-md" />
                            ))}
                        </div>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="rounded-xl border p-4 space-y-2">
                                <div className="flex items-start gap-3">
                                    <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-32" />
                                        <Skeleton className="h-5 w-20 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </AppShell>
        );
    }

    if (!analysis) {
        return null;
    }

    const getErrorCountByCategory = () => {
        const counts: Record<string, number> = {};

        if (!analysis?.errors) return [];

        analysis.errors.forEach((error) => {
            const category = error.category || 'OTHER';
            counts[category] = (counts[category] || 0) + 1;
        });

        return Object.entries(counts).map(([category, count]) => ({
            category: categoryNameMap[category.toUpperCase()]?.name || category,
            count,
        }));
    };

    const errorCategories = getErrorCountByCategory();

    // Pagination calculations
    const totalErrorPages = Math.ceil(Object.keys(groupedErrors).length / pageSize);
    const totalWarningPages = Math.ceil(filteredWarnings.length / pageSize);
    const totalPerformancePages = Math.ceil(filteredPerformanceIssues.length / pageSize);

    const paginatedErrors = filteredErrors.slice(
        (currentErrorPage - 1) * pageSize,
        currentErrorPage * pageSize
    );

    const paginatedWarnings = filteredWarnings.slice(
        (currentWarningPage - 1) * pageSize,
        currentWarningPage * pageSize
    );

    const paginatedPerformanceIssues = filteredPerformanceIssues.slice(
        (currentPerformancePage - 1) * pageSize,
        currentPerformancePage * pageSize
    );

    const PaginationControls = ({
        currentPage,
        totalPages,
        onPageChange
    }: {
        currentPage: number;
        totalPages: number;
        onPageChange: (page: number) => void;
    }) => (
        <div className="flex items-center justify-between mt-4 border-t pt-4">
            <div className="flex items-center gap-2">
                <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                        setPageSize(Number(value));
                        onPageChange(1);
                    }}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Registros por página" />
                    </SelectTrigger>
                    <SelectContent>
                        {PAGE_SIZE_OPTIONS.map(size => (
                            <SelectItem key={size} value={size.toString()}>
                                {size} registros por página
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                >
                    <ChevronsLeft className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                >
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    const isProcessing = analysis.processingStatus && !['COMPLETED', 'FAILED'].includes(analysis.processingStatus);
    const isAiGenerating = isRegeneratingAI || !!analysis.aiGenerationInProgress;
    const canGenerateAiSummary = !isProcessing && analysis.errorCount > 0 && !isAiGenerating;
    const aiGeneratedAt = formatAiGeneratedAt(analysis.aiGeneratedAt);

    return (
        <AppShell>
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                    <div className="flex text-muted-foreground items-center gap-2 mb-4 md:mb-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/history')}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-xl font-bold">Resultados da Análise de Log</h1>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <div className="text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <FileText className="h-4 w-4" />
                                {analysis.fileName}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Badge variant="outline" className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-destructive" />
                                {analysis.errorCount} Erros
                            </Badge>

                            <Badge variant="outline" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-chart-4" />
                                {analysis.warningCount} Avisos
                            </Badge>

                            <Badge variant="outline" className="flex items-center gap-1">
                                <Gauge className="h-3 w-3 text-chart-2" />
                                {filteredPerformanceIssues.length} Problemas de Performance
                            </Badge>
                        </div>
                    </div>
                </div>

                {(isProcessing || analysis.processingStatus === 'FAILED') && (
                    <Card className="mb-6 border-primary/20 bg-primary/5">
                        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-start gap-3">
                                <Loader2 className={`mt-0.5 h-5 w-5 text-primary ${isProcessing ? 'animate-spin' : ''}`} />
                                <div>
                                    <h2 className="font-semibold text-foreground">
                                        {analysis.processingStatus === 'FAILED' ? 'Processamento falhou' : 'Processamento em andamento'}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {analysis.processingStatus === 'FAILED'
                                            ? analysis.processingError || 'Não foi possível concluir a análise local.'
                                            : 'O arquivo grande está sendo lido localmente e os diagnósticos estão sendo persistidos em lotes.'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {analysis.parsedEntriesCount || 0} entradas processadas
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="mb-6">
                    <SystemInfo systemInfo={analysis.systemInfo || {}} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    {/* Resumo Card */}
                    <Card className="md:col-span-2 rounded-2xl border border-border/40 p-2 shadow-sm">
                        <CardHeader className="mb-2">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-primary" />
                                        <CardTitle className="text-xl uppercase text-foreground">Resumo</CardTitle>
                                    </div>
                                    <CardDescription className="text-sm text-muted-foreground">
                                        Visão geral dos problemas do log
                                    </CardDescription>
                                    {aiGeneratedAt && (
                                        <p className="text-xs text-muted-foreground">
                                            Resumo atualizado em {aiGeneratedAt}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRegenerateSummary}
                                    disabled={!canGenerateAiSummary}
                                    title={analysis.errorCount === 0 ? 'Não há erros persistidos para análise por IA.' : undefined}
                                    className="shrink-0 gap-2"
                                >
                                    {isAiGenerating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    {isAiGenerating
                                        ? 'Gerando...'
                                        : analysis.aiGeneratedAt
                                            ? 'Atualizar resumo com IA'
                                            : 'Gerar resumo com IA'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <AIResponse content={analysis.summary} />

                            {analysis.suggestions && analysis.suggestions.length > 0 && (
                                <div className="mt-6 space-y-3">
                                    <h4 className="font-medium text-base text-foreground">Ações Sugeridas:</h4>
                                    <ul className="space-y-2">
                                        {analysis.suggestions.map((suggestion, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-sm text-foreground">{suggestion}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Categorias de Erro Card */}
                    <Card className="rounded-2xl border border-border/40 p-6 shadow-sm">
                        <CardHeader className="mb-4">
                            <div className="flex items-center gap-2">
                                <Layers className="w-5 h-5 text-primary" />
                                <CardTitle className="text-xl uppercase text-foreground">Categorias de Erro</CardTitle>
                            </div>
                            <CardDescription className="text-sm text-muted-foreground">
                                Distribuição de erros por tipo
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isCategoriesLoaded && Object.keys(categoryNameMap).length > 0 ? (
                                <div className="space-y-4">
                                    {/* Checkbox Selecionar Tudo */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between pl-2">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="select-all"
                                                    checked={
                                                        errorCategories.length > 0 &&
                                                        errorCategories.every(({ category }) =>
                                                            selectedCategories.includes(category as ErrorCategory)
                                                        )
                                                    }
                                                    onCheckedChange={handleSelectAll}
                                                />
                                                <label
                                                    htmlFor="select-all"
                                                    className="text-sm font-medium cursor-pointer text-foreground"
                                                >
                                                    Selecionar Tudo
                                                </label>
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                                {errorCategories.reduce((acc, cur) => acc + cur.count, 0)}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                                            <div
                                                className="h-full"
                                                style={{
                                                    width: '100%',
                                                    backgroundColor: 'hsl(var(--primary))',
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {/* Lista de Categorias */}
                                    {errorCategories.map(({ category, count }) => (
                                        <div key={category} className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 pl-2">
                                                    <Checkbox
                                                        id={`category-${category}`}
                                                        checked={selectedCategories.includes(category as ErrorCategory)}
                                                        onCheckedChange={() => handleCategoryToggle(category as ErrorCategory)}
                                                    />
                                                    <label
                                                        htmlFor={`category-${category}`}
                                                        className="text-sm font-medium cursor-pointer text-foreground"
                                                    >
                                                        {resolveCategoryName(category)}
                                                    </label>
                                                </div>
                                                <span className="text-sm text-muted-foreground">{count}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                                                <div
                                                    className="h-full"
                                                    style={{
                                                        width: `${(count / analysis.errorCount) * 100}%`,
                                                        backgroundColor: getCategoryColor(category, categoryNameMap),
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Nenhuma categoria encontrada...</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="mb-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar em erros, avisos e problemas de performance..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>

                {isLoadingData ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Carregando dados da análise...</p>
                        </div>
                    </div>
                ) : (
                    <Tabs defaultValue="errors" className="mb-8">
                        <TabsList>
                            <TabsTrigger value="errors" className="flex items-center gap-1">
                                <AlertCircle className="h-4 w-4" />
                                Erros {filteredErrors.length > 0 && `(${filteredErrors.length})`}
                            </TabsTrigger>
                            <TabsTrigger value="warnings" className="flex items-center gap-1">
                                <AlertTriangle className="h-4 w-4" />
                                Avisos {filteredWarnings.length > 0 && `(${filteredWarnings.length})`}
                            </TabsTrigger>
                            <TabsTrigger value="performance" className="flex items-center gap-1">
                                <Gauge className="h-4 w-4" />
                                Performance {filteredPerformanceIssues.length > 0 && `(${filteredPerformanceIssues.length})`}
                            </TabsTrigger>
                            <TabsTrigger value="chat" className="flex items-center gap-1">
                                <MessageSquare className="h-4 w-4" />
                                Perguntar à IA
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="errors" className="mt-6">
                            <div className="space-y-6">
                                {filteredErrors.length > 0 && (
                                    <div className="flex justify-end mb-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={toggleAllErrors}
                                            className="gap-2"
                                        >
                                            {allExpanded ? 'Recolher Todos' : 'Expandir Todos'}
                                        </Button>
                                    </div>
                                )}
                                {Object.entries(groupedErrors).length > 0 ? (
                                    Object.entries(groupedErrors)
                                        .slice(
                                            (currentErrorPage - 1) * pageSize,
                                            currentErrorPage * pageSize
                                        )
                                        .map(([key, errors], groupIndex) => {
                                            const representativeError = errors[0];
                                            const isExpanded = expandedErrors.has(key);
                                            const categoryColor = getCategoryColor(
                                                representativeError.category || 'OTHER',
                                                categoryNameMap
                                            );
                                            return (
                                                <Card
                                                    key={key}
                                                    style={{ borderLeft: `4px solid ${categoryColor}` }}
                                                >
                                                    <CardContent className="p-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-start gap-3">
                                                                <AlertCircle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
                                                                <div>
                                                                    <p className="text-sm font-medium">
                                                                        {representativeError.message}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        Categoria:{' '}
                                                                        {resolveCategoryName(
                                                                            representativeError.category || 'OTHER'
                                                                        )}
                                                                    </p>
                                                                    <Badge variant="outline" className="mt-1">
                                                                        {errors.length} ocorrência
                                                                        {errors.length > 1 ? 's' : ''}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setExpandedErrors((prev) => {
                                                                        const next = new Set(prev);
                                                                        if (isExpanded) {
                                                                            next.delete(key);
                                                                        } else {
                                                                            next.add(key);
                                                                        }
                                                                        return next;
                                                                    });
                                                                }}
                                                            >
                                                                {isExpanded ? 'Recolher' : 'Expandir'}
                                                            </Button>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="mt-4 space-y-4">
                                                                {errors.map((error, index) => (
                                                                    <ErrorDetails
                                                                        key={index}
                                                                        error={error}
                                                                        index={
                                                                            (currentErrorPage - 1) * pageSize +
                                                                            groupIndex * pageSize +
                                                                            index
                                                                        }
                                                                        isExpanded={true}
                                                                        onToggle={() => { }}
                                                                        categoryNameMap={categoryNameMap}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            );
                                        })
                                ) : (
                                    <Card>
                                        <CardContent className="p-6 text-center text-muted-foreground">
                                            {searchTerm
                                                ? 'Nenhum erro encontrado para sua busca.'
                                                : 'Nenhum erro encontrado.'}
                                        </CardContent>
                                    </Card>
                                )}
                                {Object.keys(groupedErrors).length > 0 && (
                                    <PaginationControls
                                        currentPage={currentErrorPage}
                                        totalPages={totalErrorPages}
                                        onPageChange={setCurrentErrorPage}
                                    />
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="warnings" className="mt-6">
                            <div className="space-y-6">
                                {paginatedWarnings.map((warning, index) => (
                                    <Card key={index}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="h-5 w-5 text-chart-4 mt-1 flex-shrink-0" />
                                                <div>
                                                    <p className="text-sm mb-1">{warning.message}</p>
                                                    <p className="text-xs text-muted-foreground">{warning.timestamp}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                {filteredWarnings.length === 0 && (
                                    <Card>
                                        <CardContent className="p-6 text-center text-muted-foreground">
                                            {searchTerm ? "Nenhum aviso encontrado para sua busca." : "Nenhum aviso encontrado."}
                                        </CardContent>
                                    </Card>
                                )}
                                {filteredWarnings.length > 0 && (
                                    <PaginationControls
                                        currentPage={currentWarningPage}
                                        totalPages={totalWarningPages}
                                        onPageChange={setCurrentWarningPage}
                                    />
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="performance" className="mt-6">
                            <div className="space-y-6">
                                {paginatedPerformanceIssues.map((issue, index) => (
                                    <PerformanceDetails
                                        key={index}
                                        issue={issue}
                                        index={(currentPerformancePage - 1) * pageSize + index}
                                    />
                                ))}
                                {filteredPerformanceIssues.length === 0 && (
                                    <Card>
                                        <CardContent className="p-6 text-center text-muted-foreground">
                                            {searchTerm ? "Nenhum problema de performance encontrado para sua busca." : "Nenhum problema de performance encontrado."}
                                        </CardContent>
                                    </Card>
                                )}
                                {filteredPerformanceIssues.length > 0 && (
                                    <PaginationControls
                                        currentPage={currentPerformancePage}
                                        totalPages={totalPerformancePages}
                                        onPageChange={setCurrentPerformancePage}
                                    />
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="chat" className="mt-6">
                            <AIChat analysisId={analysis.id || analysisId} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </AppShell>
    );
}

