import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { getDbInstance } from '../../../lib/firebase';

const SEARCH_URL = 'https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi';

export const maxDuration = 300;

// --- Firebase lookup (primary source, populated by EC2 Python scraper) ---

async function lookupFirebase(expediente: string): Promise<Record<string, unknown> | null> {
  try {
    const db = getDbInstance();
    const docRef = doc(db, 'expedientes', expediente);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    const dg = d.datos_generales || {};
    return {
      status: 'found',
      expediente_query: expediente,
      source: 'firebase',
      datos_generales: {
        numero_expediente: dg.numero_expediente || expediente,
        denominacion: dg.denominacion || '',
        tipo_solicitud: dg.tipo_solicitud || '',
        tipo_marca: dg.tipo_marca || '',
        fecha_presentacion: dg.fecha_presentacion || '',
        fecha_concesion: dg.fecha_concesion || '',
        fecha_vigencia: dg.fecha_vigencia || '',
        fecha_publicacion: dg.fecha_publicacion || '',
        numero_registro: dg.numero_registro || '',
        descripcion_marca: dg.descripcion_marca || '',
      },
      titular: d.titular || {},
      apoderado: d.apoderado || {},
      establecimiento: d.establecimiento || {},
      productos_servicios: d.productos_servicios || '',
      tramite: d.tramite || {},
    };
  } catch {
    return null;
  }
}

// --- IMPI direct scraping (fallback) ---

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
    const match = html.match(/javax\\.faces\\.ViewState.*?value="([^"]+)"/);
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
  const dg: Record<string, string> = {};
  const titular: Record<string, string> = {};
  const apoderado: Record<string, string> = {};
  const establecimiento: Record<string, string> = {};
  let productosServicios = '';

  // Extract all <td> pairs from <tr> rows
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  let section = 'general';

  // Detect sections by h2/h3 headings before tables
  const sectionMap: Array<{pos: number; name: string}> = [];
  const headingRegex = /<h[23][^>]*>([^<]*)<\/h[23]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const heading = hMatch[1].trim().toUpperCase();
    if (heading.includes('DATOS GENERALES')) sectionMap.push({pos: hMatch.index, name: 'general'});
    else if (heading.includes('TITULAR')) sectionMap.push({pos: hMatch.index, name: 'titular'});
    else if (heading.includes('APODERADO')) sectionMap.push({pos: hMatch.index, name: 'apoderado'});
    else if (heading.includes('ESTABLECIMIENTO')) sectionMap.push({pos: hMatch.index, name: 'establecimiento'});
    else if (heading.includes('PRODUCTOS')) sectionMap.push({pos: hMatch.index, name: 'productos'});
    else if (heading.includes('TRAMITE')) sectionMap.push({pos: hMatch.index, name: 'tramite'});
  }

  function getSectionAtPos(pos: number): string {
    let result = 'general';
    for (const s of sectionMap) {
      if (pos >= s.pos) result = s.name;
    }
    return result;
  }

  while ((trMatch = trRegex.exec(html)) !== null) {
    section = getSectionAtPos(trMatch.index);
    const rowHtml = trMatch[1];
    const tds: string[] = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      const text = tdMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      tds.push(text);
    }
    if (tds.length >= 2) {
      const key = tds[0].replace(/:$/, '').trim();
      const val = tds[1].trim();
      if (!key) continue;
      const ku = key.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (section === 'general') {
        if (ku.includes('NUMERO DE EXPEDIENTE') || ku === 'EXPEDIENTE') dg.numero_expediente = val;
        else if (ku.includes('NUMERO DE REGISTRO') && !ku.includes('INTERNACIONAL')) dg.numero_registro = val;
        else if (ku.includes('FECHA DE PRESENTACION')) dg.fecha_presentacion = val;
        else if (ku.includes('FECHA DE CONCESION')) dg.fecha_concesion = val;
        else if (ku.includes('FECHA DE VIGENCIA')) dg.fecha_vigencia = val;
        else if (ku.includes('FECHA DE PUBLICACION')) dg.fecha_publicacion = val;
        else if (ku === 'DENOMINACION') dg.denominacion = val;
        else if (ku.includes('DESCRIPCION DE LA MARCA')) dg.descripcion_marca = val;
        else if (ku.includes('TIPO DE SOLICITUD')) dg.tipo_solicitud = val;
        else if (ku.includes('TIPO DE MARCA')) dg.tipo_marca = val;
      } else if (section === 'titular') {
        if (ku === 'NOMBRE') titular.nombre = val;
        else if (ku === 'DIRECCION') titular.direccion = val;
        else if (ku === 'POBLACION') titular.poblacion = val;
        else if (ku === 'CODIGO POSTAL') titular.codigo_postal = val;
        else if (ku === 'PAIS') titular.pais = val;
        else if (ku === 'NACIONALIDAD') titular.nacionalidad = val;
        else if (ku === 'E-MAIL') titular.email = val;
        else if (ku === 'TELEFONO') titular.telefono = val;
      } else if (section === 'apoderado') {
        if (ku === 'NOMBRE') apoderado.nombre = val;
        else if (ku === 'DIRECCION') apoderado.direccion = val;
        else if (ku === 'POBLACION') apoderado.poblacion = val;
        else if (ku === 'CODIGO POSTAL') apoderado.codigo_postal = val;
        else if (ku === 'PAIS') apoderado.pais = val;
        else if (ku === 'NACIONALIDAD') apoderado.nacionalidad = val;
        else if (ku === 'E-MAIL') apoderado.email = val;
        else if (ku === 'TELEFONO') apoderado.telefono = val;
      } else if (section === 'establecimiento') {
        if (ku === 'DIRECCION') establecimiento.direccion = val;
        else if (ku === 'POBLACION') establecimiento.poblacion = val;
        else if (ku === 'CODIGO POSTAL') establecimiento.codigo_postal = val;
        else if (ku === 'PAIS') establecimiento.pais = val;
      } else if (section === 'productos') {
        if (val && ku !== 'CLASE' && ku !== 'DESCRIPCION') {
          productosServicios += (productosServicios ? '; ' : '') + val;
        }
      }
    }
  }

  const hasData = !!(dg.numero_expediente || dg.denominacion || titular.nombre);
  if (!hasData) return null;

  return {
    status: 'found',
    source: 'impi-direct',
    datos_generales: dg,
    titular,
    apoderado,
    establecimiento,
    productos_servicios: productosServicios,
  };
}

async function queryImpi(expediente: string): Promise<Record<string, unknown> | null> {
  const session = await getSession();
  if (!session) return null;

  try {
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

    const result = parseExpedienteHtml(text);
    if (result) {
      result.expediente_query = expediente;
    }
    return result;
  } catch {
    return null;
  }
}

// --- Combined lookup: Firebase first, IMPI fallback ---

async function lookupExpediente(expediente: string): Promise<Record<string, unknown>> {
  // 1. Try Firebase first (data from EC2 Python scraper)
  const fbResult = await lookupFirebase(expediente);
  if (fbResult) return fbResult;

  // 2. Fallback to IMPI direct scraping
  const impiResult = await queryImpi(expediente);
  if (impiResult) return impiResult;

  // 3. Not found anywhere
  return { status: 'not_found', expediente_query: expediente };
}

// GET - Health check
export async function GET() {
  try {
    const session = await getSession();
    let fbOk = false;
    try {
      const db = getDbInstance();
      const testDoc = await getDoc(doc(db, 'expedientes', '3544901'));
      fbOk = testDoc.exists();
    } catch { fbOk = false; }

    return NextResponse.json({
      status: (session || fbOk) ? 'ok' : 'error',
      service: 'firebase-first-v5',
      mode: 'firebase + impi-fallback',
      firebaseConnected: fbOk,
      impiAvailable: !!session,
      hasCookies: !!(session && session.cookies),
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', message },
      { status: 503 }
    );
  }
}

// POST - Query expediente(s): Firebase first, IMPI fallback
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expediente, expedientes } = body;

    if (expediente) {
      const result = await lookupExpediente(String(expediente));
      return NextResponse.json({ results: [result] });
    }

    if (expedientes && Array.isArray(expedientes)) {
      const results: Record<string, unknown>[] = [];
      for (const exp of expedientes) {
        const result = await lookupExpediente(String(exp));
        results.push(result);
        if (expedientes.length > 1) {
          await new Promise(r => setTimeout(r, 200));
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
