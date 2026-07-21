# Actividad verificada de representantes

La búsqueda superficial de Acervo Marcas devuelve fichas internas, no el total
de expedientes de una persona. La verificación recorre todas las fichas del
nombre, extrae los expedientes de cada reporte y deduplica por número de
expediente.

## Campos

- `representativeActivityVerified`: solo es `true` al terminar todas las fichas.
- `representativeActivityVerificationStatus`: `pending`, `in_progress`,
  `cooldown`, `verified` o `failed`.
- `representativeActivityLevel`: `Alta`, `Media`, `Baja` o `Incipiente`.
- `representativeActivityCount`: expedientes únicos cuando está verificado;
  conteo histórico mientras está pendiente.
- `impiProfileCount` / `impiProfilesProcessed`: avance de fichas internas.
- `impiRawExpedientCount`: suma de los totales de todas las fichas.
- `impiUniqueExpedientCount`: total deduplicado por expediente.
- `representativeActivityVerifiedAt`: fecha de la comprobación completa.

Los niveles se calculan así: Alta desde 200; Media de 75 a 199; Baja de 25 a
74; Incipiente de 0 a 24.

## Ejecución y reanudación

Instala las dependencias del verificador:

```bash
python3 -m pip install -r src/app/target/scripts/requirements.txt
```

Procesa o retoma los 1,000 representantes:

```bash
npm run verify:representatives
```

Para el proceso autónomo, con reinicios y publicación a producción cada diez
representantes verificados:

```bash
npm run verify:representatives:continuous
```

El supervisor termina primero el conteo histórico rápido de MARCia y después
continúa automáticamente la auditoría reciente ficha por ficha en Marcanet.
Conserva el checkpoint de cada ficha y publica cada diez representantes. La
publicación valida TypeScript, crea un commit limitado a los dos archivos de
actividad, actualiza `main` y deja que Vercel despliegue producción.

El checkpoint y los resultados JSONL se guardan en
`src/app/target/scripts/runtime/`. Cuando IMPI limita las consultas, el proceso
guarda el avance, espera 600 segundos, crea una sesión nueva y continúa sin
intervención.

Las cuentas Webshare pueden configurarse con `WEBSHARE_API_TOKENS` (separadas
por coma) o `WEBSHARE_API_TOKEN_1` / `WEBSHARE_API_TOKEN_2`. En el worker local
se leen del Keychain bajo `lawgic.webshare.api1` y
`lawgic.webshare.api2`; las llaves y contraseñas de proxy nunca se escriben en
el repositorio. Si una IP es limitada, Marcanet cambia de proxy de inmediato;
la espera de diez minutos queda como respaldo para una conexión directa.

## Verificación rápida con MARCia

La cola continua usa MARCia para los representantes pendientes. El nombre se
normaliza en mayúsculas, sin acentos y como frase entre comillas; sin las
comillas, MARCia separa las palabras y devuelve conteos inflados.

MARCia declara actualmente un corte de indexación del 2 de febrero de 2020.
Por eso estos registros se guardan con la base
`verified_marcia_exact_agent_records`, la fuente
`marcia_exact_agent_phrase` y el campo `impiSourceIndexedAt`. Son una
comprobación histórica exacta y rápida, no sustituyen una auditoría reciente
ficha por ficha en Marcanet.

## Sincronización con Firestore

La sincronización usa la sesión de Firebase CLI y siempre permite una vista
previa antes de escribir:

```bash
FIREBASE_ACCOUNT_EMAIL=cuenta@ejemplo.com npm run sync:representative-activity -- --initialize
FIREBASE_ACCOUNT_EMAIL=cuenta@ejemplo.com npm run sync:representative-activity -- --initialize --apply
FIREBASE_ACCOUNT_EMAIL=cuenta@ejemplo.com npm run sync:representative-activity -- --input src/app/target/scripts/runtime/representative_activity_results.jsonl --apply
```

Si Firebase informa que la credencial expiró, ejecuta `firebase login --reauth`
y repite el comando. Nunca se marca una actividad como verificada a partir del
conteo histórico solamente.
