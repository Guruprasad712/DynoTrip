// app/providers/MuiThemeProviderClient.tsx
'use client';

import React from 'react';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import type { ReactNode } from 'react';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1f6fbf' },
    secondary: { main: '#2b8a3e' },
  },
  typography: { fontFamily: "'Inter', sans-serif" },
});

export default function MuiThemeProviderClient({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
