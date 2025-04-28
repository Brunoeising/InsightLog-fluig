export function HowItWorks() {
  return (
    <section className="container py-16 bg-secondary/20 rounded-lg my-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Como o InsightLog Funciona</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Nosso sistema inteligente analisa seus logs do Fluig, identifica problemas e fornece insights acionáveis.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
        {/* Linha de conexão entre etapas */}
        <div className="hidden md:block absolute top-1/3 left-0 w-full h-1 bg-primary/20 -translate-y-1/2 z-0" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
            1
          </div>
          <h3 className="text-xl font-medium mb-4">Upload</h3>
          <p className="text-muted-foreground">
            Faça upload do seu arquivo de log do sistema Fluig (.log) através da nossa interface segura.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
            2
          </div>
          <h3 className="text-xl font-medium mb-4">Análise</h3>
          <p className="text-muted-foreground">
            Nosso sistema analisa inteligentemente o log, identificando erros, avisos e seu contexto.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
            3
          </div>
          <h3 className="text-xl font-medium mb-4">Processamento</h3>
          <p className="text-muted-foreground">
            A análise com IA categoriza problemas e gera soluções práticas.
          </p>
        </div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
            4
          </div>
          <h3 className="text-xl font-medium mb-4">Solução</h3>
          <p className="text-muted-foreground">
            Revise o painel interativo com insights e implemente as correções sugeridas.
          </p>
        </div>
      </div>
    </section>
  );
}