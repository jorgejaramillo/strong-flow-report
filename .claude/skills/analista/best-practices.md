# Best practices — Análisis de landings (SEO on-page)

Checklist que usa el skill **analista** para auditar el HTML crawleado.
Editable: agrega, quita o ajusta puntos sin tocar `SKILL.md`.

## Título y metadatos
- `<title>` presente, único en el sitio, entre ~50-60 caracteres, con la
  keyword principal cerca del inicio.
- `<meta name="description">` presente, única, entre ~120-155 caracteres,
  con la keyword principal y un llamado a la acción implícito.
- `<link rel="canonical">` presente y apuntando a la URL correcta (sin
  parámetros de tracking, sin duplicar `www`/`non-www` o `http`/`https`).
- `<meta name="viewport" content="width=device-width...">` presente
  (mobile-friendly).

## Encabezados
- Exactamente un `<h1>` por página, describe el tema central.
- Jerarquía de headings coherente (no saltar de `<h1>` a `<h3>` sin `<h2>`).
- Los headings no están vacíos ni duplican el `<title>` palabra por palabra.

## Contenido
- La keyword/tema principal aparece en el `<h1>`, en el primer párrafo y en
  al menos un subtítulo.
- Sin contenido claramente insuficiente (thin content) para el propósito de
  la página — evalúa según el tipo de página, no un mínimo de palabras fijo.
- Sin bloques de texto duplicados entre landings del mismo crawl (mismo
  párrafo copiado en 2+ páginas).

## Imágenes y accesibilidad
- Todas las `<img>` relevantes (no decorativas) tienen `alt` descriptivo,
  no vacío ni genérico ("imagen", "foto1").

## Enlaces
- Sin enlaces internos rotos evidentes por texto/anchor genérico ("click
  aquí", "leer más" sin contexto).
- Enlaces internos relevantes hacia otras landings del mismo cliente
  cuando el contenido lo amerita (oportunidad de interlinking, no un error
  duro).

## Datos estructurados y social
- Si la página es un artículo/producto/servicio, evaluar si sería
  razonable tener `schema.org` (JSON-LD) y no lo tiene.
- Open Graph básico (`og:title`, `og:description`) presente para páginas
  pensadas para compartirse.

## Señales técnicas visibles en el HTML
- Sin `<meta name="robots" content="noindex">` en páginas que deberían
  indexarse (a menos que sea intencional).
- `<html lang="...">` presente y coherente con el idioma del contenido.

## Cómo priorizar hallazgos
Reporta primero lo que tiene impacto directo en indexación/ranking
(`noindex` por error, título/H1 ausentes, canonical mal apuntado,
canibalización de título/H1 entre landings) antes que detalles menores
(alt text, Open Graph).
