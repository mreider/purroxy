import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';

initSchema();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const db = getDb();

  const site = db.prepare('SELECT * FROM sites WHERE id = ? OR slug = ?').get(siteId, siteId);

  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  return NextResponse.json({ site });
}
