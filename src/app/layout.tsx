import type { Metadata } from "next";
import "./globals.css";
import AdminPendingNotice from "./AdminPendingNotice";
export const metadata: Metadata = { title: "CVT — Controle de Ponto", description: "Controle interno de jornada da Corrente da Vida Treinamentos" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body><AdminPendingNotice />{children}</body></html>; }
