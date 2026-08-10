# Config Spec (v1)

Cada proyecto (cliente) vive en su carpeta `clients/<slug>/` con un
`config.json` que sigue exactamente la estructura documentada aquí.
`clients/_template/config.json` es el ejemplo de referencia — cualquier
config nuevo se copia de ahí, no se inventa desde cero.

## Reglas para el agente

- Antes de orquestar tareas de un proyecto, leer su `config.json`.
- Si `site.active` es `false`, omitir el proyecto por completo.
- Usar `site.country` y `site.language` para localización.
- Las keywords se dividen en `keywords.brand` y `keywords.non_brand`; las
  tareas que trabajen con keywords deben respetar esa distinción.
- No inventar campos: si falta un dato, reportarlo, no asumirlo.

## Estructura

```json
{
  "slug": "nombre-cliente",
  "name": "Nombre del cliente",
  "domain": "dominio.com",
  "site": {
    "active": true,
    "country": "col",
    "language": "es"
  },
  "gsc": {
    "siteUrl": "https://dominio.com/"
  },
  "crawl": {
    "seedUrls": ["/"],
    "maxPages": 10
  },
  "seedKeywords": [],
  "keywords": {
    "days": 28,
    "brand": [],
    "non_brand": []
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `slug` | string | Identificador del cliente, coincide con el nombre de su carpeta en `clients/`. |
| `name` | string | Nombre legible del cliente. |
| `domain` | string | Dominio sin protocolo, usado para construir URLs de crawl/robots.txt. |
| `site.active` | boolean | Si es `false`, el cliente se omite por completo — no se procesa, no se genera reporte. |
| `site.country` | string | Código ISO-3166-1 **alpha-3** en minúsculas (ej. `"col"`, `"mex"`, `"usa"`) — mismo formato que la dimensión `country` de la Search Analytics API de GSC. |
| `site.language` | string | Código ISO 639-1 (ej. `"es"`). |
| `gsc.siteUrl` | string | Propiedad exacta en Search Console (`https://dominio.com/` o `sc-domain:dominio.com`). |
| `crawl.seedUrls` | string[] | Rutas relativas a crawlear con Cloudflare Browser Rendering. |
| `crawl.maxPages` | number | Máximo de páginas a descargar por corrida. |
| `seedKeywords` | string[] | Queries fijas que siempre se muestran en "Consultas objetivo" si tienen datos. |
| `keywords.days` | number | Largo del período (días) para Rendimiento de keywords y su delta vs período anterior. |
| `keywords.brand` | string[] | Términos que clasifican una query como marca (match por substring, case-insensitive). |
| `keywords.non_brand` | string[] | Opcional. Si tiene entradas, restringe "no-marca" a esos términos explícitos. Si está vacío, "no-marca" es todo lo que no matcheó `brand` (default). |

## Origen del config

El config real vive en Flow (`https://flow.jorgejaramillo.com`), no en este
repo. `clients/<slug>/config.json` local solo contiene
`{"config_api_key": "sk_live_..."}`; `node scripts/sync-config.js <slug>`
descarga el config vigente desde Flow y lo cachea en
`clients/<slug>/.flow-cache.json`, que sigue exactamente la estructura
documentada arriba. `_template/config.json` es la excepción — sigue siendo
un `config.json` completo de referencia (sin API key), no un cliente real.
