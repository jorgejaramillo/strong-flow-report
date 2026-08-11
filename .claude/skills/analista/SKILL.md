---
name: analista
description: >
  Analiza el HTML descargado por el crawler (reports/<slug>/<fecha>/data/crawl/)
  contra un checklist de buenas prácticas SEO/contenido y genera hallazgos
  accionables. Usar después de crawlear las landings de un cliente para poblar
  la sección "Acciones recomendadas (análisis IA)" del reporte.
---

# Analista

## Cuándo usar este skill

Después de correr el crawler (`cloudflare-crawl` o
`scripts/sections/landings-crawl.js`) para un cliente, cuando se quiera
poblar `aiActions` en `reports/<slug>/<fecha>/data.json` con hallazgos
reales en vez de datos de ejemplo.

## Insumos

1. **Checklist**: `best-practices.md` en esta misma carpeta — es la fuente
   de verdad vigente, editable sin tocar este `SKILL.md`. Si el usuario pide
   ajustar criterios de análisis, edita ese archivo, no este.
2. **HTML crawleado**: todos los archivos `.html` en
   `reports/<slug>/<fecha>/data/crawl/` — cada archivo es el HTML final
   renderizado (post-JS) de una landing, tal como lo indexa Google.
3. **Mapeo URL ↔ archivo**: `reports/<slug>/<fecha>/data.json` →
   `landingsCrawl` (`[{ url, localPath }]`) para saber a qué URL
   corresponde cada archivo descargado.

## Cómo analizar

1. Lee `best-practices.md` completo.
2. Lee cada archivo HTML listado en `landingsCrawl`.
3. Para cada página, evalúa el HTML contra cada punto del checklist.
4. Reporta **solo incumplimientos reales y accionables** — no listes lo que
   sí cumple, no repitas el checklist como si fuera el output.
5. Prioriza los hallazgos según la sección "Cómo priorizar hallazgos" del
   checklist (impacto en indexación/ranking primero).
6. Formatea cada hallazgo como un objeto `{ page, detail }`, mismo shape
   que ya usan `findings` y `contentImprove` en el template del reporte:

   ```
   { "page": "{URL completa de la landing}", "detail": "{qué está mal}: {acción concreta}." }
   ```

   Ejemplo:
   `{ "page": "https://dominio.com/servicios.html", "detail": "No tiene meta description: agregar una de 120-155 caracteres con la keyword principal." }`

7. Recorre **cada** página de `landingsCrawl` una por una contra el
   checklist completo — no te quedes con el primer hallazgo de cada
   página, revisá las 8 categorías del checklist (título/metadatos,
   encabezados, contenido, imágenes, enlaces, datos estructurados, señales
   técnicas) antes de pasar a la siguiente. Reporta todos los
   incumplimientos reales y accionables que encuentres en el crawl
   completo, sin límite de cantidad — ordenados según la priorización del
   punto 5.

## Output

Un array de objetos `{page, detail}` en ese formato. Se guarda
reemplazando **solo** el campo `aiActions` de
`reports/<slug>/<fecha>/data.json` (no tocar ninguna otra key del
archivo). Después de escribirlo, correr:

```bash
node scripts/build-report.js <slug> <fecha>
```

para regenerar `report.html` con los hallazgos nuevos.
