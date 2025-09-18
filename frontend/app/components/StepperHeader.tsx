// app/components/StepperHeader.tsx
'use client';
import React from 'react';
import { Box, Stepper, Step, StepLabel } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';

const steps = [
  { label: 'Trip', path: '/' },
  { label: 'Travel', path: '/dashboard/travel' },
  { label: 'Stay', path: '/dashboard/stay' },
  { label: 'Itinerary', path: '/dashboard/itinerary' },
  { label: 'Preview', path: '/dashboard/preview' },
];

export default function StepperHeader() {
  const path = usePathname() || '/';
  const router = useRouter();

  const active = (() => {
    if (path.includes('/dashboard/travel')) return 1;
    if (path.includes('/dashboard/stay')) return 2;
    if (path.includes('/dashboard/itinerary')) return 3;
    if (path.includes('/dashboard/preview')) return 4;
    return 0;
  })();

  return (
    <Box>
      <Stepper activeStep={active} alternativeLabel>
        {steps.map((s, idx) => {
          const isClickable = idx <= active; // only current and completed
          const handleClick = () => {
            if (isClickable) router.push(s.path);
          };
          return (
            <Step key={s.label} onClick={handleClick} disabled={!isClickable} style={{ cursor: isClickable ? 'pointer' : 'default' }}>
              <StepLabel>{s.label}</StepLabel>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
