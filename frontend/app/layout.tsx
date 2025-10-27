// app/layout.tsx
import './globals.css';
import React from 'react';
import MuiThemeProviderClient from './providers/MuiThemeProviderClient';
import { TripProvider } from './dashboard/context/TripContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect and Google Font for Poppins (matches screenshots) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <MuiThemeProviderClient>
          <TripProvider>
            {children}
          </TripProvider>
        </MuiThemeProviderClient>
      </body>
    </html>
  );
}


export const metadata = {
  title: 'GPtrix — Trip Planner',
  description: 'AI-powered trip planner',
};

