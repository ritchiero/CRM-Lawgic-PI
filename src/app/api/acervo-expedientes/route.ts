import { NextRequest, NextResponse } from 'next/server';

const SEARCH_URL = 'https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi';

export const maxDuration = 300;

interface Session {
  viewState: string;
  cookies: string;
}

let cachedSession: Session | null = null;
let sessionTimestamp = 0;
const SESSION_TTL = 60000; // 1 minute - shorter TTL to keep cookies fresh

async function getSession(): Promise<Session | null> {
  const now = Date.now();
  if (cachedSession && (now - sessionTimestamp) < SESSION_TTL) {
    return cachedSession;
  }
  try {
    const res = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
    });
    const html = await res.text();
    const match = html.match(/javax\.faces\.ViewState.*?value="([^"]+)"/);
    if (!match) return null;
    
    // Extract cookies from response
    const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const cookies = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    
    cachedSession = { viewState: match[1], cookies };
    sessionTimestamp = now;
    return cachedSession;
  } catch {
    return null;
  }
}

function parseExpedienteHtml(html: string): Record<string, string> | null {
  // Check if we got results
  if (html.includes('No se encontraron registros') || html.includes('sin resultados')) {
    return null;
  }
  
  const fields: Record<string, string> = {};
  
  // Parse table rows with label-value pairs
  const rowRegex = /<td[^>]*class="[^"]*(?:label|etiqueta)[^"]*"[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const key = m[1].trim().replace(/:$/, '');
    const value = m[2].trim();
    if (key && value) fields[key] = value;
  }
  
  // Also try output/span elements with IDs
  const outputRegex = /<(?:span|output)[^>]*id="[^"]*(?:expediente|marca|titular|clase|fecha|tipo|situacion|vigencia)[^"]*"[^>]*>([^<]+)<\/(?:span|output)>/gi;
  while ((m = outputRegex.exec(html)) !== null) {
    const id = m[0].match(/id="([^"]*)"/)?.[1] || '';
    const value = m[1].trim();
    if (value) fields[id] = value;
  }
  
  // Try generic table parsing - look for data table rows
  const trRegex = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  while ((m = trRegex.exec(html)) !== null) {
    const key = m[1].trim();
    const value = m[2].trim();
    if (key && value && key.length < 50) fields[key] = value;
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

async function queryExpediente(expediente: string, session: Session): Promise<Record<string, string> | null> {
  try {
    const formData = new URLSearchParams();
    formData.append('javax.faces.partial.ajax', 'true');
    formData.append('javax.faces.source', 'busquedaForm:btnBuscar');
    formData.append('javax.faces.partial.execute', '@all');
    formData.append('javax.faces.partial.render', 'busquedaForm:pnlResultados');
    formData.append('busquedaForm:btnBuscar', 'busquedaForm:btnBuscar');
    formData.append('busquedaForm', 'busquedaForm');
    formData.append('busquedaForm:expediente', expediente);
    formData.append('javax.faces.ViewState', session.viewState);

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/xml, text/xml, */*; q=0.01',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi',
      'Origin': 'https://acervomarcas.impi.gob.mx:8181',
    };
    
    // Add session cookies if available
    if (session.cookies) {
      headers['Cookie'] = session.cookies;
    }

    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });
    
    const text = await res.text();
    
    // Check for ViewState error (session expired)
    if (text.includes('ViewExpiredException') || text.includes('view could not be restored')) {
      cachedSession = null;
      return null;
    }
    
    return parseExpedienteHtml(text);
  } catch {
    return null;
  }
}

// GET - Health check
export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json({
      status: session ? 'ok' : 'error',
      service: 'direct-http',
      mode: 'direct-impi',
      viewStateAvailable: !!session,
      hasCookies: !!(session && session.cookies),
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', message: 'IMPI unreachable: ' + message },
      { status: 503 }
    );
  }
}

// POST - Query expediente(s) directly from IMPI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expediente, expedientes } = body;
    // Get fresh session for each POST to ensure cookies work
    cachedSession = null;
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { status: 'error', message: 'Could not obtain session from IMPI' },
        { status: 503 }
      );
    }
    if (expediente) {
      const result = await queryExpediente(String(expediente), session);
      if (result) return NextResponse.json({ results: [result] });
      return NextResponse.json({ results: [] });
    }
    if (expedientes && Array.isArray(expedientes)) {
      const results = [];
      for (const exp of expedientes) {
        const result = await queryExpediente(String(exp), session);
        if (result) results.push(result);
        if (expedientes.length > 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      return NextResponse.json({ results });
    }
    return NextResponse.json(
      { status: 'error', message: 'Must provide expediente or expedientes array' },
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
