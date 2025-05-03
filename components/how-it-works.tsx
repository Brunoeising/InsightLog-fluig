import { Card } from "@/components/ui/card"

export function HowItWorks() {
  return (
    <section className="container py-16 my-8">
    <div className="text-center mb-12">
      <h2 className="text-3xl font-bold mb-4 text-primary">Como o InsightLog Funciona</h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Nosso sistema inteligente analisa seus logs do Fluig, identifica problemas e fornece insights acionáveis.
      </p>
    </div>
  
    <Card className="p-8 shadow-lg border border-border/40 rounded-3xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          {
            title: "Upload",
            description: "Faça upload do seu arquivo de log do sistema Fluig (.log) através da nossa interface segura.",
          },
          {
            title: "Análise",
            description: "Nosso sistema analisa inteligentemente o log, identificando erros, avisos e seu contexto.",
          },
          {
            title: "Processamento",
            description: "A análise com IA categoriza problemas e gera soluções práticas.",
          },
          {
            title: "Solução",
            description: "Revise o painel interativo com insights e implemente as correções sugeridas.",
          },
        ].map((step, index) => (
          <div key={index} className="flex flex-col items-center text-center space-y-4">
            <div className="bg-[#245C90] text-white w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow">
              {index + 1}
            </div>
            <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>
    </Card>
  </section>
  
  );
}