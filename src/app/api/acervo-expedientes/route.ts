import { NextRequest, NextResponse } from 'next/server';

const SEARCH_URL = 'https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi';

export const maxDuration = 300;

interface Session {
  viewState: string;
  cookies: string;
}

let cachedSession: Session | null = null;
let sessionTimestamp = 0;
const SESSION_TTL = 60000;

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
    
    const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const cookies = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    
    cachedSession = { viewState: match[1], cookies };
    sessionTimestamp = now;
    return cachedSession;
  } catch {
    return null;
  }
}

function parseExpedienteHtml(html: string): Record<string, unknown> | null {
  const data: Record<string, unknown> = {
    datos_generales: {} as Record<string, string>,
    titular: {} as Record<string, string>,
    apoderado: {} as Record<string, string>,
    establecimiento: {} as Record<string, string>,
    productos_servicios: '',
    tramite: {} as Record<string, string>,
  };
  const dg = data.datos_generales as Record<string, string>;
  const tit = data.titular as Record<string, string>;
  const apo = data.apoderado as Record<string, string>;
  const est = data.establecimiento as Record<string, string>;
  const tra = data.tramite as Record<string, string>;

  const rowRegex = /<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const k = m[1].replace(/<[^>]*>/g, '').trim().replace(/:$/, '').trim();
    const v = m[2].replace(/<[^>]*>/g, '').trim();
    if (!k || !v) continue;
    const ku = k.toUpperCase();
    
    if (['EXPEDIENTE', 'NO. DE EXPEDIENTE', 'NUMERO DE EXPEDIENTE'].includes(ku)) {
      dg.expediente = v;
    } else if (['DENOMINACION', 'SIGNO DISTINTIVO', 'MARCA'].includes(ku)) {
      dg.denominacion = v;
    } else if (['CLASE', 'CLASE NIZA'].includes(ku)) {
      dg.clase = v;
    } else if (['TIPO DE SIGNO', 'TIPO SIGNO', 'TIPO'].includes(ku)) {
      dg.tipo_signo = v;
    } else if (['FECHA DE PRESENTACION', 'FECHA PRESENTACION'].includes(ku)) {
      dg.fecha_presentacion = v;
    } else if (['FECHA DE REGISTRO', 'FECHA REGISTRO', 'FECHA DE CONCESION'].includes(ku)) {
      dg.fecha_registro = v;
    } else if (['SITUACION', 'SITUACION DEL EXPEDIENTE', 'STATUS'].includes(ku)) {
      dg.situacion = v;
    } else if (['VIGENCIA', 'FECHA DE VIGENCIA'].includes(ku)) {
      dg.vigencia = v;
    } else if (ku.includes('TITULAR') || ku === 'NOMBRE DEL TITULAR') {
      if (!tit.nombre) tit.nombre = v;
    } else if (ku === 'NACIONALIDAD') {
      tit.nacionalidad = v;
    } else if (ku.includes('APODERADO')) {
      if (!apo.nombre) apo.nombre = v;
    } else if (ku.includes('ESTABLECIMIENTO')) {
      est.nombre = v;
    } else if (ku.includes('UBICACION')) {
      est.ubicacion = v;
    } else if (['PRODUCTOS', 'SERVICIOS', 'PRODUCTOS O SERVICIOS'].includes(ku)) {
      data.productos_servicios = v;
    } else if (['TRAMITE', 'TIPO DE TRAMITE'].includes(ku)) {
      tra.tipo = v;
    } else if (['NUMERO DE TRAMITE', 'NO. TRAMITE'].includes(ku)) {
      tra.numero = v;
    }
  }

  const hasData = !!(dg.expediente || dg.denominacion || tit.nombre);
  return hasData ? data : null;
}

async function queryExpediente(
  expediente: string,
  session: Session
): Promise<Record<string, unknown> | null> {
  try {
    // Use exact same form fields as working Python scraper
    const formData = new URLSearchParams();
    formData.append('frmBsqExp', 'frmBsqExp');
    formData.append('frmBsqExp:expedienteId', expediente);
    formData.append('frmBsqExp:busquedaId2', '');
    formData.append('javax.faces.ViewState', session.viewState);

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
      'Referer': SEARCH_URL,
      'Origin': 'https://acervomarcas.impi.gob.mx:8181',
    };
    
    if (session.cookies) {
      headers['Cookie'] = session.cookies;
    }

    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers,
      body: formData.toString(),
      redirect: 'follow',
    });
    
    const text = await res.text();
    
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
      service: 'direct-http-v4',
      mode: 'direct-impi',
      viewStateAvailable: !!session,
      hasCookies: !!(session && session.cookies),
      formFields: 'frmBsqExp (matching python scraper)',
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
    // Fresh session for each POST
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
      const results: Record<string, unknown>[] = [];
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
