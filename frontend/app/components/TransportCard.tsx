// app/components/TransportCard.tsx
'use client';

import React from 'react';
import { Card, CardContent, Typography, Stack, Button, Box } from '@mui/material';

export default function TransportCard({
  typeLabel = '',
  option = {},
  isRecommended = false,
  selected = false,
  onSelect = () => {},
  children,
}: {
  typeLabel?: string;
  option?: any;
  isRecommended?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card variant={selected ? 'elevation' : 'outlined'} sx={{ p: 1, border: selected ? '2px solid' : undefined }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle2">{typeLabel}</Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              {option.operator ?? option.airline ?? option.trainNumber ?? (option.distanceKm ? `${option.distanceKm} km (Own)` : option.id)}
            </Typography>
            {option.departureTime && <Typography variant="body2">Departs: {option.departureTime}</Typography>}
            {option.arrivalTime && <Typography variant="body2">Arrives: {option.arrivalTime}</Typography>}
            {option.price !== undefined && <Typography variant="subtitle1" sx={{ mt: 1 }}>₹{option.price}</Typography>}
            {option.pricePerNight !== undefined && <Typography variant="subtitle1" sx={{ mt: 1 }}>₹{option.pricePerNight} / night</Typography>}
          </Box>

          <Stack spacing={1} alignItems="flex-end">
            {isRecommended && <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>Recommended</Typography>}
            <Button size="small" variant={selected ? 'contained' : 'outlined'} onClick={onSelect}>
              {selected ? 'Selected' : 'Select'}
            </Button>
          </Stack>
        </Stack>

        {children}
      </CardContent>
    </Card>
  );
}
