import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { downloadFile, uploadFile } from '@/lib/storage';
import { generateThumbnailSvgBuffer } from '@/lib/thumbnail';

const thumbnailKeyFor = (projectId: string) => `thumbnails/${projectId}.svg`;

/**
 * POST /api/projects/:id/thumbnail
 * Auto-generate the episode thumbnail (1200x630 Khmer-safe SVG poster) and
 * persist it on the project. Frontend calls this after podcast completion so
 * the episode cover is available immediately. Returns the thumbnail URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: { speakers: { include: { speaker: true } } },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const rate = checkRateLimit('thumbnail', userId);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      );
    }

    const thumbnailKey = thumbnailKeyFor(id);
    const svgBuffer = generateThumbnailSvgBuffer({
      title: project.title,
      topic: project.topic,
      language: project.language,
      speakerNames: project.speakers.map((ps) => ps.speaker.name),
      status: project.status,
    });

    await uploadFile(thumbnailKey, svgBuffer, 'image/svg+xml');

    const updated = await prisma.project.update({
      where: { id },
      data: {
        thumbnailKey,
        thumbnailUrl: `/api/projects/${id}/thumbnail`,
      },
    });

    return NextResponse.json({
      success: true,
      thumbnailUrl: updated.thumbnailUrl,
      thumbnailKey: updated.thumbnailKey,
    });
  } catch (error) {
    console.error('POST /api/projects/:id/thumbnail error:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnail', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/thumbnail
 * Serve the episode thumbnail (SVG poster).
 * - If a thumbnail was already generated and persisted, serve it.
 * - Otherwise, lazily generate one from the project and persist it.
 * Always returns image/svg+xml so <img> tags and og:image can use it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Serve persisted thumbnail if present
    if (project.thumbnailKey) {
      const stored = await downloadFile(project.thumbnailKey);
      if (stored && stored.length > 0) {
        return new NextResponse(new Uint8Array(stored), {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml',
            'Content-Length': String(stored.length),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // Lazy-generate and persist
    const thumbnailKey = thumbnailKeyFor(id);
    const svgBuffer = generateThumbnailSvgBuffer({
      title: project.title,
      topic: project.topic,
      language: project.language,
      speakerNames: project.speakers.map((ps) => ps.speaker.name),
      status: project.status,
    });

    await uploadFile(thumbnailKey, svgBuffer, 'image/svg+xml');

    await prisma.project.update({
      where: { id },
      data: { thumbnailKey, thumbnailUrl: `/api/projects/${id}/thumbnail` },
    });

    return new NextResponse(new Uint8Array(svgBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Length': String(svgBuffer.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('GET /api/projects/:id/thumbnail error:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnail', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
