// app/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Grid,
  Stack,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Slider,
  Chip,
  TextField,
  CircularProgress,
  Card,
  CardContent,
  Checkbox,
  OutlinedInput,
  MenuItem as MUIMenuItem,
} from '@mui/material';
import { FlightTakeoff, TravelExplore, Hotel as HotelIcon } from '@mui/icons-material';
import { Inter } from 'next/font/google';
import { useRouter } from 'next/navigation';
import { useTrip } from './dashboard/context/TripContext';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

const DEPARTURES = ['Chennai', 'Salem', 'Bengaluru'];
const DESTINATIONS = ['Pondicherry', 'Yercaud', 'Kolli Hills'];
const THEMES = ['Heritage', 'Adventure', 'Relaxation', 'Food & Drink'];
const ACTIVITIES = ['Sightseeing', 'Hiking', 'Relax', 'Food', 'Photography'];

export default function Page() {
  const router = useRouter();
  const { setInputJson, applyMcpResponse, clearSelections, resetToSeed, setMockPlanFromInput } = useTrip();

  const [departure, setDeparture] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [budget, setBudget] = useState<number>(15000);
  const [adults, setAdults] = useState<number>(1); // Default to minimum 1 adult
  const [children, setChildren] = useState<number>(0);
  const [activities, setActivities] = useState<string[]>([]);
  const [tripTheme, setTripTheme] = useState<string>('');
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  
  // Error states
  const [errors, setErrors] = useState<{
    departure?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
    adults?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allowProceedSeed, setAllowProceedSeed] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const startRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLInputElement | null>(null);
  const [startType, setStartType] = useState<'text' | 'date'>('text');
  const [endType, setEndType] = useState<'text' | 'date'>('text');

  // env-configured endpoints (fallback to local mocked APIs)
  const MCP_PLAN = process.env.NEXT_PUBLIC_MCP_PLAN ?? '/api/mcp/plan';
  // const MCP_GENERATE = process.env.NEXT_PUBLIC_MCP_GENERATE ?? '/api/mcp/generate';

  useEffect(() => {
    setDeparture('');
    setDestination('');
    setStartDate('');
    setEndDate('');
    setBudget(15000);
    setAdults(2);
    setChildren(0);
    setActivities([]);
    setTripTheme('');
    setSpecialInstructions('');
    setAllowProceedSeed(false);
    // Force a remount of the form subtree so all controlled components reset visuals too
    setFormResetKey((k) => k + 1);
    // Handle browser back/forward cache restoring old state: reset on pageshow
    const handler = () => {
      setDeparture('');
      setDestination('');
      setStartDate('');
      setEndDate('');
      setBudget(15000);
      setAdults(2);
      setChildren(0);
      setActivities([]);
      setTripTheme('');
      setSpecialInstructions('');
      setAllowProceedSeed(false);
      setFormResetKey((k) => k + 1);
      clearSelections();
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
    clearSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!departure.trim()) newErrors.departure = 'Departure city is required';
    if (!destination.trim()) newErrors.destination = 'Destination is required';
    if (!startDate) newErrors.startDate = 'Start date is required';
    if (!endDate) newErrors.endDate = 'End date is required';
    if (adults < 1) newErrors.adults = 'At least 1 adult is required';

    // Validate end date is after start date
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      newErrors.endDate = 'End date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return; // Don't proceed if validation fails
    }

    const inputJson = {
      departure,
      destination,
      startDate,
      endDate,
      budget,
      members: { adults, children: children || undefined },
      activities: activities.length ? activities : ['Sightseeing'],
      tripTheme: tripTheme || undefined,
      specialInstructions: specialInstructions || undefined,
    };

    setInputJson(inputJson);
    setMockPlanFromInput(inputJson);
    router.push('/dashboard/travel');
  };

  async function handlePlanTrip() {
    setErrorMsg(null);
    const payload = {
      departure,
      destination,
      startDate,
      endDate,
      budget,
      members: { adults, children: children || undefined },
      activities: activities.length ? activities : ['Sightseeing'],
      tripTheme: tripTheme || undefined,
      specialInstructions: specialInstructions || undefined,
    };

    if (!validateForm()) {
      return; // Don't proceed if validation fails
    }

    setLoading(true);
    try {
      let res = await fetch(MCP_PLAN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputJson: payload }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('MCP call failed', res.status, txt);
        // try local proxy fallback
        try {
          res = await fetch('/api/mcp/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputJson: payload }),
          });
        } catch (e) {
          setErrorMsg('Could not fetch travel & stay suggestions — try again or continue manually.');
          router.push('/dashboard/travel');
          return;
        }
        if (!res.ok) {
          const txt2 = await res.text();
          console.error('Fallback MCP call failed', res.status, txt2);
          setErrorMsg('Could not fetch travel & stay suggestions.');
          setAllowProceedSeed(true);
          return;
        }
      }
      const j = await res.json();
      applyMcpResponse({ travelDoc: j.travelDoc, accommodationDoc: j.accommodationDoc });
      clearSelections();
      router.push('/dashboard/travel');
    } catch (err) {
      console.error('Plan trip failed', err);
      setErrorMsg('Network error while planning.');
      setAllowProceedSeed(true);
    } finally {
      setLoading(false);
    }
  }

  const handleActivitiesChange = (e: any) => {
    const value = e.target.value;
    setActivities(typeof value === 'string' ? value.split(',') : value);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', fontFamily: inter.style?.fontFamily }}>
      <Box sx={{ background: 'linear-gradient(120deg,#2b8a3e 0%, #1f6fbf 50%, #7cc1a6 100%)', color: 'common.white', py: { xs: 6, md: 10 }, px: { xs: 2, md: 6 } }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Box sx={{ width: 64, height: 64, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FlightTakeoff sx={{ fontSize: 30, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>GPtrix</Typography>
              <Typography variant="body2" sx={{ opacity: 0.95 }}>AI-Powered Trip Planner</Typography>
            </Box>
          </Stack>

          <Typography variant="h2" sx={{ fontWeight: 800, mb: 1 }}>Plan Your Perfect Journey</Typography>
          <Typography variant="body1" sx={{ opacity: 0.95, mb: 4, maxWidth: 760 }}>
            Quick preferences below — we’ll suggest travel & stays and generate an AI itinerary.
          </Typography>

          {/* Feature cards */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <TravelExplore />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Dynamic Itinerary Generator</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">AI crafts a personalized day-by-day plan that you can tweak with drag-and-drop.</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <HotelIcon />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Hidden Gems</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">Discover less-crowded attractions and local favorites curated for your trip.</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <FlightTakeoff />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Travel & Stay Booking</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">Pick recommended transport and stays, then confirm with a polished PDF and email.</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box key={formResetKey} sx={{ bgcolor: 'background.paper', borderRadius: 3, p: { xs: 2, md: 3.5 }, boxShadow: 6 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="departure-label">From</InputLabel>
                  <Select labelId="departure-label" label="From" value={departure} onChange={(e) => setDeparture(String(e.target.value))}>
                    <MenuItem value=""><em>Choose departure</em></MenuItem>
                    {DEPARTURES.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                  {errors.departure && <Typography color="error" sx={{ mt: 1 }}>{errors.departure}</Typography>}
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="destination-label">To</InputLabel>
                  <Select labelId="destination-label" label="To" value={destination} onChange={(e) => setDestination(String(e.target.value))}>
                    <MenuItem value=""><em>Choose destination</em></MenuItem>
                    {DESTINATIONS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                  {errors.destination && <Typography color="error" sx={{ mt: 1 }}>{errors.destination}</Typography>}
                </FormControl>
              </Grid>

              {/* Date inputs (avoid native dd-mm-yyyy hint; toggle type on focus) */}
              <Grid item xs={12} md={6}>
                <Box onMouseDown={(e) => { e.preventDefault(); const el = startRef.current; if (!el) return; if (startType !== 'date') setStartType('date'); requestAnimationFrame(() => { if ((el as any).showPicker) (el as any).showPicker(); else el.focus(); }); }}>
                  <TextField
                    inputRef={startRef}
                    fullWidth
                    label="Start Date"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (errors.startDate) {
                        setErrors({ ...errors, startDate: undefined });
                      }
                    }}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    required
                    size="small"
                    error={!!errors.startDate}
                    helperText={errors.startDate}
                  />
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box onMouseDown={(e) => { e.preventDefault(); const el = endRef.current; if (!el) return; if (endType !== 'date') setEndType('date'); requestAnimationFrame(() => { if ((el as any).showPicker) (el as any).showPicker(); else el.focus(); }); }}>
                  <TextField
                    inputRef={endRef}
                    fullWidth
                    label="End Date"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      if (errors.endDate) {
                        setErrors({ ...errors, endDate: undefined });
                      }
                    }}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    required
                    size="small"
                    error={!!errors.endDate}
                    helperText={errors.endDate}
                  />
                </Box>
              </Grid>


              <Grid item xs={12}>
                <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Budget</Typography>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Slider value={budget} min={1000} max={200000} step={500} onChange={(_, v) => setBudget(Array.isArray(v) ? v[0] : v)} sx={{ flex: 1 }} />
                  <Chip label={`₹${Math.round(budget / 1000)}K`} color="primary" />
                </Stack>
              </Grid>

              <Grid item xs={6} md={3}>
                <TextField 
                  fullWidth 
                  size="small" 
                  type="number" 
                  label="Adults" 
                  value={adults} 
                  onChange={(e) => {
                    const value = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                    setAdults(value);
                    if (errors.adults) {
                      setErrors({ ...errors, adults: undefined });
                    }
                  }}
                  inputProps={{ min: 1, max: 99 }}
                  error={!!errors.adults}
                  helperText={errors.adults}
                  onBlur={() => {
                    if (adults < 1) {
                      setAdults(1);
                    }
                  }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField fullWidth size="small" type="number" label="Children" value={children} onChange={(e) => setChildren(Number(e.target.value))} />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="activities-label">Activities</InputLabel>
                  <Select
                    labelId="activities-label"
                    multiple
                    value={activities}
                    onChange={handleActivitiesChange}
                    input={<OutlinedInput label="Activities" />}
                    renderValue={(selected) => (selected as string[]).join(', ')}
                  >
                    {ACTIVITIES.map((name) => (
                      <MUIMenuItem key={name} value={name}>
                        <Checkbox checked={activities.indexOf(name) > -1} />
                        <Typography>{name}</Typography>
                      </MUIMenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="theme-label">Trip theme</InputLabel>
                  <Select labelId="theme-label" value={tripTheme} label="Trip theme" onChange={(e) => setTripTheme(String(e.target.value))}>
                    <MenuItem value=""><em>Choose theme (optional)</em></MenuItem>
                    {THEMES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField multiline minRows={3} fullWidth size="small" label="Special instructions (optional)" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} placeholder="E.g. Prefer coastal views, vegetarian meals, relaxed mornings" />
              </Grid>

              <Grid item xs={12}>
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" size="large" onClick={handlePlanTrip} sx={{ borderRadius: 3, px: 4 }} disabled={loading}>
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'Plan My Trip'}
                  </Button>

                  <Button variant="outlined" size="large" onClick={() => {
                    setDeparture(''); setDestination(''); setStartDate(''); setEndDate(''); setBudget(15000); setAdults(2); setChildren(0); setActivities([]); setTripTheme(''); setSpecialInstructions('');
                    resetToSeed();
                  }} sx={{ borderRadius: 3 }}>
                    Reset
                  </Button>
                </Stack>

                {errorMsg && <Typography color="error" sx={{ mt: 2 }}>{errorMsg}</Typography>}
                {allowProceedSeed && (
                  <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        const payload = buildInputObject();
                        setMockPlanFromInput(payload);
                        router.push('/dashboard/travel');
                      }}
                    >
                      Proceed with Mock data
                    </Button>
                  </Stack>
                )}
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
        {/* nothing else here; travel/stay will show under /dashboard */}
      </Box>
    </Box >
  );
}
