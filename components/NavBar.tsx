'use client'

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  Zap, Settings, LogOut, Clock, Server, Shield,
  BookOpen, Menu, X, ChevronRight
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

const NAV_LINKS = [
  { href: '/environment/history', label: 'Analise de Ambiente', icon: Server },
  { href: '/installation', label: 'Guia de Instalacao', icon: BookOpen },
]

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const handleLogout = () => {
    router.push("/auth/login")
  }

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'glass shadow-soft py-2'
          : 'bg-background/80 backdrop-blur-md py-4'
      }`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">InsightLog</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <link.icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* Desktop dropdown */}
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary">U</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Navegacao</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/history" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />Historico de Logs
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/environment/history" className="flex items-center gap-2">
                      <Server className="h-4 w-4" />Analise de Ambiente
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/audit" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />Auditoria
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />Configuracoes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-card border-l shadow-elevated animate-scale-in p-6 pt-20">
            <nav className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Plataforma</p>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    pathname === link.href || pathname.startsWith(link.href + '/')
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
              <div className="border-t my-4" />
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Conta</p>
              <Link href="/history" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-accent">
                <Clock className="h-4 w-4" />Historico de Logs
              </Link>
              <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-accent">
                <Settings className="h-4 w-4" />Configuracoes
              </Link>
              <div className="border-t my-4" />
              <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 w-full">
                <LogOut className="h-4 w-4" />Sair
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
