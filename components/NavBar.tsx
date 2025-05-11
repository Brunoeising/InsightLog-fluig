'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Zap, Settings, LogOut, Clock, Box } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle"


export default function NavBar() {
    const router = useRouter()

    const handleLogout = () => {
        // Aqui você pode limpar tokens/localStorage, se aplicável
        // localStorage.removeItem('token')
        router.push("/auth/login")
    }

    return (
        <header className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-sm z-50  px-6 md:px-10 py-4">
            <div className="flex w-full h-16 items-center justify-between">
                {/* Logo à esquerda */}
                <Link href="/" className="flex items-center gap-2">
                    <Zap className="h-6 w-6 text-primary" />
                    <span className="text-xl font-semibold text-primary">InsightLog</span>
                </Link>

                {/* Botões à direita */}
                <div className="flex items-center gap-4">
                    <ThemeToggle />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Avatar>
                                <AvatarFallback>
                                    <Box width="24px" height="24px">
                                        <svg viewBox="0 0 64 64" fill="currentColor">
                                            <path d="M41.5 14c4.687 0 8.5 4.038 8.5 9s-3.813 9-8.5 9S33 27.962 33 23 36.813 14 41.5 14zM56.289 43.609C57.254 46.21 55.3 49 52.506 49c-2.759 0-11.035 0-11.035 0 .689-5.371-4.525-10.747-8.541-13.03 2.388-1.171 5.149-1.834 8.07-1.834C48.044 34.136 54.187 37.944 56.289 43.609zM37.289 46.609C38.254 49.21 36.3 52 33.506 52c-5.753 0-17.259 0-23.012 0-2.782 0-4.753-2.779-3.783-5.392 2.102-5.665 8.245-9.472 15.289-9.472S35.187 40.944 37.289 46.609zM21.5 17c4.687 0 8.5 4.038 8.5 9s-3.813 9-8.5 9S13 30.962 13 26 16.813 17 21.5 17z" />
                                        </svg>
                                    </Box>
                                </AvatarFallback>
                            </Avatar>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-56 shadow-lg">
                            <DropdownMenuLabel className="text-sm font-medium">Minha Conta</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem asChild>
                                <Link href="/history" className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Histórico
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem asChild>
                                <Link href="/settings" className="flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Configurações
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                onClick={handleLogout}
                                className="text-destructive hover:text-destructive flex items-center gap-2 cursor-pointer"
                            >
                                <LogOut className="h-4 w-4" />
                                Sair
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    )
}
