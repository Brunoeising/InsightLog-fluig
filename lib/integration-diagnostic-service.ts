import { supabase } from './supabase-client';

interface IntegrationPattern {
  pattern: RegExp;
  type: string;
  diagnosis: string;
  steps: string[];
}

const INTEGRATION_PATTERNS: IntegrationPattern[] = [
  {
    pattern: /SOAPFaultException|Marshalling Error/i,
    type: 'SOAP_MARSHALLING',
    diagnosis: 'Erro de marshalling SOAP indica incompatibilidade entre o WSDL esperado e o payload enviado/recebido.',
    steps: [
      'Verificar se o WSDL foi atualizado apos mudancas no servico',
      'Reimportar o WSDL no administrador do Fluig',
      'Verificar encoding do request (deve ser UTF-8)',
      'Validar o XML de request contra o schema do WSDL',
      'Verificar se campos obrigatorios estao sendo enviados',
    ],
  },
  {
    pattern: /Connection refused|ConnectException|ECONNREFUSED/i,
    type: 'CONNECTION_REFUSED',
    diagnosis: 'O endpoint remoto recusou a conexao. O servico pode estar offline ou a porta esta incorreta.',
    steps: [
      'Verificar se o servico remoto esta rodando e acessivel',
      'Testar conectividade: telnet [host] [porta] a partir do servidor Fluig',
      'Verificar regras de firewall entre o Fluig e o endpoint',
      'Confirmar que a URL e porta estao corretas no cadastro do servico',
      'Verificar se nao ha proxy bloqueando a conexao',
    ],
  },
  {
    pattern: /timeout|SocketTimeoutException|Read timed out|connect timed out/i,
    type: 'TIMEOUT',
    diagnosis: 'A requisicao excedeu o tempo limite de espera. O servico remoto pode estar sobrecarregado ou lento.',
    steps: [
      'Verificar o tempo de resposta do endpoint isoladamente (Postman/curl)',
      'Aumentar o timeout na configuracao do servico no Fluig',
      'Verificar carga no servidor remoto',
      'Verificar se a rede entre os servidores esta estavel',
      'Considerar implementar retry com backoff no dataset/evento',
    ],
  },
  {
    pattern: /SSL|TLS|certificate|PKIX|handshake/i,
    type: 'SSL_ERROR',
    diagnosis: 'Erro de SSL/TLS indica problema com certificados ou incompatibilidade de protocolo.',
    steps: [
      'Importar o certificado do endpoint no keystore do Java: keytool -import -trustcacerts -keystore [JAVA_HOME]/lib/security/cacerts -file cert.cer',
      'Verificar se o certificado nao esta expirado',
      'Verificar compatibilidade de versao TLS (Fluig suporta TLS 1.2+)',
      'Se auto-assinado: adicionar ao truststore do JBoss/WildFly',
      'Reiniciar o Fluig apos importar certificados',
    ],
  },
  {
    pattern: /401|Unauthorized|Authentication failed|invalid credentials|login failed/i,
    type: 'AUTH_FAILURE',
    diagnosis: 'Falha de autenticacao. As credenciais configuradas podem estar incorretas ou expiradas.',
    steps: [
      'Verificar usuario e senha configurados no servico',
      'Testar as credenciais diretamente no endpoint (Postman/curl)',
      'Verificar se o token/API key nao expirou',
      'Para OAuth: verificar se o token de refresh esta configurado',
      'Verificar se o usuario tem permissao no sistema remoto',
    ],
  },
  {
    pattern: /403|Forbidden|Access denied|not authorized/i,
    type: 'PERMISSION_DENIED',
    diagnosis: 'O servidor remoto reconheceu a autenticacao mas negou o acesso ao recurso.',
    steps: [
      'Verificar permissoes do usuario no sistema remoto',
      'Verificar se o endpoint requer headers adicionais (API Key, token)',
      'Verificar se o IP do servidor Fluig esta liberado no destino',
      'Consultar documentacao do servico para requisitos de autorizacao',
    ],
  },
  {
    pattern: /404|Not Found|endpoint.*not.*found|recurso.*nao.*encontrado/i,
    type: 'NOT_FOUND',
    diagnosis: 'O endpoint ou recurso nao foi encontrado no servidor remoto.',
    steps: [
      'Verificar se a URL do endpoint esta correta',
      'Confirmar que o servico ainda existe e nao foi removido/renomeado',
      'Verificar versionamento da API (v1, v2, etc)',
      'Testar a URL diretamente no navegador ou Postman',
    ],
  },
  {
    pattern: /500|Internal Server Error|erro.*interno/i,
    type: 'SERVER_ERROR',
    diagnosis: 'Erro interno no servidor remoto. O problema nao esta no Fluig, mas no servico consumido.',
    steps: [
      'Verificar logs do servidor remoto para detalhes do erro',
      'Validar se o payload enviado esta correto',
      'Testar com payload minimo para isolar o problema',
      'Contatar o time responsavel pelo servico remoto',
    ],
  },
];

export function diagnoseIntegrationError(errorMessage: string): {
  type: string;
  diagnosis: string;
  steps: string[];
  confidence: number;
} | null {
  for (const pattern of INTEGRATION_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        type: pattern.type,
        diagnosis: pattern.diagnosis,
        steps: pattern.steps,
        confidence: 0.85,
      };
    }
  }
  return null;
}

export async function saveIntegrationDiagnostic(data: {
  environmentName: string;
  integrationType: string;
  endpointUrl: string;
  errorMessage: string;
  aiDiagnosis: string;
  solutionSteps: string[];
  configSuggestion?: string;
}) {
  const { data: row, error } = await supabase
    .from('integration_diagnostics')
    .insert({
      environment_name: data.environmentName,
      integration_type: data.integrationType,
      endpoint_url: data.endpointUrl,
      error_message: data.errorMessage,
      ai_diagnosis: data.aiDiagnosis,
      solution_steps: data.solutionSteps,
      config_suggestion: data.configSuggestion || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return row;
}

export async function fetchIntegrationHistory(page: number = 1, pageSize: number = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('integration_diagnostics')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { diagnostics: data || [], total: count || 0 };
}
