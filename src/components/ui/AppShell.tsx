"use client";

import QrCode2Icon from "@mui/icons-material/QrCode2";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";

const NAV: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/", label: "Inicio" },
  { href: "/editor", label: "Piezas" },
  { href: "/import", label: "Importar Excel" },
  { href: "/preview", label: "Generar PDF" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar position="sticky" color="default" elevation={0} className="border-b border-divider">
        <Toolbar className="gap-4">
          <Link href="/" className="flex items-center gap-2 no-underline text-inherit">
            <QrCode2Icon color="primary" />
            <Typography component="span" variant="subtitle1" noWrap>
              QR Production Generator
            </Typography>
          </Link>
          <nav aria-label="Principal" className="ml-auto hidden gap-1 sm:flex">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  color={active ? "primary" : "inherit"}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </Toolbar>
      </AppBar>
      <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}

/** Botón de navegación interna usable desde Server Components (props serializables). */
export function NavButton({
  href,
  children,
  variant = "contained",
}: {
  href: Route;
  children: ReactNode;
  variant?: "contained" | "outlined" | "text";
}) {
  return (
    <Button component={Link} href={href} variant={variant}>
      {children}
    </Button>
  );
}
