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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Server className="h-5 w-5" />
          Informações do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Info className="h-4 w-4" />
              Versão do Fluig
            </h4>
            <p className="text-sm text-muted-foreground">
              {fluig_version || 'Não encontrado'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Server className="h-4 w-4" />
              Sistema Operacional
            </h4>
            <p className="text-sm text-muted-foreground">
              {os_name || 'Não encontrado'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Server className="h-4 w-4" />
              Tipo de Servidor
            </h4>
            <p className="text-sm text-muted-foreground">
              {server_type || 'Não encontrado'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Database className="h-4 w-4" />
              Banco de Dados
            </h4>
            <p className="text-sm text-muted-foreground">
              {database_name ? `${database_name} (${database_version || 'Versão não encontrada'})` : 'Não encontrado'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Globe className="h-4 w-4" />
              URL do Servidor
            </h4>
            <p className="text-sm text-muted-foreground">
              {server_url || 'Não encontrado'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
              <Coffee className="h-4 w-4" />
              Versão do Java
            </h4>
            <p className="text-sm text-muted-foreground">
              {java_version || 'Não encontrado'}
            </p>
          </div>

          <div className="flex gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              {ls_enabled ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
              Legal Suite {ls_enabled ? 'Ativado' : 'Desativado'}
            </Badge>

            <Badge variant="outline" className="flex items-center gap-1">
              {solr_enabled ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
              Solr {solr_enabled ? 'Ativado' : 'Desativado'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}