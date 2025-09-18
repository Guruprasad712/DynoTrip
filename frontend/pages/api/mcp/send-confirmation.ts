// pages/api/mcp/send-confirmation.ts
import type { NextApiRequest, NextApiResponse } from 'next';

type ResponseBody = { ok: boolean; error?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body ?? {};
    const { subject, html } = body;

    if (!subject || !html) {
      return res.status(400).json({ ok: false, error: 'Missing subject or html in request body' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'RESEND_API_KEY not configured on server' });
    }

    // Determine recipients:
    // - prefer body.to if provided (string or array)
    // - otherwise fallback to EMAIL_TO env var (comma-separated or single)
    let to: string | string[] | undefined = body.to;
    if (!to) {
      const envTo = process.env.EMAIL_TO ?? '';
      if (!envTo) {
        return res.status(400).json({ ok: false, error: 'No recipient provided and EMAIL_TO is not set' });
      }
      // split comma-separated env var into array, and trim spaces
      const parts = envTo.split(',').map((s) => s.trim()).filter(Boolean);
      to = parts.length === 1 ? parts[0] : parts;
    }

    // Normalize `to` for provider: keep string or string[]
    // Build payload for Resend
    const payload: any = {
      from: process.env.EMAIL_FROM ?? `noreply@${process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'example.com'}`,
      to,
      subject,
      html,
    };

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!r.ok) {
      console.error('Resend error:', r.status, json);
      const errMsg = json?.error ?? json?.message ?? text ?? `status ${r.status}`;
      return res.status(502).json({ ok: false, error: `Email provider error: ${String(errMsg)}` });
    }

    // success
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('send-confirmation handler error:', err);
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
}
