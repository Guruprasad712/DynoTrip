'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box, Paper, Stack, Typography, Avatar, Grid, Divider, Chip } from '@mui/material';
import { FlightTakeoff, MonetizationOn, CalendarMonth, Place as PlaceIcon } from '@mui/icons-material';

function ImageStrip({ photos }: { photos?: string[] }) {
  const arr = photos ?? [];
  if (!arr.length) {
    return (
      <Box sx={{ width: '100%', height: 180, bgcolor: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlaceIcon sx={{ fontSize: 42, color: '#9aa4b2' }} />
      </Box>
    );
  }
  return (
    <Box sx={{ width: '100%', height: 220, overflow: 'hidden', borderRadius: 2 }}>
      <img src={arr[0]} alt="img" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Box>
  );
}

export default function SharedPlanPage() {
  const { token } = useParams<{ token: string }>();
  const [plan, setPlan] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const r = await fetch(`/api/share?token=${encodeURIComponent(String(token))}`);
        if (!r.ok) throw new Error('not ok');
        const j = await r.json();
        setPlan(j?.generatedPlan ?? null);
      } catch {
        setErr('Shared plan not found');
      }
    }
    if (token) run();
  }, [token]);

  const days = Array.isArray(plan?.storyItinerary) ? plan?.storyItinerary : [];
  const meta = plan?.meta || {};
  const activitiesCost = (() => {
    try {
      return days.reduce((sum: number, day: any) => {
        const s = (day.items || []).reduce((a: number, it: any) => a + Number(it?.price ?? 0), 0);
        return sum + s;
      }, 0);
    } catch {
      return 0;
    }
  })();

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }} elevation={3}>
        {err ? (
          <Typography>{err}</Typography>
        ) : (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <FlightTakeoff />
              </Avatar>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {meta?.departure ?? '—'} → {meta?.destination ?? '—'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {meta?.startDate ?? '—'} — {meta?.endDate ?? '—'}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip icon={<CalendarMonth />} label={`${days?.length ?? 0} day(s)`} />
              <Chip icon={<MonetizationOn />} label={`Est. ₹${activitiesCost}`} color="primary" />
            </Stack>
          </Stack>
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Stack spacing={2}>
            {days && days.length ? (
              days.map((d: any) => (
                <Paper key={d.id} sx={{ borderRadius: 3, overflow: 'hidden' }} elevation={6}>
                  <Grid container>
                    <Grid item xs={12} md={5}>
                      <ImageStrip photos={(d.items ?? []).filter((it: any) => !it.__isMeal).flatMap((p: any) => p.photos?.slice(0, 3) ?? [])} />
                    </Grid>
                    <Grid item xs={12} md={7}>
                      <Box sx={{ p: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>
                            {d.title} — {d.date}
                          </Typography>
                          <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                            Est: ₹{(d.items || []).reduce((s: number, it: any) => s + Number(it.price ?? 0), 0)}
                          </Typography>
                        </Stack>
                        <Divider sx={{ my: 1 }} />
                        <Stack spacing={1}>
                          {d.items?.map((it: any) => (
                            <Paper key={it.id} sx={{ p: 1.5 }}>
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Box sx={{ flex: 1 }}>
                                  <Typography sx={{ fontWeight: 700 }}>{it.title}</Typography>
                                  {it.description && (
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                      {it.description}
                                    </Typography>
                                  )}
                                  {it?.weather && typeof it.weather === 'object' && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                                      {`${it.weather.condition ?? it.weather.summary ?? 'Weather'}${(it.weather.temperature ?? it.weather.avg_temp) ? `, ${it.weather.temperature ?? it.weather.avg_temp}°C` : ''}`}
                                    </Typography>
                                  )}
                                </Box>
                                {it.price ? <Typography sx={{ fontWeight: 800 }}>₹{it.price}</Typography> : null}
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              ))
            ) : (
              <Paper sx={{ p: 3 }}>
                <Typography>No plan available.</Typography>
              </Paper>
            )}
          </Stack>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Read-only share</Typography>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Shared view of the plan.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
