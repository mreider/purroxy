import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb, generateId } from '@/lib/db';
import { getUserByLicenseKey } from '@/lib/auth';

initSchema();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!licenseKey) {
    return NextResponse.json({ error: 'License key required.' }, { status: 401 });
  }

  const user = getUserByLicenseKey(licenseKey);
  if (!user) {
    return NextResponse.json({ error: 'Invalid license key.' }, { status: 401 });
  }

  if (!body?.profileId || !body?.rating) {
    return NextResponse.json({ error: 'profileId and rating are required.' }, { status: 400 });
  }

  const rating = parseInt(body.rating);
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5.' }, { status: 400 });
  }

  const db = getDb();
  const id = generateId();

  // Upsert: one review per user per profile
  const existing = db.prepare('SELECT id FROM reviews WHERE profile_id = ? AND user_id = ?').get(body.profileId, user.id) as any;

  if (existing) {
    db.prepare('UPDATE reviews SET rating = ?, review_text = ?, created_at = datetime(\'now\') WHERE id = ?').run(
      rating, body.reviewText || null, existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO reviews (id, profile_id, user_id, rating, review_text)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, body.profileId, user.id, rating, body.reviewText || null);
  }

  // Update average rating on the profile
  const avg = db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE profile_id = ?').get(body.profileId) as any;
  if (avg?.avg) {
    db.prepare('UPDATE profiles SET average_rating = ? WHERE id = ?').run(Math.round(avg.avg * 10) / 10, body.profileId);
  }

  return NextResponse.json({ success: true }, { status: existing ? 200 : 201 });
}

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profileId');
  if (!profileId) {
    return NextResponse.json({ error: 'profileId query param required.' }, { status: 400 });
  }

  const db = getDb();
  const reviews = db.prepare(`
    SELECT r.rating, r.review_text, r.created_at, u.display_name, u.email
    FROM reviews r LEFT JOIN users u ON r.user_id = u.id
    WHERE r.profile_id = ?
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(profileId);

  return NextResponse.json({ reviews });
}
