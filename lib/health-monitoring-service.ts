import { supabase } from './supabase-client';

export interface HealthSnapshot {
  id?: string;
  environmentName: string;
  analysisId?: string;
  snapshotData: {
    heapUsage: number | null;
    cpuUsage: number | null;
    memoryUsage: number | null;
    diskUsage: number | null;
    errorRate?: number;
  };
  trendDirection: 'improving' | 'degrading' | 'stable';
  aiPrediction?: string;
  alertLevel: 'normal' | 'warning' | 'critical';
  createdAt?: string;
}

export interface TrendAnalysis {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  currentValue: number;
  averageValue: number;
  changePercent: number;
  alertLevel: 'normal' | 'warning' | 'critical';
}

export async function saveHealthSnapshot(snapshot: Omit<HealthSnapshot, 'id' | 'createdAt'>) {
  const { data, error } = await supabase
    .from('health_monitoring_snapshots')
    .insert({
      environment_name: snapshot.environmentName,
      analysis_id: snapshot.analysisId || null,
      snapshot_data: snapshot.snapshotData,
      trend_direction: snapshot.trendDirection,
      ai_prediction: snapshot.aiPrediction || null,
      alert_level: snapshot.alertLevel,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchHealthSnapshots(environmentName: string, days: number = 30): Promise<HealthSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('health_monitoring_snapshots')
    .select('*')
    .eq('environment_name', environmentName)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    id: row.id,
    environmentName: row.environment_name,
    analysisId: row.analysis_id,
    snapshotData: row.snapshot_data,
    trendDirection: row.trend_direction,
    aiPrediction: row.ai_prediction,
    alertLevel: row.alert_level,
    createdAt: row.created_at,
  }));
}

export function analyzeHealthTrend(snapshots: HealthSnapshot[]): TrendAnalysis[] {
  if (snapshots.length < 2) return [];

  const metrics = ['heapUsage', 'cpuUsage', 'memoryUsage', 'diskUsage'] as const;
  const results: TrendAnalysis[] = [];

  for (const metric of metrics) {
    const values = snapshots
      .map(s => s.snapshotData[metric])
      .filter((v): v is number => v !== null && v !== undefined);

    if (values.length < 2) continue;

    const currentValue = values[values.length - 1];
    const averageValue = values.reduce((a, b) => a + b, 0) / values.length;
    const recentAvg = values.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
    const olderAvg = values.slice(0, Math.max(1, values.length - 3)).reduce((a, b) => a + b, 0) / Math.max(1, values.length - 3);
    const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (changePercent > 10) direction = 'up';
    else if (changePercent < -10) direction = 'down';

    let alertLevel: 'normal' | 'warning' | 'critical' = 'normal';
    if (currentValue > 90) alertLevel = 'critical';
    else if (currentValue > 75) alertLevel = 'warning';

    if (direction === 'up' && currentValue > 70) {
      alertLevel = alertLevel === 'normal' ? 'warning' : alertLevel;
    }

    results.push({
      metric,
      direction,
      currentValue,
      averageValue: Math.round(averageValue * 10) / 10,
      changePercent: Math.round(changePercent * 10) / 10,
      alertLevel,
    });
  }

  return results;
}

export function getOverallAlertLevel(trends: TrendAnalysis[]): 'normal' | 'warning' | 'critical' {
  if (trends.some(t => t.alertLevel === 'critical')) return 'critical';
  if (trends.some(t => t.alertLevel === 'warning')) return 'warning';
  return 'normal';
}

export async function fetchEnvironmentNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('health_monitoring_snapshots')
    .select('environment_name')
    .order('created_at', { ascending: false });

  if (error) return [];
  const names = [...new Set((data || []).map((r: any) => r.environment_name))];
  return names;
}

export async function fetchEnvironmentsFromAnalyses(): Promise<string[]> {
  const { data, error } = await supabase
    .from('environment_analyses')
    .select('environment_name')
    .order('created_at', { ascending: false });

  if (error) return [];
  return [...new Set((data || []).map((r: any) => r.environment_name))];
}
