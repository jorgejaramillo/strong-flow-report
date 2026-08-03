# Strong Flow Report

Generador de reportes SEO por cliente. Combina datos de **Google Search
Console** (clicks, impresiones, posiciones, sitemap) con **HTML renderizado
vía Cloudflare Browser Rendering** (lo que Google realmente indexa) para
producir un reporte único en HTML, autocontenido, que se abre con doble clic
o se exporta a PDF.

## Cómo está armado

```
clients/<slug>/config.json          # datos del cliente: dominio, propiedad GSC, URLs a crawlear
templates/report.template.html      # el template visual (Tailwind + daisyUI + ECharts + Tabulator)
scripts/build-report.js             # inyecta data.json en el template -> report.html
reports/<slug>/<fecha>/
  data.json                         # los datos de esa corrida del reporte (se versiona)
  report.html                       # el reporte generado (se versiona)
  data/crawl/                       # HTML crudo descargado por el crawler (NO se versiona, es regenerable)
crawler/SKILL.md                    # skill: descarga HTML renderizado de una o varias URLs vía Cloudflare
mcp-google-search-console/          # servidor MCP de Google Search Console (repo aparte, con su propio git)
dataforseo-mcp/                     # servidor MCP de DataForSEO (repo aparte, con su propio git)
```

- `clients/<slug>/config.json` define un cliente: `domain`, `gsc.siteUrl`
  (la propiedad exacta en Search Console) y `crawl.seedUrls`/`crawl.maxPages`
  (qué páginas descargar cuando se corre el crawler).
- `reports/<slug>/<fecha>/data.json` es la fuente de verdad de una corrida
  del reporte — el `report.html` de esa carpeta se genera 1:1 a partir de
  ese JSON con `scripts/build-report.js`. Nunca se edita `report.html` a
  mano, se regenera.
- `reports/<slug>/<fecha>/data/crawl/` guarda el HTML descargado por el
  crawler para esa corrida — es material de trabajo/consulta, no se sube a
  git (está en `.gitignore`), se puede volver a descargar cuando se quiera.

### Estado actual de los datos

Hoy **no existe un pipeline automático** que llene `data.json` completo por
sí solo. El flujo real es conversacional en Claude Code:

1. Se piden datos reales de Search Console usando el MCP `google-search-console`
   (tools `get_search_analytics`, `list_sitemaps`, `inspect_url`, `list_sites`)
   o el skill `gsc-seo-analyzer` (prompts para quick-wins, canibalización,
   CTR anómalo, reporte mensual, content-gap).
2. Si hace falta ver el HTML real de una página, se usa el skill
   `cloudflare-crawl` para descargarlo a `reports/<slug>/<fecha>/data/crawl/`.
3. Con esos resultados se edita a mano `reports/<slug>/<fecha>/data.json`.
4. Se corre `scripts/build-report.js` para generar el `report.html` final.

Es decir: cada sección del reporte (stats, canibalización, keywords,
ganadores/perdedores, findings, etc.) se llena "a pedido" combinando estas
herramientas dentro de la conversación con Claude — todavía no hay un script
único que corra todo de punta a punta.

## Setup

### 1. Cloudflare Browser Rendering (crawler)

En el `.env` de este repo (raíz, gitignored):

```
CF_ACCOUNT_ID=...   # dashboard de Cloudflare → barra lateral derecha
CF_API_TOKEN=...    # My Profile → API Tokens → permiso "Browser Rendering – Edit"
```

### 2. Google Search Console (MCP)

Vive en `mcp-google-search-console/` — es **un repo git aparte** (tiene su
propio remoto en GitHub), por eso está excluido de este repo vía
`.gitignore`. Trae su propio `.env` y su propio flujo de autenticación
OAuth:

```bash
cd mcp-google-search-console
node auth.js --setup     # abre el navegador, autoriza la cuenta de Google, guarda .tokens.json
```

El servidor MCP se registra en `.mcp.json` en la raíz de este repo (ya
configurado) y se habilita en `.claude/settings.local.json`.

### 3. ScraperAPI (opcional, para content-gap-analyzer)

El skill `content-gap-analyzer` (dentro de `mcp-google-search-console/`)
usa `SCRAPERAPI_KEY` para scrapear páginas cuando el crawler de Cloudflare
no es necesario/suficiente.

### 4. DataForSEO (MCP)

Vive en `dataforseo-mcp/` — igual que `mcp-google-search-console/`, es **un
repo git aparte** ([`dataforseo/mcp-server-typescript`](https://github.com/dataforseo/mcp-server-typescript),
la fuente oficial de [`dataforseo-mcp-server`](https://dataforseo.com/model-context-protocol)),
clonado dentro de este repo pero excluido vía `.gitignore`. Da acceso a
datos de keyword research, SERP, backlinks y auditoría on-page que
complementan lo que trae el MCP de Google Search Console.

Se instala y compila una sola vez:

```bash
cd dataforseo-mcp
npm install   # corre el build (TypeScript) automáticamente vía el script "prepare"
```

Necesita credenciales del dashboard de API Access de DataForSEO:

```
DATAFORSEO_USERNAME=tu_login
DATAFORSEO_PASSWORD=tu_password
```

`.mcp.json` referencia estas variables como `${DATAFORSEO_USERNAME}` /
`${DATAFORSEO_PASSWORD}` (expansión de variables de entorno de Claude
Code) — **no pegues las credenciales directamente en `.mcp.json`**, ese
archivo se versiona en git. Hay placeholders vacíos en el `.env` de la
raíz; para que la expansión funcione, expórtalas también en tu shell
(ej. en `~/.zshrc`) o cárgalas antes de abrir Claude Code:

```bash
export DATAFORSEO_USERNAME=tu_login
export DATAFORSEO_PASSWORD=tu_password
```

Se habilita en `.claude/settings.local.json` (ya configurado).

## Uso

### Agregar un cliente nuevo

Copiar `clients/_template/config.json` a `clients/<slug>/config.json`. La
estructura completa del config, el significado de cada campo y las reglas
que debe seguir un agente al leerlo están en **[CONFIG_SPEC.md](CONFIG_SPEC.md)**
— es la fuente de verdad, no se improvisan campos nuevos fuera de ahí.

`gsc.siteUrl` debe coincidir exactamente con una propiedad verificada en
Search Console (usa la tool `list_sites` del MCP para ver las disponibles;
puede ser `https://dominio.com/` o `sc-domain:dominio.com`).

### Generar un reporte

1. Pide a Claude que traiga los datos reales que necesites para ese cliente
   (vía MCP de GSC y/o el skill `cloudflare-crawl`).
2. Vuelca esos datos en `reports/<slug>/<fecha>/data.json` (usa un reporte
   anterior como plantilla de la forma que espera `templates/report.template.html`).
3. Genera el HTML final:

   ```bash
   node scripts/build-report.js <slug> <fecha>
   # ej: node scripts/build-report.js jorgejaramillo 2026-08-02
   ```

4. Abre `reports/<slug>/<fecha>/report.html` directo en el navegador (no
   necesita servidor) o usa el botón "Exportar PDF" del reporte para
   imprimirlo.

## Skills disponibles (Claude Code)

- **`flow`** — orquesta la rutina completa: lee `clients/<slug>/config.json`
  (respeta `site.active`), corre las 10 secciones en el orden correcto
  (respetando dependencias, ej. `landings-crawl` antes de `findings`),
  arma `data.json` y genera `report.html`. Es el punto de entrada para
  "corre Flow para `<cliente>`".
- **`analista`** — analiza el HTML descargado por el crawler contra
  `best-practices.md` y genera los hallazgos de "Acciones recomendadas".
- **`cloudflare-crawl`** — descarga el HTML renderizado (post-JS) de una o
  varias URLs vía Cloudflare Browser Rendering; guarda en
  `reports/<slug>/<fecha>/data/crawl/`.
- **`gsc-seo-analyzer`** — playbooks sobre datos reales de GSC: quick wins,
  anomalías de CTR, reporte mensual, canibalización de keywords, content
  gap.
