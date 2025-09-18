// app/components/OwnTransportCalculator.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Box, TextField, Stack, Typography, Button } from '@mui/material';

export default function OwnTransportCalculator({ option = {}, onChange = (o: any) => {} }: { option?: any; onChange?: (o:any)=>void }) {
  const [perKm, setPerKm] = useState<number>(option.basePerKmRate ?? 12);
  const [distance, setDistance] = useState<number>(option.distanceKm ?? 0);
  const [tolls, setTolls] = useState<number>(option.tollsApprox ?? 0);

  useEffect(() => {
    const estFuel = Math.round(perKm * distance);
    const total = estFuel + (Number(tolls) || 0);
    onChange({ ...option, basePerKmRate: perKm, distanceKm: distance, tollsApprox: tolls, estimatedFuelCost: estFuel, price: total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perKm, distance, tolls]);

  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
        <TextField size="small" label="Distance (km)" value={distance} onChange={(e)=>setDistance(Number(e.target.value||0))} />
        <TextField size="small" label="Per km" value={perKm} onChange={(e)=>setPerKm(Number(e.target.value||0))} />
        <TextField size="small" label="Tolls" value={tolls} onChange={(e)=>setTolls(Number(e.target.value||0))} />
        <Button size="small" onClick={() => onChange({ ...option, basePerKmRate: perKm, distanceKm: distance, tollsApprox: tolls, estimatedFuelCost: perKm*distance, price: perKm*distance + tolls })}>Apply</Button>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>Estimate: ₹{Math.round((perKm*distance) + Number(tolls || 0))}</Typography>
    </Box>
  );
}
