---
name: gsc-seo-analyzer
description: >
  Análisis SEO accionable usando datos reales de Google Search Console vía MCP.
  Activa este skill cuando el usuario mencione: "Search Console", "GSC", "posiciones en Google",
  "impresiones", "CTR de mis páginas", "quick wins SEO", "canibalización de keywords",
  "reporte mensual de tráfico", "rankings", "páginas indexadas", o pida análisis de rendimiento
  orgánico. Requiere el MCP Server "google-search-console" conectado a Claude.
  Casos de uso: (1) Quick Wins Hunter — páginas en pos. 8-20 con alto volumen,
  (2) CTR Anomaly Detector — impresiones altas con CTR bajo,
  (3) Monthly Report — comparativa MoM de tráfico orgánico,
  (4) Keyword Cannibalization Check — múltiples URLs compitiendo por la misma query.
---

# GSC SEO Analyzer

Analiza datos de Google Search Console para producir insights SEO accionables.
Los datos vienen del MCP tool `google-search-console` — siempre usa datos reales, no asumas nada.

## Setup rápido

Antes de cualquier análisis, verifica que tienes acceso:
1. Llama `list_sites` para ver las propiedades disponibles
2. Confirma la `siteUrl` con el usuario si hay más de una propiedad
3. Usa la `siteUrl` exacta que devuelve la API (incluyendo trailing slash)

**Fechas por defecto:** últimos 28 días desde hoy. Calcula las fechas dinámicamente.

---

## Caso 1: Quick Wins Hunter

**Trigger:** "quick wins", "oportunidades SEO", "posiciones 8-20", "páginas que casi rankean"

**Workflow:**
1. Llama `get_search_analytics` con `dimensions: ["query", "page"]`, últimos 28 días, `rowLimit: 5000`
2. Filtra: `position >= 8 AND position <= 20 AND impressions >= 100`
3. Ordena por `impressions DESC`
4. Calcula potencial estimado de clicks: `impressions × CTR_esperado_pos3` donde CTR pos.3 ≈ 10%
5. Agrupa por page y muestra las top 3 queries por página

**Output:**
```
## 🎯 Quick Wins SEO — [siteUrl]
*Período: [startDate] → [endDate] | Criterio: pos. 8-20, >100 impresiones*

| Página | Query Principal | Pos. Actual | Impresiones | CTR | Potencial Clicks |
|--------|----------------|-------------|-------------|-----|-----------------|
| /ruta  | keyword        | 12.3        | 1,450       | 1.8% | +~127           |

### Acciones recomendadas
- **[URL]** → Optimizar H1 y meta title para "[query]". Actualmente en pos. [X].
```

Ver análisis completo en [prompts/quick-wins.md](prompts/quick-wins.md)

---

## Caso 2: CTR Anomaly Detector

**Trigger:** "CTR bajo", "impresiones pero pocos clicks", "títulos que no convierten", "meta descriptions"

**Workflow:**
1. Llama `get_search_analytics` con `dimensions: ["page"]`, últimos 28 días, `rowLimit: 2000`
2. Filtra: `impressions >= 500 AND ctr < 2`
3. Para las top 10 páginas, llama de nuevo con `dimensions: ["query", "page"]` para obtener sus queries principales
4. Genera título y meta description alternativa para cada URL

**Output:**
```
## 📉 Páginas con CTR Anómalo — [siteUrl]

| Página | Impresiones | CTR Actual | Query Principal | Pos. Media |
|--------|-------------|------------|----------------|------------|

### ✍️ Propuestas de mejora
**[/ruta]** — Query: "keyword"
- **Título sugerido:** [keyword] + beneficio | Marca
- **Meta description sugerida:** CTA claro con "keyword" en <160 caracteres.
```

Ver criterios completos en [prompts/ctr-analyzer.md](prompts/ctr-analyzer.md)

---

## Caso 3: Monthly Report

**Trigger:** "reporte mensual", "comparar con el mes pasado", "MoM", "variación de tráfico"

**Workflow:**
1. Llama `get_search_analytics` dos veces con `dimensions: ["page"]`, `rowLimit: 5000`:
   - Período actual: últimos 28 días
   - Período anterior: los 28 días inmediatamente anteriores
2. Join por `page`, calcula variaciones absolutas y porcentuales
3. Top 5 gainers y top 5 losers por clicks

**Output:**
```
## 📊 Reporte Mensual — [siteUrl] | [período actual] vs [período anterior]

| Métrica      | Actual  | Anterior | Variación |
|--------------|---------|----------|-----------|
| Clicks       | 12,450  | 10,890   | +14.3% ↑  |
| Impresiones  | 280,000 | 265,000  | +5.7% ↑   |
| CTR medio    | 4.4%    | 4.1%     | +0.3pp ↑  |
| Posición med.| 18.2    | 19.5     | -1.3 ↑    |

### Top 5 Gainers / Top 5 Losers
[tabla]

### Conclusiones
[3-4 bullet points con análisis y próximos pasos]
```

Ver metodología en [prompts/monthly-report.md](prompts/monthly-report.md)

---

## Caso 4: Keyword Cannibalization Check

**Trigger:** "canibalización", "dos páginas compitiendo", "cuál URL es la principal para X keyword"

**Workflow:**
1. Llama `get_search_analytics` con `dimensions: ["query", "page"]`, últimos 28 días, `rowLimit: 10000`
2. Agrupa por `query`, filtra: >1 URL con `impressions >= 50`
3. URL "ganadora" = mayor clicks × menor posición; URL "canibalizada" = el resto

**Output:**
```
## 🔍 Mapa de Canibalización — [siteUrl]

**Query: "keyword principal"**
| URL | Impresiones | Clicks | Posición |
| /url-a ✅ PRINCIPAL | 1,200 | 45 | 8.3 |
| /url-b ⚠️ CANIBALIZA | 340  | 8  | 18.7 |

**Acción:** canonical en /url-b → /url-a | O: 301 redirect | O: diferenciar intención
```

Ver lógica completa en [prompts/cannibalization.md](prompts/cannibalization.md)

---

## Reglas generales

- **Posición promedio:** <10 = pág.1, 10-20 = pág.2, >20 = invisible
- **CTR de referencia:** pos.1 ≈ 28%, pos.3 ≈ 10%, pos.5 ≈ 6%, pos.10 ≈ 2.5%
- **Latencia GSC:** los datos tienen 2-3 días de retraso — menciónalo si el usuario pregunta por datos muy recientes
- **rowLimit máximo:** 25,000 — para sitios grandes usa filtros dimensionales adicionales
- **No asumas contenido de páginas** — basa las recomendaciones en los datos de GSC, no en suposiciones
