import { NextRequest, NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { listProfiles } from '@/lib/profiles';

initSchema();

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const { profiles, total } = listProfiles({
    search: params.get('search') || undefined,
    category: params.get('category') || undefined,
    status: params.get('status') || undefined,
    limit: params.has('limit') ? parseInt(params.get('limit')!) : undefined,
    offset: params.has('offset') ? parseInt(params.get('offset')!) : undefined,
  });

  return NextResponse.json({ profiles, total });
}
