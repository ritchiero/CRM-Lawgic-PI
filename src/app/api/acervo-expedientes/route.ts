import { NextRequest, NextResponse } from 'next/server';

const PROXY_URL = 'http://3.15.181.124:8081';
const PROXY_API_KEY = 'acervo-proxy-secret-key-2026';

export const maxDuration = 300;

// GET /api/acervo-expedientes - Health check
export async function GET() {
  try {
    const response = await fetch(`${PROXY_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', message: `Proxy unreachable: ${message}` },
      { status: 503 }
    );
  }
}

// POST /api/acervo-expedientes - Query expediente(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expediente, expedientes, action } = body;

    // Initialize browser session
    if (action === 'initialize') {
      const response = await fetch(`${PROXY_URL}/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': PROXY_API_KEY,
        },
      });
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Query single expediente
    if (expediente) {
      const response = await fetch(`${PROXY_URL}/query-expediente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': PROXY_API_KEY,
        },
        body: JSON.stringify({ expediente: String(expediente) }),
      });
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Query batch of expedientes
    if (expedientes && Array.isArray(expedientes)) {
      const response = await fetch(`${PROXY_URL}/query-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': PROXY_API_KEY,
        },
        body: JSON.stringify({ expedientes: expedientes.map(String) }),
      });
      const data = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { status: 'error', message: 'Must provide expediente, expedientes array, or action' },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', message },
      { status: 500 }
    );
  }
}