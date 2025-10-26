'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Stack, Button, Chip, Divider, Avatar, Alert, IconButton, Tooltip, Grid, useMediaQuery, useTheme
} from '@mui/material';
import {
  Delete, ArrowUpward, ArrowDownward, Add, Star, FlightTakeoff, Hotel as HotelIcon, Place as PlaceIcon, Restaurant, Favorite, CalendarMonth, MonetizationOn, Undo
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTrip } from '../context/TripContext';
import { useRouter } from 'next/navigation';
import AiPrompt from './aipromptsection';

// Small inline stay card used inside itinerary days when per-day hotels are selected
function StayInlineCard({ hotel }: { hotel: any }) {
  if (!hotel) return null;
  return (
    <Paper elevation={3} sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', borderRadius: 2, mb: 1 }}>
      <Avatar sx={{ bgcolor: 'primary.main' }}><HotelIcon /></Avatar>
      <Box>
        <Typography sx={{ fontWeight: 800 }}>{hotel.name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{hotel.date ?? ''} • ₹{hotel.pricePerNight}</Typography>
      </Box>
      <Box sx={{ flex: 1 }} />
    </Paper>
  );
}

// Simple image carousel used inside cards
function ImageCarousel({ photos }: { photos?: string[] }) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const arr = photos ?? [];
  if (broken || !arr.length) {
    return (
      <Box sx={{ width: '100%', height: 200, bgcolor: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}>
        <PlaceIcon sx={{ fontSize: 36, color: '#9aa4b2' }} />
      </Box>
    );
  }
  return (
    <Box sx={{ position: 'relative', width: '100%', height: 260, overflow: 'hidden', borderRadius: 2 }}>
      <img
        src={arr[idx]}
        alt={String(idx)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => setBroken(true)}
      />
      {arr.length > 1 && (
        <>
          <IconButton size="small" onClick={() => setIdx((i) => (i - 1 + arr.length) % arr.length)} sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(0,0,0,0.35)', color: 'white' }}>‹</IconButton>
          <IconButton size="small" onClick={() => setIdx((i) => (i + 1) % arr.length)} sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(0,0,0,0.35)', color: 'white' }}>›</IconButton>
        </>
      )}
    </Box>
  );
}

/** Itinerary Card */
function ItineraryCard({ item, isHiddenGem, onDelete, onMoveUp, onMoveDown }: { item: any; isHiddenGem?: boolean; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void; }) {
  const isMeal = !!item?.__isMeal;
  const [showWeather, setShowWeather] = React.useState(false);
  const weather = item?.weather ?? null;
  const weatherLabel = weather && (weather.condition ?? weather.summary) ? `${weather.condition ?? weather.summary}, ${weather.temperature ?? weather.avg_temp ?? ''}°C` : null;
  return (
    <Paper elevation={6} sx={{ borderRadius: 3, overflow: 'hidden', transition: 'transform 180ms ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: 12 } }}>
      {isMeal ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}><Restaurant /></Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{item.title}</Typography>
            {item.description && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{item.description}</Typography>}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Move up"><IconButton size="small" onClick={onMoveUp}><ArrowUpward /></IconButton></Tooltip>
            <Tooltip title="Move down"><IconButton size="small" onClick={onMoveDown}><ArrowDownward /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" color="error" onClick={onDelete}><Delete /></IconButton></Tooltip>
          </Stack>
        </Box>
      ) : (
        <>
          <ImageCarousel photos={item.photos} />
          {/* Weather tab above card content */}
          <Box sx={{ px: 2, pt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            {weatherLabel ? (
              <Chip
                label={weatherLabel}
                size="small"
                color={String((weather && (weather.condition || weather.summary) || '').toLowerCase()).includes('rain') ? 'secondary' : 'primary'}
                onClick={() => setShowWeather(s => !s)}
                clickable
              />
            ) : (
              <Chip label="Weather: not available" size="small" onClick={() => setShowWeather(s => !s)} />
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{item.date ?? ''}</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{item.title}</Typography>
                  {isHiddenGem && <Chip label="Hidden Gem" color="secondary" icon={<Favorite />} size="small" />}
                </Stack>
                {item.description && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>{item.description}</Typography>}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                  {item.rating ? <Chip icon={<Star />} label={item.rating} size="small" sx={{ bgcolor: 'rgba(255,235,59,0.08)' }} /> : null}
                  <Chip icon={<MonetizationOn />} label={`₹${Number(item?.price ?? 0)}`} size="small" />
                </Stack>

                {item.reviews?.length ? <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>{item.reviews.slice(0, 2).join(' • ')}</Typography> : null}
              </Box>

              <Stack direction="row" spacing={1} alignItems="center">
                <Tooltip title="Move up"><IconButton size="small" onClick={onMoveUp}><ArrowUpward /></IconButton></Tooltip>
                <Tooltip title="Move down"><IconButton size="small" onClick={onMoveDown}><ArrowDownward /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={onDelete}><Delete /></IconButton></Tooltip>
              </Stack>
            </Stack>
            {/* Expandable weather details */}
            {showWeather && (
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              {weather && typeof weather === 'object' ? (
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{weather.condition ?? weather.summary ?? 'N/A'}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{weather.temperature ?? weather.avg_temp ?? 'not available'}°C</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Data provided by backend</Typography>
                </Stack>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Weather not available for this place.</Typography>
              )}
            </Box>
        )}
      </Box>
        </>
      )}
    </Paper>
  );
}

export default function ItineraryPage(): JSX.Element {
  const { inputJson, travelDoc, accommodationDoc, generatedPlan, setGeneratedPlan, selections, setSelections } = useTrip();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));
  const router = useRouter();

  const [localItinerary, setLocalItinerary] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [hiddenGems, setHiddenGems] = useState<any[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastFetchedSnapshot, setLastFetchedSnapshot] = useState<any | null>(null);

  const [outboundTransport, setOutboundTransport] = useState<any>(null);
  const [returnTransport, setReturnTransport] = useState<any>(null);
  const [selHotel, setSelHotel] = useState<any>(null);

  useEffect(() => {
    if (generatedPlan) {
      setLastFetchedSnapshot(generatedPlan);
      setLocalItinerary(Array.isArray(generatedPlan.storyItinerary) ? JSON.parse(JSON.stringify(generatedPlan.storyItinerary)) : buildDaysFromInput(inputJson));
      setSuggested(Array.isArray(generatedPlan.suggestedPlaces) ? JSON.parse(JSON.stringify(generatedPlan.suggestedPlaces)) : []);
      setHiddenGems(Array.isArray(generatedPlan.hiddenGems) ? JSON.parse(JSON.stringify(generatedPlan.hiddenGems)) : []);
    } else {
      setLocalItinerary(buildDaysFromInput(inputJson));
      setSuggested([]);
      setHiddenGems([]);
      setLastFetchedSnapshot(null);
    }

    const selOut = (selections as any)?.transportSelections?.outbound?.option ?? getFirstOption(travelDoc, 'outbound');
    const selRet = (selections as any)?.transportSelections?.return?.option ?? getFirstOption(travelDoc, 'return');
    setOutboundTransport(selOut);
    setReturnTransport(selRet);

    // pick single-hotel booking if useSameHotel
    const hotelsSelection = (selections as any)?.hotelsSelection;
    if (hotelsSelection?.useSameHotel) {
      const sh = hotelsSelection?.booking ?? (accommodationDoc?.hotels?.[0] ? { hotelId: accommodationDoc.hotels[0].id, name: accommodationDoc.hotels[0].name, totalPrice: accommodationDoc.hotels[0].pricePerNight } : null);
      setSelHotel(sh);
    } else {
      // keep selHotel null when per-day hotels are used
      setSelHotel(null);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedPlan, inputJson, selections, travelDoc, accommodationDoc]);

  function buildDaysFromInput(inp: any) {
    const start = inp?.startDate ? new Date(inp.startDate) : new Date();
    const end = inp?.endDate ? new Date(inp.endDate) : new Date(start.getTime() + 24 * 3600 * 1000);
    const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)));
    const days: any[] = [];
    for (let i = 0; i < diff; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ id: `day-${i + 1}`, title: `Day ${i + 1}`, date: d.toISOString().slice(0, 10), items: [{ id: `meal-day-${i + 1}-0`, __isMeal: true, title: 'Breakfast', description: 'Start the day with a relaxed breakfast.' }] });
    }
    return days;
  }

  function getFirstOption(doc: any, leg: 'outbound' | 'return') {
    const legDoc = doc?.legs?.[leg];
    if (!legDoc) return null;
    for (const k of ['train', 'flight', 'bus', 'own']) {
      const opts = legDoc.transport?.[k]?.options ?? [];
      if (opts.length) return opts[0];
    }
    return null;
  }

  function isDuplicateInDay(dayItems: any[], sourceItem: any) {
    if (!Array.isArray(dayItems)) return false;
    const baseId = sourceItem?._originId ?? sourceItem.id;
    return dayItems.some((it: any) => ((it._originId ?? it.id) === baseId));
  }

  const onDragEnd = useCallback((result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    const srcId = source.droppableId;
    const dstId = destination.droppableId;

    // same pool reorder
    if ((srcId === 'suggested' || srcId === 'hidden') && srcId === dstId) {
      const arr = srcId === 'suggested' ? Array.from(suggested) : Array.from(hiddenGems);
      const [m] = arr.splice(source.index, 1);
      arr.splice(destination.index, 0, m);
      if (srcId === 'suggested') setSuggested(arr); else setHiddenGems(arr);
      return;
    }

    // day reorder within same day
    if (srcId.startsWith('day-') && dstId === srcId) {
      const dayIdx = Number(srcId.replace('day-', '')) - 1;
      setLocalItinerary(prev => {
        const next = prev.map((d, i) => i === dayIdx ? { ...d, items: [...(d.items || [])] } : d);
        const items = next[dayIdx].items || [];
        const [m] = items.splice(source.index, 1);
        items.splice(destination.index, 0, m);
        return next;
      });
      return;
    }

    // pool -> day (copy)
    if ((srcId === 'suggested' || srcId === 'hidden') && dstId.startsWith('day-')) {
      const pool = srcId === 'suggested' ? suggested : hiddenGems;
      const item = pool[source.index];
      const dayIdx = Number(dstId.replace('day-', '')) - 1;
      setLocalItinerary(prev => {
        const next = prev.map((d, i) => i === dayIdx ? { ...d, items: [...(d.items || [])] } : d);
        const dayItems = next[dayIdx].items || [];
        if (isDuplicateInDay(dayItems, item)) { setWarning('This place already exists in the selected day.'); return prev; }
        const inst = { ...item, id: `${item.id}-inst-${Date.now()}`, _originId: item.id };
        dayItems.splice(destination.index, 0, inst);
        return next;
      });
      return;
    }

    // day -> pool (move out)
    if (srcId.startsWith('day-') && (dstId === 'suggested' || dstId === 'hidden')) {
      const dayIdx = Number(srcId.replace('day-', '')) - 1;
      setLocalItinerary(prev => {
        const next = prev.map((d, i) => i === dayIdx ? { ...d, items: [...(d.items || [])] } : d);
        const [removed] = next[dayIdx].items.splice(source.index, 1);
        const poolItem = removed._originId ? { ...removed, id: removed._originId } : { ...removed };
        const insertItem = { ...poolItem, id: `${poolItem.id}-from-day-${Date.now()}` };
        if (dstId === 'suggested') setSuggested(prevPool => { const p = Array.from(prevPool); p.splice(destination.index, 0, insertItem); return p; });
        else setHiddenGems(prevPool => { const p = Array.from(prevPool); p.splice(destination.index, 0, insertItem); return p; });
        return next;
      });
      return;
    }

    // day -> day (move between days) allowed but prevent duplicates
    if (srcId.startsWith('day-') && dstId.startsWith('day-')) {
      const sIdx = Number(srcId.replace('day-', '')) - 1;
      const dIdx = Number(dstId.replace('day-', '')) - 1;
      setLocalItinerary(prev => {
        const next = prev.map((d, i) => i === sIdx || i === dIdx ? { ...d, items: [...(d.items || [])] } : d);
        const [moved] = next[sIdx].items.splice(source.index, 1);
        const destItems = next[dIdx].items || [];
        const originBase = moved._originId ?? moved.id;
        if (destItems.some((it: any) => ((it._originId ?? it.id) === originBase))) {
          setWarning('This place already exists in the destination day.');
          next[sIdx].items.splice(source.index, 0, moved);
          return next;
        }
        if (!moved._originId) moved._originId = moved.id;
        destItems.splice(destination.index, 0, moved);
        return next;
      });
      return;
    }
  }, [hiddenGems, suggested]);

  const deleteFromDay = useCallback((dayIndex: number, itemIndex: number) => {
    setLocalItinerary(prev => prev.map((d, i) => i === dayIndex ? { ...d, items: d.items.filter((_: any, idx: number) => idx !== itemIndex) } : d));
  }, []);

  const moveWithinDay = useCallback((dayIndex: number, idx: number, dir: -1 | 1) => {
    setLocalItinerary(prev => {
      const d = prev[dayIndex];
      const items = [...(d.items || [])];
      const newIndex = Math.max(0, Math.min(items.length - 1, idx + dir));
      if (newIndex === idx) return prev;
      const [it] = items.splice(idx, 1);
      items.splice(newIndex, 0, it);
      return prev.map((day, i) => i === dayIndex ? { ...day, items } : day);
    });
  }, []);

  const saveLocalToContextAndContinue = useCallback(() => {
    const payload = {
      meta: { departure: inputJson?.departure, destination: inputJson?.destination, startDate: inputJson?.startDate, endDate: inputJson?.endDate, updatedAt: new Date().toISOString() },
      storyItinerary: localItinerary,
      suggestedPlaces: suggested,
      hiddenGems: hiddenGems,
      specialInstructions: generatedPlan?.specialInstructions ?? '',
    };
    setGeneratedPlan?.(payload);
    setSelections?.((prev: any) => ({ ...(prev || {}), itinerary: localItinerary }));
    router.push('/dashboard/preview');
  }, [generatedPlan?.specialInstructions, hiddenGems, inputJson?.departure, inputJson?.destination, inputJson?.endDate, inputJson?.startDate, localItinerary, router, setGeneratedPlan, setSelections, suggested]);

  const restoreAIPlan = useCallback(() => {
    if (!lastFetchedSnapshot) { setWarning('No AI plan available to restore.'); return; }
    setLocalItinerary(lastFetchedSnapshot.storyItinerary ? JSON.parse(JSON.stringify(lastFetchedSnapshot.storyItinerary)) : []);
    setSuggested(lastFetchedSnapshot.suggestedPlaces ? JSON.parse(JSON.stringify(lastFetchedSnapshot.suggestedPlaces)) : []);
    setHiddenGems(lastFetchedSnapshot.hiddenGems ? JSON.parse(JSON.stringify(lastFetchedSnapshot.hiddenGems)) : []);
    setWarning(null);
  }, [lastFetchedSnapshot]);

  const perDayCosts = useMemo(() => localItinerary.map(day => (day.items || []).reduce((s: any, it: any) => s + (Number(it?.price || 0)), 0)), [localItinerary]);
  const totalEstimate = useMemo(() => perDayCosts.reduce((s: number, v: number) => s + v, 0), [perDayCosts]);

  // helper to get per-day hotel from selections
  const hotelsSelection = (selections as any)?.hotelsSelection;
  const bookingPerDayMap: Record<string, any> = {};
  if (hotelsSelection && !hotelsSelection.useSameHotel && Array.isArray(hotelsSelection.bookingPerDay)) {
    hotelsSelection.bookingPerDay.forEach((b: any) => { bookingPerDayMap[b.day] = b; });
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', py: 4, px: { xs: 2, md: 3 } }}>
      <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: 'primary.main' }}><FlightTakeoff /></Avatar>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{inputJson?.departure ?? '—'} → {inputJson?.destination ?? '—'}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{inputJson?.startDate ?? '—'} — {inputJson?.endDate ?? '—'} • {inputJson?.members?.adults ?? 1} adults</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Chip icon={<CalendarMonth />} label={`${localItinerary.length} day(s)`} />
            <Chip icon={<MonetizationOn />} label={`Est. ₹${totalEstimate}`} color="primary" />
            <Button startIcon={<Undo />} variant="outlined" size="small" onClick={restoreAIPlan}>Restore AI plan</Button>
          </Stack>
        </Stack>
      </Paper>

      {/* AI Prompt component */}
      <Box sx={{ mb: 2 }}>
        <AiPrompt />
      </Box>

      {warning && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarning(null)}>{warning}</Alert>}

      <DragDropContext onDragEnd={onDragEnd}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            {/* Outbound summary */}
            <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: '#00a152' }}><FlightTakeoff /></Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{travelDoc?.legs?.outbound?.label ?? 'Outbound'}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{outboundTransport ? `${outboundTransport.operator ?? outboundTransport.airline ?? ''} • Arrive: ${outboundTransport?.arrivalTime ?? 'TBD'}` : 'No transport selected'}</Typography>
                </Box>
                <Typography sx={{ fontWeight: 700 }}>₹{Number(outboundTransport?.price ?? 0)}</Typography>
              </Stack>
            </Paper>

            {/* Stay summary (single booking) */}
            {hotelsSelection?.useSameHotel ? (
              <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: '#1976d2' }}><HotelIcon /></Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{selHotel?.name ?? 'No hotel selected'}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{selHotel ? `Check-in: ${selHotel.checkIn ?? inputJson?.startDate} • Check-out: ${selHotel.checkOut ?? inputJson?.endDate}` : 'Choose a hotel on the Stay page.'}</Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 700 }}>{selHotel?.totalPrice ? `₹${selHotel.totalPrice}` : ''}</Typography>
                </Stack>
              </Paper>
            ) : null}

            {/* AI itinerary days */}
            <Box sx={{ mb: 2 }}>
              <Stack spacing={2}>
                {localItinerary.map((day: any, dayIndex: number) => (
                  <Paper key={day.id} sx={{ p: 2, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ bgcolor: 'primary.dark' }}>{dayIndex + 1}</Avatar>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>{day.title} — {day.date}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Drag items inside the day to reorder; drop to move here.</Typography>
                        </Box>
                      </Stack>
                      <Typography variant="caption">Items: {day.items?.length ?? 0} • Est: ₹{(day.items || []).reduce((s: any, it: any) => s + (Number(it?.price || 0)), 0)}</Typography>
                    </Stack>

                    <Divider sx={{ my: 1 }} />

                    {/* If per-day hotels are selected, render the stay card for this day above the day's itinerary */}
                    {!hotelsSelection?.useSameHotel && bookingPerDayMap[day.id] ? (
                      <StayInlineCard hotel={bookingPerDayMap[day.id]} />
                    ) : null}

                    <Droppable droppableId={day.id}>
                      {(provided: any) => (
                        <Box ref={provided.innerRef} {...provided.droppableProps} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {Array.isArray(day.items) && day.items.map((it: any, i: number) => (
                            <Draggable key={it.id} draggableId={it.id} index={i}>
                              {(dr: any) => (
                                <Box ref={dr.innerRef} {...dr.draggableProps} {...dr.dragHandleProps}>
                                  <ItineraryCard
                                    item={it}
                                    isHiddenGem={!!it._originId ? hiddenGems.some(h => h.id === it._originId) : hiddenGems.some(h => h.id === it.id)}
                                    onDelete={() => deleteFromDay(dayIndex, i)}
                                    onMoveUp={() => moveWithinDay(dayIndex, i, -1)}
                                    onMoveDown={() => moveWithinDay(dayIndex, i, +1)}
                                  />
                                </Box>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </Box>
                      )}
                    </Droppable>
                  </Paper>
                ))}
              </Stack>
            </Box>

            {/* Return summary (same style as outbound) */}
            <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: '#ff7043' }}><FlightTakeoff /></Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{travelDoc?.legs?.return?.label ?? 'Return'}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{returnTransport ? `${returnTransport.operator ?? returnTransport.airline ?? ''} • Arrive: ${returnTransport?.arrivalTime ?? 'TBD'}` : 'No return transport selected'}</Typography>
                </Box>
                <Typography sx={{ fontWeight: 700 }}>₹{Number(returnTransport?.price ?? 0)}</Typography>
              </Stack>
            </Paper>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => router.push('/dashboard/stay')}>Back: Stay</Button>
              <Button variant="contained" onClick={saveLocalToContextAndContinue}>Save & Continue to Preview</Button>
            </Box>
          </Grid>

          {/* Right side: Suggested & Hidden (sticky on desktop) */}
          <Grid item xs={12} md={4} sx={{ position: isSmall ? 'static' : 'sticky', top: isSmall ? 'auto' : '20px', alignSelf: 'flex-start' }}>
            <Stack spacing={2}>

              <Paper sx={{ p: 2, borderRadius: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar sx={{ bgcolor: '#0288d1' }}><PlaceIcon /></Avatar>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Suggested Places</Typography>
                  </Stack>
                  <Typography variant="caption">{suggested.length}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Droppable droppableId="suggested">
                  {(provided: any) => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {suggested.map((s: any, i: number) => (
                        <Draggable key={s.id} draggableId={s.id} index={i}>
                          {(dr: any) => (
                            <Paper ref={dr.innerRef} {...dr.draggableProps} {...dr.dragHandleProps} sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderRadius: 2 }}>
                              <Avatar src={s.photos?.[0] || '/placeholder.jpg'} variant="rounded" sx={{ width: 64, height: 64 }} />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.title}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.description}</Typography>
                              </Box>
                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Add to first day"><IconButton size="small" onClick={() => {
                                  const inst = { ...s, id: `${s.id}-inst-${Date.now()}`, _originId: s.id };
                                  setLocalItinerary(prev => prev.map((d, i) => i === 0 ? { ...d, items: [...(d.items || []), inst] } : d));
                                }}><Add /></IconButton></Tooltip>
                              </Stack>
                            </Paper>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Paper>

              <Paper sx={{ p: 2, borderRadius: 3, borderLeft: '4px solid #7b1fa2', bgcolor: 'rgba(123,31,162,0.03)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar sx={{ bgcolor: '#7b1fa2' }}><Favorite /></Avatar>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Hidden Gems</Typography>
                  </Stack>
                  <Typography variant="caption">{hiddenGems.length}</Typography>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Droppable droppableId="hidden">
                  {(provided: any) => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {hiddenGems.map((s: any, i: number) => (
                        <Draggable key={s.id} draggableId={s.id} index={i}>
                          {(dr: any) => (
                            <Paper ref={dr.innerRef} {...dr.draggableProps} {...dr.dragHandleProps} sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderLeft: '4px solid #7b1fa2', borderRadius: 2 }}>
                              <Avatar src={s.photos?.[0] || '/placeholder.jpg'} variant="rounded" sx={{ width: 64, height: 64 }} />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.title}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.description}</Typography>
                              </Box>
                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Add to first day"><IconButton size="small" onClick={() => {
                                  const inst = { ...s, id: `${s.id}-inst-${Date.now()}`, _originId: s.id };
                                  setLocalItinerary(prev => prev.map((d, i) => i === 0 ? { ...d, items: [...(d.items || []), inst] } : d));
                                }}><Add /></IconButton></Tooltip>
                              </Stack>
                            </Paper>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      </DragDropContext>
    </Box>
  );
}
