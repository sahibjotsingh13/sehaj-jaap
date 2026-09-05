const ACCOUNT_UPSTREAM =
  'https://vzkmcodmfxegxzsackfv.supabase.co/functions/v1/sehaj-account';

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function sameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return json({ error: 'This request could not be verified.' }, 403);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ error: 'Please send a valid request.' }, 415);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json({ error: 'Please send a valid request.' }, 400);
  }

  if (!body || body.length > 1_000_000) {
    return json({ error: 'Please send a valid request.' }, 400);
  }

  try {
    const response = await fetch(ACCOUNT_UPSTREAM, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      return json({ error: 'Account service returned an unexpected redirect.' }, 502);
    }

    const responseType = response.headers.get('content-type') || '';
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': responseType.includes('application/json')
          ? responseType
          : 'application/json',
      },
    });
  } catch {
    return json({ error: 'Account service is temporarily unavailable.' }, 503);
  }
}
