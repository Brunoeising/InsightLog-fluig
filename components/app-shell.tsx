'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  LogOut,
  Menu,
  Settings,
  Shield,
  Server,
  Upload,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/theme-toggle';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { href: '/', label: 'Dashboard', icon: Home },
      { href: '/history', label: 'Historico de Logs', icon: Clock },
      { href: '/analysis', label: 'Analises', icon: BarChart3, matchPrefix: '/analysis' },
    ],
  },
  {
    label: 'Ambiente',
    items: [
      { href: '/environment/new', label: 'Nova Analise', icon: Upload },
      { href: '/environment/history', label: 'Historico Ambiente', icon: Server },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { href: '/installation', label: 'Guia de Instalacao', icon: BookOpen },
      { href: '/audit', label: 'Auditoria', icon: Shield },
      { href: '/settings', label: 'Configuracoes', icon: Settings },
    ],
  },
];

interface AppShellProps {
  children: React.ReactNode;
  contentClassName?: string;
}

export function AppShell({ children, contentClassName }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('insightlog.sidebar.collapsed') === 'true');
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('insightlog.sidebar.collapsed', String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const isActive = (href: string, matchPrefix?: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${matchPrefix || href}/`);
  };

  const Navigation = ({ compact = false }: { compact?: boolean }) => (
    <nav className="space-y-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!compact && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(item.href, item.matchPrefix);
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    compact && 'justify-center px-0'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!compact && <span className="truncate">{item.label}</span>}
                </Link>
              );

              if (!compact) return link;

              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden border-r bg-card/95 backdrop-blur lg:flex lg:flex-col transition-[width] duration-300',
            collapsed ? 'w-20' : 'w-72'
          )}
        >
          <div className={cn('flex h-16 items-center border-b px-4', collapsed ? 'justify-center' : 'justify-between')}>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Zap className="h-4 w-4" />
              </div>
              {!collapsed && <span className="text-lg font-semibold">InsightLog</span>}
            </Link>
            {!collapsed && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCollapsed}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-5">
            <Navigation compact={collapsed} />
          </div>

          <div className="border-t p-3">
            {collapsed ? (
              <div className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-full" onClick={toggleCollapsed}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expandir menu</TooltipContent>
                </Tooltip>
                <ThemeToggle />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-full text-destructive" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sair</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Workspace
                  </div>
                  <ThemeToggle />
                </div>
                <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            )}
          </div>
        </aside>

        <div className={cn('transition-[padding] duration-300 lg:pl-72', collapsed && 'lg:pl-20')}>
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="border-b px-5 py-4 text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Zap className="h-4 w-4" />
                    </div>
                    InsightLog
                  </SheetTitle>
                  <SheetDescription>Navegacao principal da plataforma</SheetDescription>
                </SheetHeader>
                <div className="px-4 py-5">
                  <Navigation />
                </div>
                <div className="absolute inset-x-0 bottom-0 border-t p-4">
                  <div className="mb-2 flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">Tema</span>
                    <ThemeToggle />
                  </div>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    Sair
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Zap className="h-4 w-4 text-primary" />
              InsightLog
            </Link>
            <ThemeToggle />
          </header>

          <main className={cn('min-h-screen px-4 py-6 md:px-8 lg:px-10 lg:py-8', contentClassName)}>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}