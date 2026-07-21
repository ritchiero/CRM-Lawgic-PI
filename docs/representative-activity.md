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

El checkpoint y los resultados JSONL se guardan en
`src/app/target/scripts/runtime/`. Cuando IMPI limita las consultas, el proceso
guarda el avance, espera 600 segundos, crea una sesión nueva y continúa sin
intervención.

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
