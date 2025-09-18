// app/dashboard/preview/page.tsx
'use client';

import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Avatar,
  Button,
  Grid,
  Chip,
  Divider,
} from '@mui/material';
import { FlightTakeoff, Hotel as HotelIcon, CalendarMonth, MonetizationOn, Download, Place as PlaceIcon } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useRouter } from 'next/navigation';

/* ---------- Small ImageCarousel (lightweight) ---------- */
function ImageCarouselPreview({ photos }: { photos?: string[] }) {
  const arr = photos ?? [];
  if (!arr.length)
    return (
      <Box sx={{ width: '100%', height: 180, bgcolor: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlaceIcon sx={{ fontSize: 42, color: '#9aa4b2' }} />
      </Box>
    );
  return (
    <Box sx={{ width: '100%', height: 240, overflow: 'hidden', borderRadius: 2 }}>
      <img src={arr[0]} alt="img" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Box>
  );
}

export default function PreviewPage() {
  const { inputJson, travelDoc, accommodationDoc, generatedPlan, selections } = useTrip();
  const router = useRouter();
  const printableRef = useRef<HTMLDivElement | null>(null);

  const days = (generatedPlan?.storyItinerary as any[]) ?? [];

  // calculate costs
  const travelCost = (() => {
    try {
      const tSel = (selections as any)?.transportSelections ?? {};
      const outbound = tSel?.outbound?.option?.price ?? 0;
      const ret = tSel?.return?.option?.price ?? 0;
      return Number(outbound) + Number(ret);
    } catch {
      return 0;
    }
  })();

  const stayCost = (() => {
    try {
      const hotelsSel = (selections as any)?.hotelsSelection;
      if (!hotelsSel) return 0;
      if (hotelsSel.booking?.totalPrice) return Number(hotelsSel.booking.totalPrice);
      if (Array.isArray(hotelsSel.bookingPerDay)) {
        return hotelsSel.bookingPerDay.reduce((s: number, b: any) => s + Number(b.totalPrice ?? b.pricePerNight ?? 0), 0);
      }
      return 0;
    } catch {
      return 0;
    }
  })();

  const activitiesCost = (() => {
    try {
      if (!generatedPlan?.storyItinerary) return 0;
      return (generatedPlan.storyItinerary as any[]).reduce((sum: number, day: any) => {
        const s = (day.items || []).reduce((a: number, it: any) => a + Number(it?.price ?? 0), 0);
        return sum + s;
      }, 0);
    } catch {
      return 0;
    }
  })();

  const totalCost = travelCost + stayCost + activitiesCost;

  // ---------- RenderStayCard (tidy, polished stay summary) ----------
  // Note: defined inside component so it can close over router, selections, accommodationDoc, inputJson
  function RenderStayCard() {
    const hotelsSel = (selections as any)?.hotelsSelection;
    const hotels = (accommodationDoc?.hotels ?? []) as any[];

    // helper to find hotel metadata by id
    const findHotel = (id: string) => hotels.find((h: any) => h.id === id) ?? null;

    // UI when nothing selected
    if (!hotelsSel) {
      return (
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: '#1976d2' }}>
              <HotelIcon />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                No hotel selected
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Choose a stay on the Stay page to include it in the summary.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={() => router.push('/dashboard/stay')}>Choose Stay</Button>
            </Stack>
          </Stack>
        </Paper>
      );
    }

    // Single hotel selected for all nights (clean large card)
    if (hotelsSel.useSameHotel && hotelsSel.booking) {
      const b = hotelsSel.booking;
      const hotel = findHotel(b.hotelId);
      const img = hotel?.photos?.[0] ?? (accommodationDoc?.hotels?.[0]?.photos?.[0] ?? '');
      const nights = Number(b.nights ?? 1);
      const perNight = Number(b.pricePerNight ?? 0);
      const total = Number(b.totalPrice ?? perNight * nights);

      return (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2, alignItems: 'stretch', p: 0 }}>
          <Box sx={{ width: 150, height: 120, flexShrink: 0, overflow: 'hidden' }}>
            {img ? (
              <img src={img} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Box sx={{ width: '100%', height: '100%', bgcolor: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HotelIcon sx={{ fontSize: 36, color: '#9aa4b2' }} />
              </Box>
            )}
          </Box>

          <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{b.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                {`Check-in: ${b.checkIn ?? inputJson?.startDate} • Check-out: ${b.checkOut ?? inputJson?.endDate}`}
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <Chip label={`${nights} night${nights > 1 ? 's' : ''}`} size="small" />
                <Chip label={`₹${perNight}/night`} size="small" />
                <Chip label={`Total ₹${total}`} color="primary" size="small" />
              </Stack>

              {b?.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>{b.notes}</Typography>}
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 1 }} justifyContent="flex-end">
              <Button variant="text" size="small" onClick={() => router.push('/dashboard/stay')}>Edit Stay</Button>
              <Button variant="contained" size="small" onClick={() => router.push('/dashboard/stay')}>Change</Button>
            </Stack>
          </Box>
        </Paper>
      );
    }

    // Per-day hotels selected -> show a tidy horizontal list of mini-cards
    if (!hotelsSel.useSameHotel && Array.isArray(hotelsSel.bookingPerDay)) {
      const arr = hotelsSel.bookingPerDay;
      const visible = arr.slice(0, 3); // show up to 3; rest summarized

      return (
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ bgcolor: '#1976d2' }}><HotelIcon /></Avatar>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Stays (per day)</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{`${arr.length} night${arr.length > 1 ? 's' : ''} • Mixed hotels selected`}</Typography>
              </Box>
            </Stack>

            <Button size="small" variant="outlined" onClick={() => router.push('/dashboard/stay')}>Edit Stay</Button>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1 }}>
            {visible.map((b: any) => {
              const hotelMeta = findHotel(b.hotelId);
              const thumb = hotelMeta?.photos?.[0] ?? '';
              return (
                <Paper key={b.day} elevation={2} sx={{ minWidth: 220, p: 1, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Box sx={{ width: 64, height: 64, flexShrink: 0, overflow: 'hidden', borderRadius: 1 }}>
                    {thumb ? <img src={thumb} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Box sx={{ width: '100%', height: '100%', bgcolor: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HotelIcon sx={{ color: '#9aa4b2' }} /></Box>}
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{b.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{b.date ?? ''}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>₹{b.totalPrice ?? b.pricePerNight ?? 0}</Typography>
                  </Box>
                </Paper>
              );
            })}

            {arr.length > visible.length && (
              <Paper elevation={0} sx={{ minWidth: 120, p: 1, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">+{arr.length - visible.length} more</Typography>
              </Paper>
            )}
          </Stack>

          {/* compact expanded list for clarity */}
          <Box sx={{ mt: 1 }}>
            {arr.slice(0, 6).map((b: any) => (
              <Stack key={b.day} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{b.date}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{b.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>₹{b.totalPrice ?? b.pricePerNight ?? 0}</Typography>
              </Stack>
            ))}
            {arr.length > 6 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>...and more</Typography>}
          </Box>
        </Paper>
      );
    }

    // fallback
    return (
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography>No stay details available</Typography>
      </Paper>
    );
  }

  async function downloadPdf() {
    if (!printableRef.current) return;
    const el = printableRef.current;

    // Use html2canvas to create bitmap of the whole printable area
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');

    // Create PDF sized to the canvas (keeps layout consistent)
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    const fileName = `itinerary-${inputJson?.departure ?? 'trip'}-${inputJson?.destination ?? ''}.pdf`.replace(/\s+/g, '_');
    pdf.save(fileName);
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4 }}>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }} elevation={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <FlightTakeoff />
            </Avatar>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {inputJson?.departure ?? '—'} → {inputJson?.destination ?? '—'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {inputJson?.startDate ?? '—'} — {inputJson?.endDate ?? '—'} • {inputJson?.members?.adults ?? 1} adults
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Chip icon={<CalendarMonth />} label={`${days?.length ?? 0} day(s)`} />
            <Chip icon={<MonetizationOn />} label={`Est. ₹${totalCost}`} color="primary" />
            <Button startIcon={<Download />} variant="contained" onClick={downloadPdf}>
              Download PDF
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Printable area: includes both itinerary + right summary so PDF contains all */}
      <div ref={printableRef as any}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            {/* Story-like large day cards */}
            <Stack spacing={2}>
              {days && days.length ? (
                days.map((d: any) => (
                  <Paper key={d.id} sx={{ borderRadius: 3, overflow: 'hidden' }} elevation={6}>
                    <Grid container>
                      <Grid item xs={12} md={5}>
                        <ImageCarouselPreview
                          photos={
                            (d.items ?? [])
                              .filter((it: any) => !it.__isMeal)
                              .flatMap((p: any) => p.photos?.slice(0, 3) ?? [])
                          }
                        />
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
                                    {it.description && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{it.description}</Typography>}
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
                  <Typography>No itinerary generated yet. Use Dynamic Itinerary Generator to create one.</Typography>
                </Paper>
              )}
            </Stack>
          </Grid>

          {/* Right column: travel, stay, price summary, actions */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <Paper sx={{ p: 2, borderRadius: 3 }}>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Avatar sx={{ bgcolor: '#00a152' }}>
                      <FlightTakeoff />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {travelDoc?.meta?.departure ?? '—'} → {travelDoc?.meta?.destination ?? '—'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {travelDoc?.meta?.outboundDate ?? '—'} • Transport summary
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider sx={{ my: 1 }} />

                  <Box>
                    {/* Outbound item(s) */}
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Outbound</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {(selections as any)?.transportSelections?.outbound?.option
                        ? `${(selections as any).transportSelections.outbound.option.operator ?? (selections as any).transportSelections.outbound.option.airline ?? 'Selected transport'} • Arrive: ${(selections as any).transportSelections.outbound.option.arrivalTime ?? 'TBD'}`
                        : 'Not selected'}
                    </Typography>

                    <Box sx={{ height: 8 }} />

                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Return</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {(selections as any)?.transportSelections?.return?.option
                        ? `${(selections as any).transportSelections.return.option.operator ?? (selections as any).transportSelections.return.option.airline ?? 'Selected transport'} • Arrive: ${(selections as any).transportSelections.return.option.arrivalTime ?? 'TBD'}`
                        : 'Not selected'}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              {/* Replaced the old stay block with the redesigned card */}
              <RenderStayCard />

              <Paper sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Price summary</Typography>
                <Divider sx={{ my: 1 }} />
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Travel</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>₹{travelCost}</Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Stay</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>₹{stayCost}</Typography>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Activities / Attractions</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>₹{activitiesCost}</Typography>
                  </Stack>

                  <Divider />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Total</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900 }}>₹{totalCost}</Typography>
                  </Stack>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2, borderRadius: 3 }}>
                <Button variant="contained" fullWidth onClick={() => router.push('/dashboard/itinerary')}>Edit Itinerary</Button>
                <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={() => router.push('/dashboard/success')}>Confirm Booking</Button>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      </div>
    </Box>
  );
}
