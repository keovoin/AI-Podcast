import { NextRequest, NextResponse } from 'next/server';
import { MockTTSAdapter } from '@/lib/providers/adapters/mock-tts';

/**
 * POST /api/speakers/preview
 * Generate a short audio preview for a speaker voice configuration.
 * Returns WAV audio as binary download.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId, pace, language } = body;

    const previewText = text || 'Hello, this is a voice preview for your podcast speaker.';

    // Use mock TTS for preview (replace with real TTS when provider is configured)
    const adapter = new MockTTSAdapter({ latencyMs: 10 });
    const config = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };

    const result = await adapter.synthesize({
      text: previewText,
      voiceId: voiceId || 'mock-km-male-1',
      language: language || 'km',
      pace: pace || 'normal',
    }, config);

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(result.audio.length),
        'X-Duration-Ms': String(result.durationMs),
      },
    });
  } catch (error) {
    console.error('POST /api/speakers/preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
