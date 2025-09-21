// app/dashboard/success/page.tsx
'use client';

import React from 'react';
import { Box, Paper, Stack, Typography, Avatar, Button } from '@mui/material';
import { CheckCircleOutline, Home } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';
import { useRouter } from 'next/navigation';

export default function SuccessPage() {
  const { inputJson, travelDoc, accommodationDoc, generatedPlan, selections } = useTrip();
  const router = useRouter();

  // Email sending has been removed from this page.

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', py: 6 }}>
      <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }} elevation={6}>
        <Avatar sx={{ bgcolor: 'success.main', width: 84, height: 84, mx: 'auto', mb: 2 }}>
          <CheckCircleOutline sx={{ fontSize: 40 }} />
        </Avatar>

        <Typography variant="h4" sx={{ fontWeight: 900, mb: 1 }}>
          Booking Confirmed
        </Typography>

        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
          Your travel and accommodation are confirmed.
        </Typography>

        <Stack direction="column" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Button variant="outlined" startIcon={<Home />} onClick={() => router.push('/')}>Return Home</Button>
        </Stack>

        {/* Email status removed */}
      </Paper>
    </Box>
  );
}
