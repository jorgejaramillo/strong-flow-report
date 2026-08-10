# CONTRIBUTING

Proceso para agregar nuevas features (secciones) al pipeline de reportes Flow.

## 1. Resumen del pipeline

```
clients/<slug>/.flow-cache.json (config real, vía sync-config.js)
        │
        ▼
scripts/sections/*.js  →  cada script imprime SU key en JSON (stdout)
        │  (run-flow.js los corre en orden, respetando `requires`)
        ▼
reports/<slug>/<fecha>/data.json   (una key por sección, acumulativo/cacheable)
        │
        ▼  build-report.js: template.replace('/*__REPORT_DATA__*/', JSON.stringify(data))
templates/report.template.html  (shell HTML + script de render embebido)
        │
        ▼
reports/<slug>/<fecha>/report.html   (nunca se edita a mano, siempre se regenera)
```

## 2. Anatomía de una "sección"

Cada sección es un archivo `scripts/sections/<nombre>.js` con:

- Una función exportada `async fetch<Cosa>(config, ...)`.
- Un CLI guard: `if (import.meta.url === \`file://${process.argv[1]}\`)`.
- Lee la config del cliente vía `loadClientConfig(slug)` (`scripts/lib/config.js`).
- Imprime **una sola vez** a stdout `{"<key>": ...}` en JSON. Logs/progreso van a stderr, nunca a stdout.
- Escribe solo su(s) propia(s) key(s) en `data.json` — nunca toca las de otras secciones.
- Si depende de datos de otra sección (ej. `findings.js` / `content-improve.js` dependen de `landingsCrawl`), lee esa key desde `data.json` y falla con un mensaje claro si falta.

## 3. Pasos para agregar una feature nueva

1. **(Opcional, prototipo visual)** Agregar el bloque `<section>` en `templates/report.template.html` con IDs únicos + el `<script>` de render que lee `REPORT_DATA.<key>`. Se puede probar con datos falsos metidos a mano en un `data.json` de prueba y corriendo `build-report.js`, para validar el diseño antes de tener datos reales.
2. Crear `scripts/sections/<nueva>.js` siguiendo el patrón de la sección 2. Correrlo suelto:
   ```
   node scripts/sections/<nueva>.js <slug> [fecha]
   ```
   e inspeccionar el JSON impreso.
3. Confirmar que la key coincide con lo que el template espera leer.
4. Registrar el paso en el array `STEPS` de `scripts/run-flow.js`:
   ```js
   { name, script, args, outputKeys, requires? }
   ```
   ubicado después de cualquier sección de la que dependa.
5. Si aún no se hizo el paso 1, agregar ahora el bloque de UI + render JS en `templates/report.template.html` (o extender un bloque existente, como hizo `domainAnalytics` reutilizando `stats-grid`).
6. Probar end-to-end:
   ```
   node scripts/run-flow.js <slug> --fresh
   node scripts/build-report.js <slug> <fecha>
   ```
   Abrir el `report.html` resultante y revisar visualmente.
7. Si la sección necesita credenciales nuevas, documentarlas en la sección "Setup" del `README.md`.
8. Actualizar la tabla de pasos en `.claude/skills/flow/SKILL.md` — se trata como documentación viva del pipeline y debe reflejar el nuevo paso/orden.

## 4. Caso especial: `analista`

Es la única "sección" sin script — es un skill conversacional (`.claude/skills/analista/SKILL.md`) que depende de `landingsCrawl`, escribe solo la key `aiActions`, y requiere re-correr `build-report.js` manualmente después de usarlo.

## 5. Convenciones a respetar

- Cada sección escribe únicamente su(s) key(s) — nunca pisar las de otras.
- `run-flow.js` cachea: si `data[key]` ya existe para todas las `outputKeys` de un paso, se salta salvo que se pase `--fresh`.
- `report.html` nunca se edita a mano — siempre se regenera desde `data.json` + `report.template.html` vía `build-report.js`.
- `site.active: false` en el config del cliente aborta el flow completo (regla dura).
