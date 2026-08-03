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

## 0. Leer el config del cliente

Antes de cualquier otra cosa, leer `clients/<slug>/config.json`.

- Si `site.active` es `false`: **detente y avisa** al usuario. No generes
  el reporte. Esto es una regla dura, no una sugerencia (ver
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

El orden importa: los pasos 6 y 7 dependen de que el paso 5 ya haya
descargado HTML y esté mergeado en `data.json`.

| # | Sección (key en data.json) | Cómo se obtiene |
|---|---|---|
| 1 | `meta`, `headerBadges`, `stats` | **Manual, sin script todavía.** Llamar `get_search_analytics` (dims `device`) del MCP de GSC para el período actual y el anterior, y `list_sitemaps` para conteos de URLs. Replicar el patrón ya usado en corridas anteriores (ver `reports/jorgejaramillo/*/data.json` como referencia de forma). |
| 2 | `clicksOverTime` | `node scripts/sections/clicks-over-time.js <slug> <reportDate>` |
| 3 | `cannibalization` | `node scripts/sections/cannibalization.js <slug>` |
| 4 | `winners`, `losers`, `landingsPeriodLabel` | `node scripts/sections/landings-delta.js <slug> <reportDate>` |
| 5 | `landingsCrawl` | `node scripts/sections/landings-crawl.js <slug> <reportDate>` — requiere `CF_ACCOUNT_ID`/`CF_API_TOKEN` en `.env` |
| 6 | `aiActions` | **Manual: skill `analista`**, sobre el HTML que acaba de descargar el paso 5 (`reports/<slug>/<reportDate>/data/crawl/`). Requiere que el paso 5 ya haya corrido. |
| 7 | `findings` | `node scripts/sections/findings.js <slug> <reportDate>` — requiere que `landingsCrawl` (paso 5) ya esté en `data.json`. |
| 8 | `keywords` | `node scripts/sections/keywords.js <slug> <reportDate>` |
| 9 | `sitemap` | `node scripts/sections/sitemap.js <slug>` |
| 10 | `robotsTxt` | `node scripts/sections/robots.js <slug> <reportDate>` |
| 11 | `keywordPositions` | `node scripts/sections/keyword-positions.js <slug>` — **datos dummy todavía** (posición aleatoria), pendiente de conectar a la posición mensual real por query vía GSC. |

Cada script CLI imprime el fragmento JSON a stdout (logs de progreso van a
stderr) — mergéalo en `reports/<slug>/<reportDate>/data.json` bajo su key
correspondiente antes de pasar al siguiente paso.

## 3. Generar el HTML

Cuando las 10 secciones estén en `data.json`:

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
- El paso 1 (header/stats) es el único que no tiene script propio todavía;
  si se construye `scripts/sections/header.js` en el futuro, esta tabla
  debe actualizarse para reflejarlo.
