// app/layout.tsx
import './globals.css';
import React from 'react';
import MuiThemeProviderClient from './providers/MuiThemeProviderClient';
import { TripProvider } from './dashboard/context/TripContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TripProvider>
          {children}
        </TripProvider>
      </body>
    </html>
  );
}


export const metadata = {
  title: 'GPtrix — Trip Planner',
  description: 'AI-powered trip planner',
};

