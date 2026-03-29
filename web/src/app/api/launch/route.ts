import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const launchCode = process.env.LAUNCH_CODE;
  if (!launchCode) {
    return NextResponse.json({ error: 'No launch code configured.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.code) {
    return NextResponse.json({ error: 'Code required.' }, { status: 400 });
  }

  if (body.code !== launchCode) {
    // Brief server-side delay for flood control
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: 'Wrong code.' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('purroxy-launch', launchCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: '/',
  });

  return response;
}
