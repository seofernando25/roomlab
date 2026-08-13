import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_VISION_MODEL ?? 'google/gemini-3.6-flash';
const IMAGES = [
  'artifacts/floor-editor.png',
  'artifacts/stair-editor.png',
  'artifacts/wall-editor.png',
  'artifacts/teleport-editor.png',
  'artifacts/teleport-arrival.png',
] as const;

interface Review {
  readonly overallScore: number;
  readonly floorExtensionScore: number;
  readonly elevationAndStairsScore: number;
  readonly wallEditingScore: number;
  readonly teleporterWiringScore: number;
  readonly visualHierarchyScore: number;
  readonly safetyAndFeedbackScore: number;
  readonly blockers: readonly string[];
  readonly confusingAffordances: readonly string[];
  readonly strengths: readonly string[];
  readonly highestImpactChanges: readonly string[];
  readonly verdict: string;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt() }];
  for (const path of IMAGES) {
    content.push({ type: 'text', text: `SCREENSHOT: ${path}` });
    content.push({ type: 'image_url', image_url: { url: await imageDataUrl(path) } });
  }
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost/habbo-clone',
      'X-Title': 'Habbo Clone Builder UX Review',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${raw.slice(0, 1200)}`);
  const envelope = JSON.parse(raw) as { choices?: readonly { message?: { content?: string } }[]; error?: { message?: string } };
  if (envelope.error?.message) throw new Error(envelope.error.message);
  const text = envelope.choices?.[0]?.message?.content;
  if (!text) throw new Error('No review returned.');
  const review = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Review;
  await writeFile('artifacts/builder-ux-review.json', `${JSON.stringify({ model: MODEL, review }, null, 2)}\n`);
  await writeFile('artifacts/builder-ux-review.md', renderMarkdown(review));
  console.log(renderConsole(review));
}

function prompt(): string {
  return `You are an adversarial senior game UX designer and systems designer reviewing a Habbo-like browser room builder. The screenshots are sequential states of the actual product. Judge what a normal player can infer from the UI without documentation.

Implementation facts you may use only to understand intended behavior:
- Edit mode has Furni and Build as sibling modes.
- Floor tools: Paint, Restore, Extend, Erase, Raise, Lower. Extend is intended to work by hovering one ghost tile just OUTSIDE a room edge and clicking it. The room may become irregular; west/north growth deterministically rebases coordinates behind the scenes.
- A one-level ledge is auto-walkable. Taller 2-level rises need a physical traversal piece.
- The old abstract 'Connect stairs' tool is intentionally gone. Stairs are placeable entity pieces: Block Steps, Glass Stairs, Metal Catwalk Stairs, Industrial Ramp. They require a clear lower tile adjacent to a tile exactly two elevation levels higher. The placement arrow points uphill; R rotates; if only one orientation works, placement auto-orients. Flat landings plus rotated pieces can create turns.
- Invalid floor/wall/stair/teleporter targets show a red preflight highlight; valid targets use the normal build highlight.
- Teleporters use a two-click A then B flow, create a bidirectional pair atomically, list pairs without UUIDs, and show an in-room dashed link while Travel is active. In Play, clicking an endpoint makes the avatar walk to it before teleporting.
- Walls snap to cell edges and are separate from floor architecture.

Be harsh. Look for: hidden affordances, unclear labels, weak hierarchy, mode confusion, destructive operations that need confirmation/preview, builder panels covering the room, insufficient orientation feedback, whether 'Extend' visually explains where to click, whether stairs feel like objects rather than graph wiring, whether turn-building is discoverable, whether teleport pairing is understandable, and whether this feels like a modern game build mode while retaining compact Habbo-like charm.

Do not praise implementation details that are not visibly communicated. Penalize any behavior that requires reading the implementation facts above to understand.

Return ONLY valid JSON with this exact shape:
{
  "overallScore": number,
  "floorExtensionScore": number,
  "elevationAndStairsScore": number,
  "wallEditingScore": number,
  "teleporterWiringScore": number,
  "visualHierarchyScore": number,
  "safetyAndFeedbackScore": number,
  "blockers": ["..."],
  "confusingAffordances": ["..."],
  "strengths": ["..."],
  "highestImpactChanges": ["..."],
  "verdict": "3-6 concise sentences"
}`;
}

async function imageDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  const ext = extname(path).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function renderConsole(review: Review): string {
  return [
    `Builder UX adversarial review via ${MODEL}`,
    `Overall ${review.overallScore}/10 | extend ${review.floorExtensionScore} | stairs ${review.elevationAndStairsScore} | walls ${review.wallEditingScore} | teleport ${review.teleporterWiringScore}`,
    review.verdict,
    '',
    'Highest-impact changes:',
    ...review.highestImpactChanges.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}

function renderMarkdown(review: Review): string {
  return `# Builder UX Adversarial Review\n\n- Overall: **${review.overallScore}/10**\n- Floor extension: **${review.floorExtensionScore}/10**\n- Elevation & stairs: **${review.elevationAndStairsScore}/10**\n- Walls: **${review.wallEditingScore}/10**\n- Teleporter wiring: **${review.teleporterWiringScore}/10**\n- Visual hierarchy: **${review.visualHierarchyScore}/10**\n- Safety & feedback: **${review.safetyAndFeedbackScore}/10**\n\n## Verdict\n\n${review.verdict}\n\n## Blockers\n${review.blockers.map((item) => `- ${item}`).join('\n')}\n\n## Confusing affordances\n${review.confusingAffordances.map((item) => `- ${item}`).join('\n')}\n\n## Strengths\n${review.strengths.map((item) => `- ${item}`).join('\n')}\n\n## Highest-impact changes\n${review.highestImpactChanges.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n`;
}

await main();
