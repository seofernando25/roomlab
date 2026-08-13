import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3.6-flash';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

interface ScoreSet {
  readonly isometricReadability: number;
  readonly tileGridScale: number;
  readonly furnitureProportions: number;
  readonly materialRichness: number;
  readonly textureIntricacy: number;
  readonly microDetailDensity: number;
  readonly shadowAuthenticity: number;
  readonly visualCohesion: number;
  readonly roomComposition: number;
  readonly habboDesignLanguage: number;
  readonly overallAppeal: number;
}

interface JudgeResult {
  readonly winner: 'ours' | 'references' | 'tie';
  readonly oursScore: number;
  readonly referenceScore: number;
  readonly scores: ScoreSet;
  readonly verdict: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly highestImpactImprovements: readonly string[];
  readonly acceptance: {
    readonly competitiveWithReferences: boolean;
    readonly rationale: string;
  };
}

interface OpenRouterResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
  readonly error?: { readonly message?: string };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing. Put it in the project .env file.');

  const model = process.env.OPENROUTER_VISION_MODEL ?? DEFAULT_MODEL;
  const references = await findReferenceImages();
  if (references.length === 0) throw new Error('No reference images found in references/ or ref/.');

  const candidatePath = process.env.VISUAL_CANDIDATE ?? 'artifacts/room.png';
  await readFile(candidatePath);
  await mkdir('artifacts', { recursive: true });

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: buildPrompt(references.length) },
    { type: 'text', text: `CANDIDATE — our current Three.js room: ${candidatePath}` },
    { type: 'image_url', image_url: { url: await imageDataUrl(candidatePath) } },
  ];

  for (const [index, path] of references.entries()) {
    content.push({ type: 'text', text: `REFERENCE ${index + 1} — classic Habbo visual target: ${path}` });
    content.push({ type: 'image_url', image_url: { url: await imageDataUrl(path) } });
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost/habbo-clone',
      'X-Title': 'Habbo Clone Visual QA',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${raw.slice(0, 1000)}`);
  const envelope = JSON.parse(raw) as OpenRouterResponse;
  if (envelope.error?.message) throw new Error(`OpenRouter: ${envelope.error.message}`);

  const modelText = envelope.choices?.[0]?.message?.content;
  if (!modelText) throw new Error('OpenRouter returned no model response.');
  const result = parseJudgeResult(modelText);

  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    model,
    candidate: candidatePath,
    references,
    result,
    rawModelText: modelText,
  };

  await writeFile('artifacts/visual-qa.json', `${JSON.stringify(report, null, 2)}\n`);
  await writeFile('artifacts/visual-qa.md', renderMarkdown(report));

  console.log(renderConsoleSummary(model, result));
  console.log('\nSaved artifacts/visual-qa.json and artifacts/visual-qa.md');
  const strictPass = result.acceptance.competitiveWithReferences
    && result.oursScore >= 8
    && result.scores.materialRichness >= 8
    && result.scores.textureIntricacy >= 8
    && result.scores.microDetailDensity >= 7;
  if (process.env.VISUAL_QA_GATE === '1' && !strictPass) process.exitCode = 2;
}

async function findReferenceImages(): Promise<string[]> {
  for (const directory of ['references', 'ref']) {
    try {
      const files = await readdir(directory);
      const images = files
        .filter((file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()))
        .sort()
        .map((file) => join(directory, file));
      if (images.length > 0) return images;
    } catch {
      // Try the alternate conventional folder name.
    }
  }
  return [];
}

async function imageDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  const extension = extname(path).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
    : extension === '.webp' ? 'image/webp'
      : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function buildPrompt(referenceCount: number): string {
  return `You are the demanding visual art director for a Habbo-like online room game.

The first image is OUR CURRENT CANDIDATE. The following ${referenceCount} images are CLASSIC HABBO REFERENCES. Compare the candidate against the references as a group, not against one cherry-picked reference.

Treat the supplied Habbo references as the 10/10 benchmark. We intentionally use original procedural 3D rather than copied assets, but that is NOT an excuse for lower detail. The candidate must achieve comparable visual richness through procedural geometry and procedural textures.

Be especially harsh about MATERIALS AND INTRICATE DETAIL. Classic Habbo does not look like flat-color primitives with a pixelation filter. Its appeal comes from crisp unfiltered-looking edges, richly patterned surfaces, tiny props, material-specific shading, brick/wood/tile/wallpaper patterns, handles, trims, seams, books, appliances, plants and other readable micro-detail. Penalize large flat surfaces aggressively. Material richness, texture intricacy, and micro-detail density are the most important categories in this review.

Penalize obvious post-process pixelation/downsampling, blurry filtering, noisy dithering, generic flat toon colors, unrealistic hard real-time shadows, empty surfaces, repeated placeholder patterns, weak material identity, and any scene that reads as a generic low-poly/voxel room. Reward actual procedural surface construction: convincing brick courses, wooden planks/grain, tiled floors with grout, patterned wallpaper, fabric/wood furniture texture, crisp object separation, soft/contact-only grounding shadows, and dense but readable decorative detail.

Implementation fact for attribution only: the candidate is rendered directly at full canvas resolution; it does NOT use a full-screen pixelation/downsampling pass. Its procedural textures intentionally use nearest-neighbor sampling. Do not call nearest-sampled surface texture pixels a post-process filter. You may still penalize any visible aliasing, blur, coarse texel density, or poor texture design that you actually see.

The candidate is allowed to be crisp high-resolution isometric 3D rather than literal sprite pixel art. Do NOT require 1px black sprite outlines, hand-dithered pixels, or copied Habbo rendering techniques as acceptance criteria. Instead judge whether geometry edges, bevels, material contrast, procedural textures, and prop detail achieve comparable readability and richness. A lack of literal pixel-art outlines is not itself a defect if objects remain crisply separated.

Judge whether it preserves the important Habbo design language: readable orthographic/dimetric space, strong tile-cell logic, compact/chunky furni proportions, pleasing room framing, cozy material/color relationships, crisp silhouettes, and instant readability at a glance.

Be critical and useful. Do not flatter the candidate. References should normally score 10/10. A candidate score of 7 means attractive but clearly behind the references; 8 means genuinely competitive; 9 means exceptionally close; 10 means reference-level craftsmanship. "competitiveWithReferences" MUST be false unless oursScore >= 8, materialRichness >= 8, textureIntricacy >= 8, and microDetailDensity >= 7. Decide who looks better and why.

Return ONLY a valid JSON object, without markdown fences, matching this exact shape:
{
  "winner": "ours" | "references" | "tie",
  "oursScore": number 1-10,
  "referenceScore": number 1-10,
  "scores": {
    "isometricReadability": number 1-10,
    "tileGridScale": number 1-10,
    "furnitureProportions": number 1-10,
    "materialRichness": number 1-10,
    "textureIntricacy": number 1-10,
    "microDetailDensity": number 1-10,
    "shadowAuthenticity": number 1-10,
    "visualCohesion": number 1-10,
    "roomComposition": number 1-10,
    "habboDesignLanguage": number 1-10,
    "overallAppeal": number 1-10
  },
  "verdict": "2-5 concise sentences",
  "strengths": ["specific strength", "specific strength"],
  "weaknesses": ["specific weakness", "specific weakness"],
  "highestImpactImprovements": ["improvement 1", "improvement 2", "improvement 3", "improvement 4", "improvement 5"],
  "acceptance": {
    "competitiveWithReferences": boolean,
    "rationale": "Explain whether the candidate is visually competitive as an original Habbo-like game, even if its style differs."
  }
}`;
}

function parseJudgeResult(text: string): JudgeResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as JudgeResult;
  if (!['ours', 'references', 'tie'].includes(parsed.winner)) throw new Error('Judge returned an invalid winner.');
  if (!parsed.scores || !parsed.acceptance || !Array.isArray(parsed.highestImpactImprovements)) {
    throw new Error('Judge response is missing required fields.');
  }
  return parsed;
}

function renderConsoleSummary(model: string, result: JudgeResult): string {
  return [
    `Visual QA via ${model}`,
    `Winner: ${result.winner.toUpperCase()} | ours ${result.oursScore}/10 vs refs ${result.referenceScore}/10`,
    `Competitive: ${result.acceptance.competitiveWithReferences ? 'YES' : 'NO'}`,
    result.verdict,
    '',
    'Highest-impact improvements:',
    ...result.highestImpactImprovements.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}

function renderMarkdown(report: {
  timestamp: string;
  model: string;
  candidate: string;
  references: readonly string[];
  result: JudgeResult;
}): string {
  const { result } = report;
  const scoreLines = Object.entries(result.scores).map(([name, value]) => `| ${name} | ${value}/10 |`).join('\n');
  return `# Visual QA Report

- **Date:** ${report.timestamp}
- **Model:** ${report.model}
- **Candidate:** \`${report.candidate}\`
- **References:** ${report.references.map((path) => `\`${path}\``).join(', ')}
- **Winner:** **${result.winner}**
- **Overall:** ours **${result.oursScore}/10**, references **${result.referenceScore}/10**
- **Competitive with references:** **${result.acceptance.competitiveWithReferences ? 'yes' : 'no'}**

## Verdict

${result.verdict}

${result.acceptance.rationale}

## Candidate scores

| Area | Score |
| --- | ---: |
${scoreLines}

## Strengths

${result.strengths.map((item) => `- ${item}`).join('\n')}

## Weaknesses

${result.weaknesses.map((item) => `- ${item}`).join('\n')}

## Highest-impact improvements

${result.highestImpactImprovements.map((item, index) => `${index + 1}. ${item}`).join('\n')}
`;
}

await main();
