// app/providers/MuiThemeProviderClient.tsx
'use client';

import React from 'react';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import type { ReactNode } from 'react';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1e90ff' },   // bright blue used across header/controls
    secondary: { main: '#ff7a22' }, // orange CTA (search/enquire)
    background: { default: '#ffffff' },
    text: { primary: '#0b1b2b' },
  },
  typography: {
    fontFamily: "'Poppins', 'Inter', sans-serif",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          // style primary contained buttons like CTA to match screenshot
          backgroundColor: '#ff7a22',
          color: '#fff',
          '&:hover': { backgroundColor: '#ff8e42' },
        },
      },
    },
  },
});

export default function MuiThemeProviderClient({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
