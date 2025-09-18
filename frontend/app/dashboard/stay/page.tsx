'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Button,
  Alert,
  Stack,
  FormControlLabel,
  Checkbox,
  Paper,
  Dialog,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Hotel as HotelIcon, ArrowBackIos, ArrowForwardIos, Close } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';
import { useRouter } from 'next/navigation';

function HotelCard({ hotel, onSelect, selected, onPreview }: any) {
  return (
    <Paper
      elevation={6}
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 180ms',
        '&:hover': { transform: 'translateY(-6px)' },
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
      }}
      onClick={() => onPreview?.(hotel)}
    >
      <Box sx={{ width: 220, height: 160, overflow: 'hidden', flexShrink: 0 }}>
        <img src={hotel.photos?.[0] ?? '/placeholder.jpg'} alt={hotel.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Box>

      <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 900 }}>{hotel.name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{hotel.address}</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>{hotel.reviews?.[0] ?? ''}</Typography>
        </Box>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <Typography sx={{ fontWeight: 900 }}>₹{hotel.pricePerNight}</Typography>
          <Button variant={selected ? 'contained' : 'outlined'} size="small" onClick={(e) => { e.stopPropagation(); onSelect?.(hotel); }}>
            {selected ? 'Selected' : 'Select'}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}

export default function StayPage() {
  const { accommodationDoc, inputJson, selections, setSelections, setGeneratedPlan, setMockGeneratedPlan } = useTrip();
  const router = useRouter();

  const hotels = (accommodationDoc?.hotels ?? []) as any[];

  const nights = useMemo(() => {
    if (!inputJson?.startDate || !inputJson?.endDate) return 1;
    const s = new Date(inputJson.startDate);
    const e = new Date(inputJson.endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, diff);
  }, [inputJson]);

  const [useSameHotel, setUseSameHotel] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>({});
  const [openPreview, setOpenPreview] = useState(false);
  const [previewPhotos, setPreviewPhotos] = useState<string[]>([]);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // pagination for many days: show 7 days per page
  const DAYS_PER_PAGE = 7;
  const totalPages = Math.ceil(nights / DAYS_PER_PAGE);
  const [page, setPage] = useState(0);

  // On mount or hotels change: default assignment (recommended hotel or first)
  useEffect(() => {
    const rec = hotels.find(h => h.recommended) ?? hotels[0];
    if (!rec) return;

    const existing = (selections as any)?.hotelsSelection;

    // default mapping for UI
    const defaultMap: Record<string, string> = {};
    for (let i = 0; i < nights; i++) defaultMap[`day-${i + 1}`] = rec.id;
    setSelectedMap(defaultMap);

    // DEFER updating context state so we don't trigger a provider update while this component is rendering.
    const t = setTimeout(() => {
      // if selections already have hotels booking info, prefer them
      if (existing?.useSameHotel && existing?.booking?.hotelId) {
        const hId = existing.booking.hotelId;
        const map: Record<string, string> = {};
        for (let i = 0; i < nights; i++) map[`day-${i + 1}`] = hId;
        setSelectedMap(map);
        return;
      }

      // otherwise set the default booking in selections
      setTimeout(() => {
        setSelections?.((prev: any) => ({ ...(prev || {}), hotelsSelection: { useSameHotel: true, booking: { hotelId: rec.id, name: rec.name, pricePerNight: rec.pricePerNight ?? rec.price, nights, totalPrice: (rec.pricePerNight ?? rec.price ?? 0) * nights } } }));
      }, 0);
    }, 0);

    return () => clearTimeout(t);
    // intentionally run only when hotels or nights change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels, nights]);

  // If user toggles to per-day selection, ensure selectedMap has keys for all days
  useEffect(() => {
    if (!useSameHotel) {
      setSelectedMap(prev => {
        const copy = { ...(prev || {}) };
        for (let i = 0; i < nights; i++) {
          const key = `day-${i + 1}`;
          if (!copy[key]) copy[key] = hotels[i % hotels.length]?.id ?? hotels[0]?.id;
        }
        return copy;
      });
    } else {
      // if switched back to same hotel, pick first selected day hotel or recommended
      const firstHotel = selectedMap['day-1'] ?? hotels.find(h => h.recommended)?.id ?? hotels[0]?.id;
      const map: Record<string, string> = {};
      for (let i = 0; i < nights; i++) map[`day-${i + 1}`] = firstHotel;
      setSelectedMap(map);
      const h = hotels.find(x => x.id === firstHotel);
      const total = (h?.pricePerNight ?? h?.price ?? 0) * nights;
      setTimeout(() => {
        setSelections?.((prev: any) => ({ ...(prev || {}), hotelsSelection: { useSameHotel: true, booking: { hotelId: firstHotel, name: h?.name, pricePerNight: h?.pricePerNight ?? h?.price, nights, totalPrice: total } } }));
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSameHotel]);

  function openHotelPreview(h: any) {
    setPreviewPhotos(h.photos ?? []);
    setPreviewTitle(h.name);
    setPreviewIndex(0);
    setOpenPreview(true);
  }

  function selectHotelForAll(hotelId: string) {
    const map: Record<string, string> = {};
    for (let i = 0; i < nights; i++) map[`day-${i + 1}`] = hotelId;
    setSelectedMap(map);
    const h = hotels.find(x => x.id === hotelId);
    const total = (h?.pricePerNight ?? h?.price ?? 0) * nights;
    setTimeout(() => {
      setSelections?.((prev: any) => ({ ...(prev || {}), hotelsSelection: { useSameHotel: true, booking: { hotelId, name: h?.name, pricePerNight: h?.pricePerNight ?? h?.price, nights, totalPrice: total } } }));
    }, 0);
  }

  function selectHotelForDay(dayIndex: number, hotelId: string) {
    const n: Record<string, string> = { ...(selectedMap || {}), [`day-${dayIndex + 1}`]: hotelId };
    setSelectedMap(n);
    const arr = Object.keys(n).map((k) => {
      const hid = n[k];
      const h = hotels.find(x => x.id === hid);
      return { day: k, hotelId: hid, name: h?.name, pricePerNight: h?.pricePerNight ?? h?.price ?? 0, date: getDateForDay(Number(k.replace('day-', '')) - 1) };
    });
    setTimeout(() => {
      setSelections?.((prev: any) => ({ ...(prev || {}), hotelsSelection: { useSameHotel: false, bookingPerDay: arr } }));
    }, 0);
  }

  function getDateForDay(idx: number) {
    if (!inputJson?.startDate) return '';
    const d = new Date(inputJson.startDate);
    d.setDate(d.getDate() + idx);
    return d.toISOString().slice(0, 10);
  }

  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [allowProceedManual, setAllowProceedManual] = useState(false);

  async function persistStayAndNext() {
    // Trigger point #2: generate AI itinerary based on inputJson + selections
    setGenError(null);
    setAllowProceedManual(false);
    const MCP_GENERATE = process.env.NEXT_PUBLIC_MCP_GENERATE ?? '/api/mcp/generate';
    try {
      setGenLoading(true);
      let res = await fetch(MCP_GENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputJson, selections }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('Generate itinerary failed', res.status, txt);
        // Try local proxy fallback
        try {
          res = await fetch('/api/mcp/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputJson, selections }),
          });
        } catch (e) {
          setGenError('Could not generate itinerary from server. You can still continue and edit manually.');
          router.push('/dashboard/itinerary');
          return;
        }
        if (!res.ok) {
          const txt2 = await res.text().catch(() => '');
          console.error('Fallback generate failed', res.status, txt2);
          setGenError('Could not generate itinerary from server.');
          setAllowProceedManual(true);
          return;
        }
      }
      const j = await res.json().catch(() => ({}));
      if (j?.generatedPlan) {
        setGeneratedPlan?.(j.generatedPlan);
      }
      router.push('/dashboard/itinerary');
    } catch (err) {
      console.error('persistStayAndNext error', err);
      setGenError('Network error while generating itinerary.');
      setAllowProceedManual(true);
    } finally {
      setGenLoading(false);
    }
  }

  // handle long trips
  const longTrip = nights > 14;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Available stays in {inputJson?.destination}</Typography>

      {longTrip && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Long trip detected ({nights} nights). We recommend using the same hotel for long stays or grouping stays by week.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <FormControlLabel control={<Checkbox checked={useSameHotel} onChange={(e) => setUseSameHotel(e.target.checked)} />} label="Use same hotel for all days" />
        <Button variant="outlined" size="small" onClick={() => {
          // quick assign recommended to all
          const rec = hotels.find(h => h.recommended) ?? hotels[0];
          if (rec) selectHotelForAll(rec.id);
        }}>Assign recommended to all</Button>
      </Stack>

      {!useSameHotel && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Select hotel per day</Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <IconButton size="small" disabled={page <= 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ArrowBackIos fontSize="small" /></IconButton>
              <Typography variant="caption">Days {(page * DAYS_PER_PAGE) + 1} – {Math.min(nights, (page + 1) * DAYS_PER_PAGE)}</Typography>
              <IconButton size="small" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}><ArrowForwardIos fontSize="small" /></IconButton>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            {Array.from({ length: Math.min(DAYS_PER_PAGE, Math.max(0, nights - page * DAYS_PER_PAGE)) }).map((_, i) => {
              const dayIndex = page * DAYS_PER_PAGE + i;
              const dayKey = `day-${dayIndex + 1}`;
              return (
                <Box key={dayKey} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ width: 160 }}>{`Day ${dayIndex + 1} — ${getDateForDay(dayIndex)}`}</Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {hotels.map(h => (
                      <Button
                        key={h.id}
                        size="small"
                        variant={selectedMap[dayKey] === h.id ? 'contained' : 'outlined'}
                        onClick={() => selectHotelForDay(dayIndex, h.id)}
                      >
                        {h.name}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      <Grid container spacing={2}>
        {hotels.map(h => {
          const isSelected = useSameHotel ? Object.values(selectedMap).every(v => v === h.id) : Object.values(selectedMap).includes(h.id);
          return (
            <Grid item xs={12} md={6} key={h.id}>
              <HotelCard
                hotel={h}
                selected={isSelected}
                onSelect={(hot: any) => {
                  if (useSameHotel) selectHotelForAll(hot.id);
                  else selectHotelForDay(0, hot.id);
                }}
                onPreview={openHotelPreview}
              />
            </Grid>
          );
        })}
      </Grid>

      {genError && <Alert severity="warning" sx={{ mt: 2 }}>{genError}</Alert>}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button variant="outlined" onClick={() => router.push('/dashboard/travel')}>Back</Button>
        <Button variant="contained" onClick={persistStayAndNext} disabled={genLoading}>
          {genLoading ? <><CircularProgress size={18} sx={{ mr: 1 }} /> Generating…</> : 'Next: Generate & Itinerary'}
        </Button>
        {allowProceedManual && (
          <Button
            variant="text"
            onClick={() => {
              try {
                setMockGeneratedPlan?.(inputJson, selections as any);
              } catch (e) {
                console.warn('setMockGeneratedPlan failed', e);
              }
              router.push('/dashboard/itinerary');
            }}
          >
            Proceed with Mock data
          </Button>
        )}
      </Box>

      <Dialog open={openPreview} onClose={() => setOpenPreview(false)} fullWidth maxWidth="lg">
        <Box sx={{ position: 'relative', bgcolor: 'black' }}>
          <IconButton onClick={() => setOpenPreview(false)} sx={{ position: 'absolute', right: 8, top: 8, color: 'white', zIndex: 10 }}><Close /></IconButton>
          {previewPhotos && previewPhotos.length > 0 ? (
            <Box sx={{ height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <img src={previewPhotos[previewIndex]} alt={previewTitle} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              {previewPhotos.length > 1 && (
                <>
                  <IconButton sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'white' }} onClick={() => setPreviewIndex(i => (i - 1 + previewPhotos.length) % previewPhotos.length)}><ArrowBackIos /></IconButton>
                  <IconButton sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'white' }} onClick={() => setPreviewIndex(i => (i + 1) % previewPhotos.length)}><ArrowForwardIos /></IconButton>
                </>
              )}
            </Box>
          ) : (
            <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography>No photos available</Typography>
            </Box>
          )}
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ color: 'white' }}>{previewTitle}</Typography>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
