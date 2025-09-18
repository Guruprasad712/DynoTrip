import React from 'react';
import { Box, Container } from '@mui/material';
import StepperHeader from '../components/StepperHeader';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: 'grey.50', minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <StepperHeader />
        <Box sx={{ mt: 3 }}>{children}</Box>
      </Container>
    </Box>
  );
}
