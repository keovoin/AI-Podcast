import { getServerSession } from 'next-auth';

/**
 * Get the current user ID from the session.
 * Falls back to 'default-user' for backward compatibility.
 */
export async function getCurrentUserId(): Promise<string> {
  try {
    const session = await getServerSession();
    return (session?.user as any)?.id || 'default-user';
  } catch {
    return 'default-user';
  }
}
