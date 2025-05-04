import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Server, 
  Database, 
  Globe, 
  Coffee,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';

interface SystemInfoProps {
  systemInfo: {
    fluig_version?: string;
    os_name?: string;
    server_type?: string;
    database_name?: string;
    database_version?: string;
    server_url?: string;
    java_version?: string;
    ls_enabled?: boolean;
    solr_enabled?: boolean;
  };
}

export function SystemInfo({ systemInfo }: SystemInfoProps) {
  const {
    fluig_version,
    os_name,
    server_type,
    database_name,
    database_version,
    server_url,
    java_version,
    ls_enabled,
    solr_enabled
  } = systemInfo;

  return (
    <Card className="rounded-2xl border border-border/40 p-6 shadow-sm">
  <CardHeader className="mb-4">
    <CardTitle className="text-xl font-medium flex items-center gap-2 text-foreground">
      <Server className="h-5 w-5 text-muted-foreground" />
      Informações do Sistema
    </CardTitle>
  </CardHeader>

  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {/* Coluna 1 */}
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Info className="h-4 w-4" />
          Versão do Fluig
        </p>
        <p className="text-base text-foreground">{fluig_version || 'Não encontrado'}</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Server className="h-4 w-4" />
          Sistema Operacional
        </p>
        <p className="text-base text-foreground">{os_name || 'Não encontrado'}</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Server className="h-4 w-4" />
          Tipo de Servidor
        </p>
        <p className="text-base text-foreground">{server_type || 'Não encontrado'}</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Database className="h-4 w-4" />
          Banco de Dados
        </p>
        <p className="text-base text-foreground">
          {database_name
            ? `${database_name} (${database_version || 'Versão não encontrada'})`
            : 'Não encontrado'}
        </p>
      </div>
    </div>

    {/* Coluna 2 */}
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4" />
          URL do Servidor
        </p>
        <p className="text-base text-foreground">{server_url || 'Não encontrado'}</p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          <Coffee className="h-4 w-4" />
          Versão do Java
        </p>
        <p className="text-base text-foreground">{java_version || 'Não encontrado'}</p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            ls_enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {ls_enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          Legal Suite {ls_enabled ? 'Ativado' : 'Desativado'}
        </div>

        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            solr_enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {solr_enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          Solr {solr_enabled ? 'Ativado' : 'Desativado'}
        </div>
      </div>
    </div>
  </CardContent>
</Card>

  );
}