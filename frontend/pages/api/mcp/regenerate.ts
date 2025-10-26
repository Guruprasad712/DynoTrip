// frontend/pages/api/mcp/regenerate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { seedGeneratedPlan } from '../../../lib/seedData';

function delay(ms:number){ return new Promise(res=>setTimeout(res,ms)); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Only POST allowed');
  const { generatedPlan, specialInstructions } = req.body ?? {};
  await delay(700);
  // Mock: copy provided generatedPlan or seed, update specialInstructions
  const gp = generatedPlan ? { ...generatedPlan } : { ...seedGeneratedPlan };
  gp.specialInstructions = specialInstructions ?? gp.specialInstructions ?? '';
  // quick modification to show "regeneration" — append a hidden gem if not present
  if (!gp.hiddenGems || gp.hiddenGems.length < 1) {
    gp.hiddenGems = gp.hiddenGems ?? [];
    gp.hiddenGems.push({ id: `hg-auto-${Date.now()}`, title: 'Auto-added lookout', description: 'A scenic lookout added by AI.', photos: [], rating: 4.5 });
  }
  // Ensure each place item has a weather object (mocked) to align with backend shape
  try {
    const days = gp.storyItinerary || [];
    for (const d of days) {
      const date = d?.date ?? new Date().toISOString().slice(0,10);
      if (!Array.isArray(d.items)) continue;
      for (const it of d.items) {
        if (it && !it.__isMeal) {
          // If weather already present, keep; otherwise mock a realistic value or 'not available'
          if (!it.weather) {
            // Simple deterministic mock: alternate Sunny/Rainy by hash of title
            const h = (it.title || '').length;
            const cond = (h % 2) === 0 ? 'Sunny' : 'Rainy';
            it.weather = { temperature: cond === 'Sunny' ? 30 : 24, condition: cond };
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return res.status(200).json({ generatedPlan: gp });
}
