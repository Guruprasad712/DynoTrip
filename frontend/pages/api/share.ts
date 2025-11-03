import { NextApiRequest, NextApiResponse } from 'next';

type SharedPlan = {
  plan: any;
  createdAt: number;
  expiresAt: number;
};

// In-memory store with type safety
const g: any = (typeof globalThis !== 'undefined' ? (globalThis as any) : {}) as any;
const STORE: Map<string, SharedPlan> = g.__DYNO_SHARE_STORE__ || new Map<string, SharedPlan>();
g.__DYNO_SHARE_STORE__ = STORE;

// Generate a secure random token
function generateToken(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(length);
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(values);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      values[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(values)
    .map(x => chars[x % chars.length])
    .join('');
}

// Clean up expired entries
function cleanupExpiredEntries() {
  try {
    const now = Date.now();
    for (const [key, entry] of STORE.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        STORE.delete(key);
      }
    }
  } catch (e) {
    console.error('Error cleaning up expired entries:', e);
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
  // Initial cleanup
  cleanupExpiredEntries();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const plan = body?.generatedPlan;
      
      if (!plan || typeof plan !== 'object') {
        return res.status(400).json({ 
          error: 'Invalid request: generatedPlan is required' 
        });
      }

      const token = generateToken();
      const data: SharedPlan = { 
        plan, 
        createdAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days from now
      };

      STORE.set(token, data);

      return res.status(200).json({ 
        token,
        expiresAt: data.expiresAt
      });
      
    } catch (e: any) {
      console.error('Error creating share token:', e);
      return res.status(500).json({ 
        error: 'Failed to create share token',
        details: process.env.NODE_ENV === 'development' ? e.message : undefined
      });
    }
  }

  if (req.method === 'GET') {
    try {
      const token = String(req.query.token || '');
      if (!token) {
        return res.status(400).json({ 
          error: 'Token is required' 
        });
      }

      const entry = STORE.get(token);

      if (!entry) {
        return res.status(404).json({ 
          error: 'Shared plan not found or has expired' 
        });
      }

      // Check if entry is expired
      if (entry.expiresAt < Date.now()) {
        STORE.delete(token);
        return res.status(410).json({ 
          error: 'This share link has expired' 
        });
      }

      return res.status(200).json({ 
        generatedPlan: entry.plan,
        expiresAt: entry.expiresAt
      });
      
    } catch (e: any) {
      console.error('Error fetching shared plan:', e);
      return res.status(500).json({ 
        error: 'Failed to fetch shared plan',
        details: process.env.NODE_ENV === 'development' ? e.message : undefined
      });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).json({ 
    error: `Method ${req.method} Not Allowed` 
  });
}
