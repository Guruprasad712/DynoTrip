import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory store for shared plans. For production, replace with DB/Redis.
const g: any = (typeof globalThis !== 'undefined' ? (globalThis as any) : {}) as any;
const STORE: Map<string, any> = g.__DYNO_SHARE_STORE__ || new Map<string, any>();
g.__DYNO_SHARE_STORE__ = STORE;

function makeToken(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let t = '';
  for (let i = 0; i < len; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const plan = body?.generatedPlan;
      if (!plan || typeof plan !== 'object') {
        return res.status(400).json({ error: 'generatedPlan is required' });
      }
      const token = makeToken();
      STORE.set(token, { plan, createdAt: Date.now() });
      return res.status(200).json({ token });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create share token' });
    }
  }
  if (req.method === 'GET') {
    try {
      const token = String(req.query.token || '');
      if (!token || !STORE.has(token)) {
        return res.status(404).json({ error: 'Not found' });
      }
      const entry = STORE.get(token);
      return res.status(200).json({ generatedPlan: entry?.plan ?? null });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to fetch shared plan' });
    }
  }
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end('Method Not Allowed');
}
