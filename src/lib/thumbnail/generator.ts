/**
 * Episode thumbnail generator.
 *
 * Produces a 1200x630 OG-style SVG poster for a podcast episode with a
 * Khmer-safe design: gradient background, waveform motif, episode title,
 * topic line and speaker names. The SVG is embedded in a self-contained
 * data-URI that any <img> / og:image consumer can render — no external
 * assets or fonts required (uses generic system sans-serif; Khmer glyphs
 * render via the viewer's Khmer font fallback).
 *
 * The generator is deterministic per project (same input -> same SVG), so it
 * can be cached by content hash.
 */

export interface ThumbnailInput {
  title: string;
  topic?: string | null;
  language?: string | null;
  speakerNames?: string[];
  status?: string | null;
}

const WIDTH = 1200;
const HEIGHT = 630;

const PALETTES: Array<{ from: string; to: string; accent: string }> = [
  { from: '#0f172a', to: '#1e3a8a', accent: '#f59e0b' }, // slate -> blue, amber accent
  { from: '#111827', to: '#5b21b6', accent: '#fbbf24' }, // gray -> violet
  { from: '#082f49', to: '#164e63', accent: '#f472b6' }, // cyan-dark -> teal
  { from: '#1c1917', to: '#7c2d12', accent: '#facc15' }, // stone -> amber-dark
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Truncate a string to a max length, breaking on word boundaries. */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

/** Wrap text into lines by character budget (no word splitting needed for Khmer). */
function wrapText(s: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of s) {
    current += char;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines
}

function buildWaveform(svg: string[], yBase: number, barCount: number, color: string, seed: number): void {
  // Deterministic pseudo-random bar heights from the seed
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state % 100) / 100;
  };
  const barWidth = 6;
  const gap = 8;
  const totalWidth = barCount * (barWidth + gap) - gap;
  const startX = (WIDTH - totalWidth) / 2;
  for (let i = 0; i < barCount; i++) {
    const h = 24 + next() * 90;
    const x = startX + i * (barWidth + gap);
    const opacity = 0.25 + next() * 0.5;
    svg.push(
      `<rect x="${x.toFixed(1)}" y="${(yBase - h).toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" rx="3" fill="${color}" fill-opacity="${opacity.toFixed(2)}"/>`
    );
  }
}

/**
 * Generate the episode thumbnail SVG string.
 */
export function generateThumbnailSvg(input: ThumbnailInput): string {
  const seed = hashString(input.title || 'episode');
  const palette = PALETTES[seed % PALETTES.length]!;

  const titleLines = wrapText(truncate(input.title || 'Podcast Episode', 54), 24);
  const topicText = input.topic ? truncate(input.topic, 90) : '';
  const speakers = (input.speakerNames || []).slice(0, 3).join(' • ');
  const languageLabel = (input.language || 'km').toUpperCase();

  const svg: string[] = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`);
  svg.push(`  <defs>`);
  svg.push(`    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`);
  svg.push(`      <stop offset="0%" stop-color="${palette.from}"/>`);
  svg.push(`      <stop offset="100%" stop-color="${palette.to}"/>`);
  svg.push(`    </linearGradient>`);
  svg.push(`  </defs>`);
  svg.push(`  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`);

  // Decorative circles
  svg.push(`  <circle cx="1050" cy="120" r="240" fill="${palette.accent}" fill-opacity="0.08"/>`);
  svg.push(`  <circle cx="120" cy="540" r="200" fill="#ffffff" fill-opacity="0.04"/>`);

  // Waveform motif
  buildWaveform(svg, 170, 40, palette.accent, seed);

  // Brand line
  svg.push(`  <text x="72" y="96" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="26" letter-spacing="6" fill="#ffffff" fill-opacity="0.85">AI PODCAST</text>`);

  // Language badge
  svg.push(`  <text x="1060" y="96" font-family="system-ui, sans-serif" font-size="22" letter-spacing="2" fill="${palette.accent}" text-anchor="end">${escapeXml(languageLabel)}</text>`);

  // Title lines
  let ty = 260;
  for (const line of titleLines) {
    svg.push(`  <text x="72" y="${ty}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="52" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`);
    ty += 66;
  }

  // Topic
  if (topicText) {
    svg.push(`  <text x="72" y="${ty + 8}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" fill="#ffffff" fill-opacity="0.7">${escapeXml(topicText)}</text>`);
    ty += 46;
  }

  // Speakers
  if (speakers) {
    svg.push(`  <text x="72" y="${ty + 26}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="24" fill="${palette.accent}">${escapeXml(speakers)}</text>`);
  }

  // Bottom accent line
  svg.push(`  <rect x="72" y="560" width="140" height="6" rx="3" fill="${palette.accent}"/>`);

  svg.push(`</svg>`);
  return svg.join('\n');
}

/**
 * Build a self-contained data-URI SVG (works in <img>, og:image, and
 * podcast RSS feeds that accept image URLs).
 */
export function generateThumbnailDataUri(input: ThumbnailInput): string {
  const svg = generateThumbnailSvg(input);
  const encoded = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Generate a PNG-compatible buffer is NOT possible without a rasterizer;
 * the SVG data-URI is the canonical thumbnail. This helper returns the raw
 * SVG bytes for storage (e.g. S3) under thumbnails/{projectId}.svg.
 */
export function generateThumbnailSvgBuffer(input: ThumbnailInput): Buffer {
  return Buffer.from(generateThumbnailSvg(input), 'utf8');
}
