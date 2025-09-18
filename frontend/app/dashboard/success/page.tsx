// app/dashboard/success/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Box, Paper, Stack, Typography, Avatar, Button, CircularProgress, TextField } from '@mui/material';
import { CheckCircleOutline, Home } from '@mui/icons-material';
import { useTrip } from '../context/TripContext';
import { useRouter } from 'next/navigation';

export default function SuccessPage() {
  const { inputJson, travelDoc, accommodationDoc, generatedPlan, selections } = useTrip();
  const router = useRouter();

  const [sending, setSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [emailTo, setEmailTo] = useState<string>(String((inputJson as any)?.email ?? ''));

  useEffect(() => {
    // no auto-send
  }, []);

  function buildEmail(): { subject: string; html: string } {
    const travelOutbound =
      (selections as any)?.transportSelections?.outbound?.option?.operator ??
      (selections as any)?.transportSelections?.outbound?.option?.airline ??
      (travelDoc?.legs?.outbound?.recommended?.type ?? '—');

    const travelReturn =
      (selections as any)?.transportSelections?.return?.option?.operator ??
      (selections as any)?.transportSelections?.return?.option?.airline ??
      (travelDoc?.legs?.return?.recommended?.type ?? '—');

    const hotelsSel = (selections as any)?.hotelsSelection;
    const perDayHtml = (() => {
      if (!hotelsSel || hotelsSel.useSameHotel || !Array.isArray(hotelsSel.bookingPerDay)) return '';
      const rows = hotelsSel.bookingPerDay.map((b: any) => (
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${b.date ?? ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${b.name ?? ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${Number(b.totalPrice ?? b.pricePerNight ?? 0)}</td>
        </tr>`
      )).join('');
      return `
        <h4 style="margin:24px 0 8px;">Accommodation (Per-Day)</h4>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;border-radius:10px;overflow:hidden;">
          <thead>
            <tr style="background:#f0f3f7">
              <th style="padding:10px 12px;text-align:left;color:#333;">Date</th>
              <th style="padding:10px 12px;text-align:left;color:#333;">Hotel</th>
              <th style="padding:10px 12px;text-align:right;color:#333;">Price</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })();

    const singleHotelHtml = (() => {
      if (!hotelsSel || !hotelsSel.useSameHotel || !hotelsSel.booking) return '';
      const b = hotelsSel.booking;
      return `
        <h4 style="margin:24px 0 8px;">Accommodation</h4>
        <div style="padding:12px 16px;border:1px solid #eee;border-radius:10px;background:#fafafa">
          <div style="font-weight:700;font-size:15px;color:#333;">${b.name ?? '—'}</div>
          <div style="color:#555;margin-top:4px;">Check-in: ${b.checkIn ?? inputJson?.startDate ?? '—'} • Check-out: ${b.checkOut ?? inputJson?.endDate ?? '—'}</div>
          <div style="margin-top:6px;color:#333;">Nights: ${Number(b.nights ?? 1)} • ₹${Number(b.pricePerNight ?? 0)}/night</div>
          <div style="margin-top:6px;font-weight:800;color:#111">Total: ₹${Number(b.totalPrice ?? (Number(b.pricePerNight ?? 0) * Number(b.nights ?? 1)))}</div>
        </div>`;
    })();

    const subject = `GPtrix — Booking Confirmed: ${inputJson?.departure ?? 'trip'} → ${inputJson?.destination ?? ''}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f7fb;padding:24px;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06)">
          <div style="background:linear-gradient(120deg,#2b8a3e, #1f6fbf);padding:26px 24px;color:#fff;">
            <div style="font-size:22px;font-weight:900;letter-spacing:0.3px;">GPtrix — Booking Confirmed</div>
            <div style="opacity:0.9;margin-top:4px;">Your trip is set. Here are your details.</div>
          </div>
          <div style="padding:20px 24px;">
            <div style="font-size:16px;color:#1a1a1a;margin-bottom:8px;">
              <strong>${inputJson?.departure ?? '—'} → ${inputJson?.destination ?? '—'}</strong>
            </div>
            <div style="font-size:13px;color:#555;margin-bottom:18px;">
              <strong>Dates:</strong> ${inputJson?.startDate ?? '—'} — ${inputJson?.endDate ?? '—'}
            </div>

            <h4 style="margin:0 0 8px;">Travel Details</h4>
            <div style="padding:12px 16px;border:1px solid #eee;border-radius:10px;background:#fafafa;margin-bottom:6px;">
              <div><strong>Outbound:</strong> ${travelOutbound}</div>
              <div><strong>Return:</strong> ${travelReturn}</div>
            </div>

            ${singleHotelHtml}
            ${perDayHtml}

            <div style="margin-top:24px;color:#333">
              We wish you a wonderful journey!
            </div>
            <div style="font-size:12px;color:#999;margin-top:10px;">This is an automated email from GPtrix (test environment).</div>
          </div>
        </div>
      </div>
    `;
    return { subject, html };
  }

  async function handleSend() {
    setSendResult(null);
    try {
      setSending(true);
      const recipients: string[] = [];
      if (emailTo && /.+@.+\..+/.test(emailTo)) recipients.push(emailTo);

      const { subject, html } = buildEmail();
      const body: any = { subject, html };
      if (recipients.length > 0) body.to = recipients;

      const res = await fetch('/api/mcp/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(async () => {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: txt || `Non-JSON response (status ${res.status})` };
      });

      if (res.ok && j?.ok) {
        setSendResult({ ok: true, message: 'Confirmation email sent.' });
      } else {
        const errMsg = j?.error ?? j?.message ?? `Status ${res.status}`;
        setSendResult({ ok: false, message: `Failed to send confirmation: ${errMsg}` });
      }
    } catch (err: any) {
      console.error('send-confirmation failed', err);
      setSendResult({ ok: false, message: String(err?.message ?? err) });
    } finally {
      setSending(false);
    }
  }

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
          Your travel and accommodation are confirmed. You can email yourself a copy of the booking confirmation below.
        </Typography>

        <Stack direction="column" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', maxWidth: 420, mx: 'auto' }}>
            <TextField fullWidth size="small" type="email" label="Send to" placeholder="you@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            <Button variant="contained" onClick={handleSend} disabled={sending}>
              {sending ? <><CircularProgress size={16} sx={{ mr: 1 }} /> Sending…</> : 'Send Confirmation Email'}
            </Button>
          </Stack>
          <Button variant="outlined" startIcon={<Home />} onClick={() => router.push('/')}>Return Home</Button>
        </Stack>

        <Typography variant="caption" sx={{ display: 'block', color: sendResult?.ok ? 'success.main' : 'error.main' }}>
          {sendResult?.message ?? ''}
        </Typography>
      </Paper>
    </Box>
  );
}
