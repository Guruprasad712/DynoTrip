// app/dashboard/itinerary/AiPrompt.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  Paper,
  Stack,
  Avatar,
  Typography,
  TextField,
  Button,
  Chip,
  Box,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { AutoFixHigh, Undo, Bolt } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';

export default function AiPrompt({
  autoTrigger = false,
  onBeforeCall,
  onAfterCall,
}: {
  autoTrigger?: boolean;
  onBeforeCall?: () => void;
  onAfterCall?: (success: boolean) => void;
}) {
  const { generatedPlan, setGeneratedPlan, inputJson, selections, setMockGeneratedPlan } = useTrip();
  const [prompt, setPrompt] = useState<string>(generatedPlan?.specialInstructions ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allowProceedManual, setAllowProceedManual] = useState<boolean>(false);

  // Keep local input in sync when generatedPlan.specialInstructions changes externally
  useEffect(() => {
    setPrompt(generatedPlan?.specialInstructions ?? '');
  }, [generatedPlan?.specialInstructions]);

  // Simple suggestions that map to specialInstructions
  const suggestionChips = [
    'Relaxed mornings — max 2 activities/day',
    'Prefer seaside & sunset spots',
    'Family-friendly, low walking',
    'Include local markets & heritage',
  ];

  // Update TripContext specialInstructions only (no network)
  function savePromptLocally(text: string) {
    try {
      setGeneratedPlan?.({
        ...(generatedPlan ?? {}),
        specialInstructions: text,
      });
      setMessage('Your preference was saved to the itinerary.');
      setTimeout(() => setMessage(null), 2200);
    } catch (err) {
      console.error('savePromptLocally error', err);
      setMessage('Could not save locally — try again.');
      setTimeout(() => setMessage(null), 2200);
    }
  }

  // Clear only the text input (do NOT touch generatedPlan in context)
  function clearPromptInput() {
    setPrompt('');
    setMessage('Text cleared. Your saved itinerary remains unchanged.');
    setTimeout(() => setMessage(null), 2200);
  }

  // Regenerate itinerary (friendly behavior + network call via proxy)
  async function regenerateItinerary() {
    // Save prompt locally first so UI reflects intent
    savePromptLocally(prompt);

    onBeforeCall?.();
    setLoading(true);
    setMessage('Updating your itinerary — hang tight...');
    setAllowProceedManual(false);

    try {
      // Choose endpoint from env if provided. Prefer a real backend if NEXT_PUBLIC_API_BASE is set,
      // otherwise fall back to the local proxy route used during frontend-only dev.
      const MCP_REGENERATE = process.env.NEXT_PUBLIC_MCP_REGENERATE
        ?? (process.env.NEXT_PUBLIC_API_BASE ? `${process.env.NEXT_PUBLIC_API_BASE}/itinerary-from-selections` : '/api/mcp/regenerate');

      // Ensure specialInstructions is a field inside generatedPlan per MCP contract
      const bodyGeneratedPlan = (generatedPlan
        ? { ...generatedPlan, specialInstructions: prompt ?? generatedPlan.specialInstructions }
        : {
            meta: {
              departure: inputJson?.departure,
              destination: inputJson?.destination,
              startDate: inputJson?.startDate,
              endDate: inputJson?.endDate,
            },
            specialInstructions: prompt ?? '',
            storyItinerary: [],
            suggestedPlaces: [],
            hiddenGems: [],
          }
      );

      const res = await fetch(MCP_REGENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: bodyGeneratedPlan }),
      });

      if (!res.ok) {
        // Non-2xx from proxy/backend -> fallback
        const text = await res.text().catch(() => '');
        console.warn('Regenerate responded non-OK', res.status, text);
        setMessage('Couldn’t update from server — your notes were saved locally.');
        setAllowProceedManual(true);
        onAfterCall?.(false);
        return;
      }

      const payload = await res.json().catch(() => null);
      if (payload?.generatedPlan) {
        setGeneratedPlan?.(payload.generatedPlan);
        setMessage('Itinerary updated.');
        onAfterCall?.(true);
      } else {
        setMessage('No updated itinerary received — notes saved locally.');
        setAllowProceedManual(true);
        onAfterCall?.(false);
      }
    } catch (err) {
      console.error('regenerateItinerary failed', err);
      setMessage('Network error — your notes were saved locally.');
      setAllowProceedManual(true);
      onAfterCall?.(false);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 2800);
    }
  }

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: 'secondary.main' }}>
            <AutoFixHigh />
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Dynamic Itinerary Generator
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Add short preferences to tweak your itinerary. Example suggestions are below — tap to add.
            </Typography>
          </Box>
        </Stack>

        <TextField
          fullWidth
          multiline
          minRows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder=""
          aria-label="Itinerary preferences"
        />

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {suggestionChips.map((s) => (
            <Tooltip key={s} title="Tap to append this suggestion">
              <Chip
                label={s}
                onClick={() => setPrompt((p) => (p ? `${p} • ${s}` : s))}
                clickable
                variant="outlined"
                size="small"
              />
            </Tooltip>
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<Bolt />}
            onClick={regenerateItinerary}
            disabled={loading}
          >
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Regenerate Itinerary'}
          </Button>

          <Button
            variant="outlined"
            startIcon={<Undo />}
            onClick={clearPromptInput}
            disabled={loading}
          >
            Clear
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
                setAllowProceedManual(false);
              }}
            >
              Proceed with Mock data
            </Button>
          )}
        </Box>

        {message && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{message}</Typography>}

        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Tip: short and clear instructions give best results.
        </Typography>
      </Stack>
    </Paper>
  );
}
