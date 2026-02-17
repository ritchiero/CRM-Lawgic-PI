import { NextRequest, NextResponse } from 'next/server';

const SEARCH_URL = 'https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi';

export const maxDuration = 300;

let cachedViewState: string | null = null;
let viewStateTimestamp = 0;
const VIEWSTATE_TTL = 120000;

async function getViewState(): Promise<string | null> {
  const now = Date.now();
  if (cachedViewState && (now - viewStateTimestamp) < VIEWSTATE_TTL) {
    return cachedViewState;
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
    if (match) {
      cachedViewState = match[1];
      viewStateTimestamp = now;
      return cachedViewState;
    }
    return null;
  } catch (e) {
    console.error('ViewState fetch error:', e);
    return null;
  }
}

function parseExpedienteHtml(html: string): {
  status: string;
  datos_generales: Record<string, string>;
  titular: Record<string, string>;
  apoderado: Record<string, string>;
  establecimiento: Record<string, string>;
  productos_servicios: string;
  tramite: Record<string, string>;
} {
  const data = {
    status: 'not_found' as string,
    datos_generales: {} as Record<string, string>,
    titular: {} as Record<string, string>,
    apoderado: {} as Record<string, string>,
    establecimiento: {} as Record<string, string>,
    productos_servicios: '' as string,
    tramite: {} as Record<string, string>,
  };

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];
    const tableTextUpper = tableContent.replace(/<[^>]+>/g, ' ').toUpperCase().substring(0, 500);
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells = rowMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!cells || cells.length < 2) continue;

      const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').trim();
      const k = stripHtml(cells[0]).replace(/:$/, '').trim();
      const v = stripHtml(cells[1]).trim();
      if (!k || !v) continue;

      const ku = k.toUpperCase();

      if (['EXPEDIENTE', 'NO. DE EXPEDIENTE', 'NUMERO DE EXPEDIENTE'].includes(ku)) {
        data.datos_generales.expediente = v;
      } else if (['DENOMINACION', 'SIGNO DISTINTIVO', 'MARCA'].includes(ku)) {
        data.datos_generales.denominacion = v;
      } else if (['CLASE', 'CLASE NIZA'].includes(ku)) {
        data.datos_generales.clase = v;
      } else if (['TIPO DE SIGNO', 'TIPO SIGNO', 'TIPO'].includes(ku)) {
        data.datos_generales.tipo_signo = v;
      } else if (['FECHA DE PRESENTACION', 'FECHA PRESENTACION'].includes(ku)) {
        data.datos_generales.fecha_presentacion = v;
      } else if (['FECHA DE REGISTRO', 'FECHA REGISTRO', 'FECHA DE CONCESION'].includes(ku)) {
        data.datos_generales.fecha_registro = v;
      } else if (['SITUACION', 'SITUACION DEL EXPEDIENTE', 'STATUS'].includes(ku)) {
        data.datos_generales.situacion = v;
      } else if (['VIGENCIA', 'FECHA DE VIGENCIA'].includes(ku)) {
        data.datos_generales.vigencia = v;
      } else if (ku.includes('TITULAR') || ku === 'NOMBRE DEL TITULAR') {
        if (!data.titular.nombre) data.titular.nombre = v;
      } else if (ku.includes('DOMICILIO') && tableTextUpper.includes('TITULAR')) {
        data.titular.domicilio = v;
      } else if (ku === 'NACIONALIDAD') {
        data.titular.nacionalidad = v;
      } else if (ku.includes('APODERADO')) {
        if (!data.apoderado.nombre) data.apoderado.nombre = v;
      } else if (ku.includes('DOMICILIO') && tableTextUpper.includes('APODERADO')) {
        data.apoderado.domicilio = v;
      } else if (ku === 'ESTABLECIMIENTO') {
        data.establecimiento.nombre = v;
      } else if (ku === 'UBICACION') {
        data.establecimiento.ubicacion = v;
      } else if (['PRODUCTOS', 'SERVICIOS', 'PRODUCTOS O SERVICIOS'].includes(ku)) {
        data.productos_servicios = v;
      } else if (['TRAMITE', 'TIPO DE TRAMITE'].includes(ku)) {
        data.tramite.tipo = v;
      } else if (['NUMERO DE TRAMITE', 'NO. TRAMITE'].includes(ku)) {
        data.tramite.numero = v;
      }
    }
  }

  const hasData = !!(data.datos_generales.expediente || data.datos_generales.denominacion || data.titular.nombre);
  if (hasData) {
    data.status = 'found';
  }

  return data;
}

async function queryExpediente(
  expediente: string,
  viewstate: string
): Promise<{ status: string; [key: string]: unknown } | null> {
  const formData = new URLSearchParams();
  formData.append('frmBsqExp', 'frmBsqExp');
  formData.append('frmBsqExp:expedienteId', expediente);
  formData.append('frmBsqExp:busquedaId2', '');
  formData.append('javax.faces.ViewState', viewstate);

  try {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      body: formData.toString(),
      redirect: 'follow',
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const parsed = parseExpedienteHtml(html);
    return { ...parsed, expediente_query: expediente };
  } catch (e) {
    console.error('Query error for ' + expediente + ':', e);
    return null;
  }
}

// GET /api/acervo-expedientes - Health check
export async function GET() {
  try {
    const vs = await getViewState();
    return NextResponse.json({
      status: vs ? 'ok' : 'error',
      service: 'direct-http',
      mode: 'direct-impi',
      viewStateAvailable: !!vs,
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

// POST /api/acervo-expedientes - Query expediente(s) directly from IMPI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expediente, expedientes } = body;

    const viewstate = await getViewState();
    if (!viewstate) {
      return NextResponse.json(
        { status: 'error', message: 'Could not obtain ViewState from IMPI' },
        { status: 503 }
      );
    }

    if (expediente) {
      const result = await queryExpediente(String(expediente), viewstate);
      if (result) {
        return NextResponse.json({ results: [result] });
      }
      return NextResponse.json({ results: [] });
    }

    if (expedientes && Array.isArray(expedientes)) {
      const results = [];
      for (const exp of expedientes) {
        const result = await queryExpediente(String(exp), viewstate);
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
