import { Upload, FileSearch, Cpu, CheckCircle2 } from "lucide-react"

const STEPS = [
  { icon: Upload, title: "Upload", description: "Envie o arquivo de log do Fluig para analise." },
  { icon: FileSearch, title: "Analise", description: "O sistema identifica erros, avisos e contexto relevante." },
  { icon: Cpu, title: "IA", description: "Inteligencia artificial categoriza problemas e gera solucoes." },
  { icon: CheckCircle2, title: "Solucao", description: "Revise insights e implemente as correcoes sugeridas." },
]

export function HowItWorks() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h2 className="text-2xl font-semibold">Como funciona</h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {STEPS.map((step, index) => (
          <div key={index} className="relative flex flex-col items-center text-center group">
            {/* Connector line (desktop) */}
            {index < STEPS.length - 1 && (
              <div className="hidden md:block absolute top-6 left-[60%] right-[-40%] h-px bg-border" />
            )}
            <div className="relative z-10 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
              <step.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
