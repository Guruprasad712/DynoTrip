// app/dashboard/travel/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Grid,
  Stack,
  Button,
  Alert,
  Chip,
  Paper,
  TextField,
} from '@mui/material';
import { FlightTakeoff, Train, DirectionsBus, DriveEta } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';
import { useRouter } from 'next/navigation';

function TransportCard({
  typeLabel,
  option,
  isRecommended,
  isSelected,
  onSelect,
  children,
}: {
  typeLabel: string;
  option: any;
  isRecommended?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Paper
      elevation={6}
      sx={{
        p: 2,
        borderRadius: 3,
        position: 'relative',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {isRecommended && (
        <Chip
          label="Recommended"
          color="primary"
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        />
      )}

      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {option.operator ?? option.airline ?? option.title ?? typeLabel}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {option.departureTime ? `${option.departureTime} → ${option.arrivalTime}` : option.notes ?? ''}
          </Typography>
        </Box>

        <Stack alignItems="center" spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{option.price !== undefined ? `₹${option.price}` : ''}</Typography>
          <Button variant={isSelected ? 'contained' : 'outlined'} size="small" onClick={onSelect}>
            {isSelected ? 'Selected' : 'Select'}
          </Button>
        </Stack>
      </Stack>

      {/* children (own calculator controls) */}
      {children ? <Box sx={{ mt: 1 }}>{children}</Box> : null}
    </Paper>
  );
}

/** Own transport calculator: does NOT auto-select.
 *  It returns an 'Apply estimate' button which will call onApply(updatedOption)
 */
function OwnCalculator({ opt, onApply }: { opt: any; onApply: (opt: any) => void }) {
  const distance = opt?.distanceKm ?? opt?.distance ?? 0;
  const [perKm, setPerKm] = useState<number>(opt?.basePerKmRate ?? 12);
  const [tolls, setTolls] = useState<number>(opt?.tollsApprox ?? 0);

  const estimated = Math.round(perKm * distance + Number(tolls || 0));

  return (
    <Paper sx={{ mt: 1, p: 2, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.03)' }} elevation={0}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="caption">Distance: <strong>{distance} km</strong></Typography>
        <TextField size="small" label="Per km (₹)" value={perKm} onChange={(e) => setPerKm(Number(e.target.value || 0))} sx={{ width: 120 }} />
        <TextField size="small" label="Tolls (₹)" value={tolls} onChange={(e) => setTolls(Number(e.target.value || 0))} sx={{ width: 120 }} />
        <Box sx={{ flex: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Est: ₹{estimated}</Typography>
        <Button size="small" variant="outlined" onClick={() => onApply({ ...opt, basePerKmRate: perKm, tollsApprox: tolls, price: estimated })}>
          Apply estimate
        </Button>
      </Stack>
    </Paper>
  );
}

export default function TravelPage() {
  const { travelDoc, selections, setSelections } = useTrip();
  const router = useRouter();

  const [docData, setDocData] = useState<any>(travelDoc ?? null);
  const [currentLeg, setCurrentLeg] = useState<'outbound' | 'return'>('outbound');
  const categories = useMemo(() => ['bus', 'train', 'flight', 'own'], []);
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [selectedByLeg, setSelectedByLeg] = useState<any>({});
  const [warning, setWarning] = useState<string | null>(null);

  // sync with TripContext travelDoc changes
  useEffect(() => {
    setDocData(travelDoc ?? null);
  }, [travelDoc]);

  // initialize recommended default selections ONCE when travelDoc arrives
  useEffect(() => {
    if (!docData) return;
    const init: any = {};
    (['outbound', 'return'] as const).forEach((leg) => {
      const r = docData.legs?.[leg]?.recommended;
      if (r) {
        const opt = docData.legs?.[leg]?.transport?.[r.type]?.options?.find((o: any) => o.id === r.optionId);
        if (opt) init[leg] = { type: r.type, optionId: r.optionId, option: opt };
      } else {
        // pick first available type option for this leg (but do not auto-apply "own" calculations)
        for (const k of ['train', 'flight', 'bus', 'own']) {
          const arr = docData.legs?.[leg]?.transport?.[k]?.options ?? [];
          if (arr.length) { init[leg] = { type: k, optionId: arr[0].id, option: arr[0] }; break; }
        }
      }
    });
    setSelectedByLeg(init);
    // set default tab to recommended type (outbound first)
    const recType = docData.legs?.outbound?.recommended?.type ?? Object.keys(docData.legs?.outbound?.transport || {})[0] ?? 'train';
    const idx = categories.indexOf(recType) >= 0 ? categories.indexOf(recType) : 0;
    setTabIndex(idx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docData]);

  const activeType = categories[tabIndex];
  const legDoc = docData?.legs?.[currentLeg];
  const options = legDoc?.transport?.[activeType]?.options ?? [];

  /** onSelect: called only when user presses Select (or Apply estimate -> which also triggers onSelect) */
  function handleSelectOption(opt: any, type?: string) {
    const ty = type ?? activeType;
    const selection = { type: ty, optionId: opt.id, option: opt };
    const next = { ...selectedByLeg, [currentLeg]: selection };
    setSelectedByLeg(next);
    setSelections?.((prev: any) => ({ ...(prev || {}), transportSelections: { ...(prev?.transportSelections || {}), [currentLeg]: selection } }));
  }

  function persistAndNext() {
    const outboundSel = selectedByLeg.outbound;
    if (!outboundSel) { setWarning('Please select an outbound transport option'); return; }
    // already stored using handleSelectOption; ensure return saved too
    setSelections?.((prev: any) => ({ ...(prev || {}), transportSelections: selectedByLeg }));
    router.push('/dashboard/stay');
  }

  // summary bottom
  const summary = useMemo(() => {
    const outbound = selectedByLeg.outbound?.option;
    const ret = selectedByLeg.return?.option;
    const a = Number(outbound?.price || 0);
    const b = Number(ret?.price || 0);
    return { outbound, return: ret, total: a + b };
  }, [selectedByLeg]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3, px: { xs: 2, md: 3 } }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Choose travel options</Typography>

      {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
      {!docData && <Alert severity="info">No travel data available. Use homepage Plan My Trip to generate suggestions.</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <Button variant={currentLeg === 'outbound' ? 'contained' : 'outlined'} onClick={() => setCurrentLeg('outbound')}>Outbound</Button>
        <Button variant={currentLeg === 'return' ? 'contained' : 'outlined'} onClick={() => setCurrentLeg('return')}>Return</Button>
      </Stack>

      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 2 }}>
        <Tab label={<Stack direction="row" spacing={1} alignItems="center"><DirectionsBus />Bus {legDoc?.recommended?.type === 'bus' && <Chip label="Rec" size="small" color="primary" />}</Stack>} />
        <Tab label={<Stack direction="row" spacing={1} alignItems="center"><Train />Train {legDoc?.recommended?.type === 'train' && <Chip label="Rec" size="small" color="primary" />}</Stack>} />
        <Tab label={<Stack direction="row" spacing={1} alignItems="center"><FlightTakeoff />Flight {legDoc?.recommended?.type === 'flight' && <Chip label="Rec" size="small" color="primary" />}</Stack>} />
        <Tab label={<Stack direction="row" spacing={1} alignItems="center"><DriveEta />Own {legDoc?.recommended?.type === 'own' && <Chip label="Rec" size="small" color="primary" />}</Stack>} />
      </Tabs>

      <Grid container spacing={2}>
        {options.length === 0 ? (
          <Grid item xs={12}><Alert severity="info">No {activeType} transport available for this leg.</Alert></Grid>
        ) : options.map((opt: any) => {
          const rec = legDoc?.recommended;
          const isRecommended = (rec?.type === activeType && rec?.optionId === opt.id) || !!opt.recommended;
          const selectedForLeg = selectedByLeg[currentLeg];
          const isSelected = selectedForLeg && selectedForLeg.type === activeType && selectedForLeg.optionId === opt.id;

          return (
            <Grid item xs={12} md={6} key={opt.id}>
              <TransportCard
                typeLabel={legDoc?.transport?.[activeType]?.label ?? activeType}
                option={opt}
                isRecommended={isRecommended}
                isSelected={!!isSelected}
                onSelect={() => handleSelectOption(opt, activeType)}
              >
                {activeType === 'own' ? <OwnCalculator opt={opt} onApply={(u) => handleSelectOption(u, 'own')} /> : null}
              </TransportCard>
            </Grid>
          );
        })}
      </Grid>

      {/* Summary */}
      <Paper sx={{ p: 2, mt: 3, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Selection summary</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Outbound: {summary.outbound ? `${summary.outbound.operator ?? summary.outbound.airline ?? ''} • Arrive: ${summary.outbound?.arrivalTime ?? 'TBD'}` : 'Not selected'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Return: {summary.return ? `${summary.return.operator ?? summary.return.airline ?? ''} • Arrive: ${summary.return?.arrivalTime ?? 'TBD'}` : 'Not selected'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Total: ₹{summary.total}</Typography>
            <Button variant="contained" sx={{ mt: 1 }} onClick={persistAndNext} disabled={!selectedByLeg.outbound}>Next: Stay</Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
