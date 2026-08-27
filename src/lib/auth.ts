/**
 * Lightweight request auth/ownership helpers.
 *
 * The app currently runs a single-user demo model. The "authenticated" user is
 * resolved from the `x-user-id` header (set by the frontend or a gateway) and
 * falls back to the seeded demo user. Every API route must scope its queries by
 * this userId — that is what fixes the IDOR-class bugs found in review.
 */

import type { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';

export const DEFAULT_USER_ID = 'default-user';

export function getRequestUserId(request: NextRequest): string {
  const header = request.headers.get('x-user-id');
  if (header && header.trim()) {
    return header.trim().slice(0, 128);
  }
  return DEFAULT_USER_ID;
}

export class OwnershipError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'OwnershipError';
  }
}

/**
 * Assert that a project belongs to the given user. Returns the project row so
 * callers can reuse it; throws OwnershipError (map to 403/404 in the route)
 * when the project does not exist for this user.
 */
export async function assertProjectOwnership(
  prisma: PrismaClient,
  projectId: string,
  userId: string
) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!existing) {
    throw new OwnershipError('Project not found');
  }
  return existing;
}
