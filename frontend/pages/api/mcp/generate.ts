// frontend/pages/api/mcp/generate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { seedGeneratedPlan } from '../../../lib/seedData';

function delay(ms:number){ return new Promise(res=>setTimeout(res,ms)); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Only POST allowed');
  const body = req.body ?? {};
  // body contains inputJson and selections
  await delay(900);
  // Mock behaviour: return seedGeneratedPlan but update meta dates from inputJson
  const gp = { ...seedGeneratedPlan };
  if (body.inputJson) {
    gp.meta.startDate = body.inputJson.startDate ?? gp.meta.startDate;
    gp.meta.endDate = body.inputJson.endDate ?? gp.meta.endDate;
  }
  // safe assignment using any cast to avoid TS complaint
  (gp.meta as any).generatedFromSelections = !!body.selections;
  return res.status(200).json({ generatedPlan: gp });
}
