import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  verifyPassword,
  getPasswordHash,
  setPasswordHash,
} from '@/lib/auth/password';

// Edge runtime is implicit on Cloudflare Workers via @opennextjs/cloudflare

/** GET — check if a password has been set */
export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const hash = await getPasswordHash(env.DB);
    return NextResponse.json({ isSet: !!hash && hash.length > 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT — set or change the export password */
export async function PUT(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const body = await request.json();
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword: string;
    };

    // ── Validate new password ────────────────────────────
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // ── If a password already exists, verify the current one ─
    const existingHash = await getPasswordHash(env.DB);
    if (existingHash && existingHash.length > 0) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      const valid = await verifyPassword(existingHash, currentPassword);
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
      }
    }

    // ── Hash and store the new password ───────────────────
    const newHash = await hashPassword(newPassword);
    await setPasswordHash(env.DB, newHash);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
