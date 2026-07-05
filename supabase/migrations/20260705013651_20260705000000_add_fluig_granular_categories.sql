/*
# Add granular Fluig-specific error categories

## Summary
Inserts five new default error categories aligned with TOTVS Fluig's internal subsystems:
BPM, WCM, ECM, FDN, and INT. These map directly to the Fluig log dictionary and allow
the AI analysis engine to categorize errors with higher precision, avoiding the catch-all
"OTHER" bucket for platform-specific patterns.

## Changes

### default_error_categories
- INSERT: BPM — Business Process Management. Terms target WorkflowEngine, task assignment,
  state machine, customization events (beforeStateEntry, afterStateEntry).
- INSERT: WCM — Web Content Management. Terms target DeployServiceRest, FileTransfer,
  portal, widget deploy, volume files, pageIcon.
- INSERT: ECM — Enterprise Content Management. Terms target ECM module, documents,
  file viewer, volume, folder operations.
- INSERT: FDN — Foundation layer. Terms target FDN exceptions, OAuth, impersonation,
  FDNAccessDeniedException.
- INSERT: INT — Integration layer. Terms target REST/SOAP integrations, external dataset
  calls, ClassNotFoundException in services, connection timeouts to external services.

### error_categories (per-user copies)
- Propagates the five new categories to all existing users who already have default categories
  (is_default = true). New users are covered by the existing trigger that runs on INSERT into
  auth.users.

## Notes
1. Uses INSERT ... WHERE NOT EXISTS to be fully idempotent (safe to re-run).
2. Does NOT modify or delete any existing rows.
3. Existing trigger copy_defaults_for_new_user will automatically include these categories
   for any user created after this migration runs.
*/

-- Insert new Fluig-specific default categories (idempotent)
INSERT INTO default_error_categories (name, description, terms)
SELECT * FROM (VALUES
  (
    'BPM',
    'Problemas no motor de workflow e processos BPM do Fluig',
    ARRAY[
      'WorkflowEngine', 'workflowengine', 'workflow.engine',
      'CustomizationManager', 'customizationmanager',
      'afterStateEntry', 'beforeStateEntry', 'afterstate', 'beforestate',
      'solicitacao', 'mecanismo de atribuicao', 'atribuicao da tarefa',
      'colaboradores em comum', 'invokeFunction', 'invokefunc',
      'estado atual', 'executando evento', 'erro ao salvar tarefa',
      'bpm', 'processo', 'movimentacao', 'atividade de servico'
    ]
  ),
  (
    'WCM',
    'Problemas no gerenciamento de conteudo web e publicacao do Fluig',
    ARRAY[
      'wcm', 'WCM', 'DeployServiceRest', 'deployservicerest',
      'FileTransferProcessorUtil', 'filetransfer',
      'wcmapplicationcenter', 'DuplicatedResourceException', 'duplicatedresource',
      'portal', 'widget', 'deploy', 'publicacao', 'pageIcon', 'pageicon',
      'jboss-web.xml', 'application.info', 'context-root',
      'upload do arquivo', 'copia do arquivo'
    ]
  ),
  (
    'ECM',
    'Problemas no gerenciamento de documentos e volumes ECM do Fluig',
    ARRAY[
      'ecm', 'ECM', 'ecmdiagnosticcenter', 'diagnosticscenter',
      'documento', 'visualizador', 'volume', 'pasta',
      'FileSystemException', 'filesystemexception',
      'AccessDeniedException', 'accessdeniedexception',
      'network path was not found', 'The network path',
      'pageIcon', 'WCMAdmin', 'wcmadmin'
    ]
  ),
  (
    'FDN',
    'Problemas na camada Foundation do Fluig (auth, OAuth, personificação)',
    ARRAY[
      'FDN', 'fdn', 'foundation',
      'FDNAccessDeniedException', 'fdnaccessdenied',
      'personificacao', 'impersonaliza', 'impersonation',
      'oAuth', 'oauth', 'OAuth application',
      'sem permissao de personificacao', 'Acesso negado',
      'CustomNoneAuthorize', 'authorize.client',
      'UnsatisfiedLinkError', 'jmscapi.dll',
      'FontConfiguration', 'X11FontManager', 'libfontconfig'
    ]
  ),
  (
    'INT',
    'Problemas de integração com sistemas externos (REST, SOAP, datasets externos)',
    ARRAY[
      'INT', 'integracao', 'integration',
      'ClassNotFoundException', 'classnotfound',
      'Connection timed out', 'connection timed out',
      'HttpHostConnectException', 'httphostconnect',
      'SOAPFaultException', 'soapfault',
      'webservice', 'WebService', 'rest', 'soap',
      'dataset externo', 'DsGeneric', 'dsgeneric',
      'WsConsultaSQL', 'wsconsultasql',
      'fluig.authorize', 'EJB ASYNC',
      'Connect to.*failed', 'Connection refused'
    ]
  )
) AS new_cats(name, description, terms)
WHERE NOT EXISTS (
  SELECT 1 FROM default_error_categories dc WHERE dc.name = new_cats.name
);

-- Propagate new categories to existing users who already have default categories
-- (new users are covered by the existing trigger)
INSERT INTO error_categories (name, description, terms, user_id, is_default)
SELECT
  d.name,
  d.description,
  d.terms,
  u.id,
  true
FROM auth.users u
CROSS JOIN default_error_categories d
WHERE d.name IN ('BPM', 'WCM', 'ECM', 'FDN', 'INT')
  AND EXISTS (
    SELECT 1 FROM error_categories e
    WHERE e.user_id = u.id AND e.is_default = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM error_categories e
    WHERE e.user_id = u.id AND e.name = d.name
  );
