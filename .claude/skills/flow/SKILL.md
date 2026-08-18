---
name: flow
description: >
  Orquesta la generación completa de un reporte Flow para un cliente: lee su
  config.json, corre todas las secciones en el orden correcto (respetando
  dependencias entre ellas), arma data.json y genera report.html. Usar
  cuando el usuario pida "corre Flow para <cliente>", "genera el reporte
  de <cliente>", o equivalentes.
---

# Flow — rutina de generación de reportes

## Vía rápida (recomendada)

Para una corrida completa, usar el orquestador en vez de correr cada script
a mano:

```bash
node scripts/run-flow.js <slug> [reportDate YYYY-MM-DD]
```

Esto corre sync-config, valida `site.active`, y luego todas las secciones
automatizables (todo excepto `aiActions`) en el orden correcto, mergeando
cada resultado en `reports/<slug>/<reportDate>/data.json` y regenerando
`report.html` al final. Muestra en terminal el avance y el tiempo de cada
paso, y al terminar resume qué falló o se saltó.

`aiActions` sigue siendo manual (skill `analista`, ver paso 7 abajo) — después
de correrlo, volver a llamar `node scripts/build-report.js <slug> <reportDate>`
para que el HTML lo incluya.

`run-flow.js` hace **resume por defecto**: si una sección ya escribió sus
keys en `data.json` (de una corrida anterior, completa o interrumpida por
un error), se saltea y se marca "ya hecho (cache)" en vez de volver a
correrla — así no repite llamadas pagas (DataForSEO en `domainAnalytics`,
`contentImprove`, `keywordVolume`; ValueSERP también en `keywordVolume`)
que ya quedaron guardadas. Si un paso
falló, correr el comando de nuevo reintenta solo ese paso (y los que
falten). Para forzar una corrida completa desde cero, ignorando el cache,
agregar `--fresh`.

El resto de esta sección detalla qué hace cada paso — útil para debugging
o para correr uno solo.

## 0. Traer el config actualizado de Flow

Antes de cualquier otra cosa, correr:

```bash
node scripts/sync-config.js <slug>
```

Esto descarga el config vigente desde Flow (usando el `config_api_key` de
`clients/<slug>/config.json`) y lo cachea en `clients/<slug>/.flow-cache.json`.
Todos los scripts de `scripts/sections/*.js` leen de ahí automáticamente vía
`loadClientConfig(slug)` — no hace falta tocar nada más.

- Si el comando falla (key inválida, cliente sin config en Flow), **detente
  y avisa** al usuario — no sigas con datos viejos.
- Revisar `clients/<slug>/.flow-cache.json` → `data.site.active`. Si es
  `false`: **detente y avisa** al usuario. No generes el reporte. Esto es
  una regla dura, no una sugerencia (ver
  [CONFIG_SPEC.md](../../../CONFIG_SPEC.md)).
- Si falta algún dato que un paso necesita (ej. `gsc.siteUrl`,
  `crawl.seedUrls`), repórtalo y pregunta — no lo inventes.

## 1. Definir la fecha del reporte

`reportDate` = fecha de hoy en formato `YYYY-MM-DD`, salvo que el usuario
pida explícitamente otra fecha. Todos los comandos de abajo usan
`<slug>` (el de `config.json`) y `<reportDate>`.

Si `reports/<slug>/<reportDate>/data.json` no existe, créalo desde cero
(objeto `{}` en un archivo, o cópialo de la corrida anterior más reciente
como punto de partida). Cada paso de abajo **solo escribe su propia key**
en ese `data.json` — nunca pisa las keys de otro paso.

## 2. Orden de ejecución

Esta tabla usa la misma numeración 1-13 que `STEPS` en `run-flow.js` (y que
el progreso `[n/13]` que imprime en terminal) — `aiActions` no está en
`STEPS` (no es automatizable), así que aparece como fila manual entre los
pasos 6 y 7 en vez de ocupar un número. El orden importa: los pasos 7
(`findings`) y 8 (`contentImprove`) dependen de que el paso 6
(`landingsCrawl`) ya haya descargado HTML y esté mergeado en `data.json` —
`aiActions` también, aunque al ser manual no está sujeto al orden del
array.

| # | Sección (key en data.json) | Cómo se obtiene |
|---|---|---|
| 1 | `meta`, `headerBadges`, `stats` | `node scripts/sections/header.js <slug> <reportDate>` — clicks/impresiones/CTR/posición del período actual vs. anterior (vía GSC) y conteos de sitemap. `headerBadges` ya no se renderiza en el template (se quitó del header), pero el paso sigue generándolo por si se reusa más adelante. |
| 2 | `domainAnalytics` | `node scripts/sections/domain-analytics.js <slug>` — DataForSEO Domain Analytics API (`domain_analytics/whois/overview`): keywords orgánicas, tráfico estimado, backlinks y fecha de registro del dominio. Requiere `DATAFORSEO_USERNAME`/`DATAFORSEO_PASSWORD` en `.env`. Sin dependencias de otros pasos. |
| 3 | `clicksOverTime` | `node scripts/sections/clicks-over-time.js <slug> <reportDate>` |
| 4 | `cannibalization` | `node scripts/sections/cannibalization.js <slug>` — excluye queries de marca (`config.keywords.brand`). No toma `reportDate`: siempre usa los últimos N días desde hoy (`--days`, default 28), no el período del reporte. |
| 5 | `winners`, `losers`, `landingsPeriodLabel` | `node scripts/sections/landings-delta.js <slug> <reportDate>` |
| 6 | `landingsCrawl` | `node scripts/sections/landings-crawl.js <slug> <reportDate>` — requiere `CF_ACCOUNT_ID`/`CF_API_TOKEN` en `.env` |
| — | `aiActions` (manual, no está en `STEPS`) | **Manual: skill `analista`**, sobre el HTML que acaba de descargar el paso 6 (`reports/<slug>/<reportDate>/data/crawl/`). Requiere que el paso 6 ya haya corrido. `run-flow.js` no lo corre — hay que invocarlo aparte (ver paso 7 más abajo) y volver a correr `build-report.js`. |
| 7 | `findings` | `node scripts/sections/findings.js <slug> <reportDate>` — requiere que `landingsCrawl` (paso 6) ya esté en `data.json`. Excluye el home/index ("/", "/index"): prioriza páginas internas. |
| 8 | `contentImprove` | `node scripts/sections/content-improve.js <slug> <reportDate>` — DataForSEO AI Optimization API (ChatGPT), requiere `DATAFORSEO_USERNAME`/`DATAFORSEO_PASSWORD` en `.env` y que `landingsCrawl` (paso 6) ya esté en `data.json`. Tiene costo por llamada (~$0.002/página). |
| 9 | `keywords` | `node scripts/sections/keywords.js <slug> <reportDate>` |
| 10 | `sitemap` | `node scripts/sections/sitemap.js <slug>` |
| 11 | `robotsTxt` | `node scripts/sections/robots.js <slug> <reportDate>` |
| 12 | `keywordVolume` | `node scripts/sections/keyword-volume.js <slug> <reportDate>` — sección "Volumen de búsqueda": una fila por seedKeyword cruzando tres fuentes independientes: volumen de búsqueda mensual (DataForSEO `keywords_data/google_ads/search_volume`), clicks/impresiones reales en el período (GSC, dimensión `query`, match exacto case-insensitive) y posición actual en Google vía búsqueda en vivo (ValueSERP) — busca la keyword y ubica en qué posición del SERP aparece una URL de `config.domain` (o un subdominio). Requiere `DATAFORSEO_USERNAME`/`DATAFORSEO_PASSWORD` y `VALUESERP_API_KEY` en `.env`, y que `site.country` esté mapeado en `LOCATION_NAMES`/`COUNTRY_CODES` dentro del script. Si una keyword no tiene datos en alguna fuente, esa celda queda vacía ("sin datos") sin afectar a las demás. |
| 13 | `queryVariations` | `node scripts/sections/query-variations.js <slug> <reportDate>` — sección "Consulta principal y variaciones": una fila por URL de `config.crawl.seedUrls` (todas, no solo las primeras `maxPages` — ese límite es de costo de crawl, no aplica acá) con la query de mayor clicks para esa URL (GSC, dimensión `query` filtrada por `PAGE equals`) como `mainQuery`, y hasta 5 queries siguientes por clicks como `variations`. A diferencia de `findings`, acá SÍ se incluyen queries de marca a propósito (para el home, la marca suele ser la consulta principal real). Sin dependencias de otros pasos — no requiere `landingsCrawl`. Si una URL no tiene tráfico en GSC, `mainQuery` queda `null` y `variations` vacío. |

Cada script CLI imprime el fragmento JSON a stdout (logs de progreso van a
stderr) — mergéalo en `reports/<slug>/<reportDate>/data.json` bajo su key
correspondiente antes de pasar al siguiente paso.

## 3. Generar el HTML

Cuando las 13 secciones automáticas (+ `aiActions` manual, si aplica) estén
en `data.json`:

```bash
node scripts/build-report.js <slug> <reportDate>
```

Esto regenera `reports/<slug>/<reportDate>/report.html` a partir del
`data.json` completo — nunca se edita `report.html` a mano.

## 4. Reportar al usuario

Al terminar, resume qué se generó (path del `report.html`, cualquier
sección que haya fallado o que se haya saltado por falta de datos) — no
asumas que el usuario quiere abrir el archivo, solo dile dónde quedó.

## Notas

- Si un paso falla (ej. faltan credenciales, la propiedad GSC no tiene
  datos), repórtalo y sigue con las demás secciones en vez de abortar todo
  el reporte — cada key de `data.json` es independiente.
