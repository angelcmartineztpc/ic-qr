"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { ReactNode } from "react";

import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { NotificationsProvider } from "@/components/ui/NotificationsProvider";

import { theme } from "./theme";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NotificationsProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </NotificationsProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
