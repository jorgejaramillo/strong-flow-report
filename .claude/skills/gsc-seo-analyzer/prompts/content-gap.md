# Content Gap Analysis — Reporte de 4 Pasos

Analiza qué consultas de búsqueda traen tráfico a una página específica pero **no aparecen en el contenido HTML** de esa página. El resultado es una lista de términos que deberían estar en la página para mejorar la relevancia y el CTR.

---

## Trigger

"analiza el contenido de [url]", "qué keywords faltan en la página", "content gap", "qué debería agregar a esta página", "optimizar contenido según GSC".

---

## Workflow completo

### Paso 1 — Scraping de la URL

```bash
node scrapping/scripts/page-gap-analysis.js <url>
```

El script:
- Llama a ScraperAPI y guarda el HTML en `scrapping/tmp/`
- Extrae: title, meta description, H1/H2/H3, párrafos, texto del body
- Genera `wordSet` (palabras únicas normalizadas) y `phrases` (bigramas/trigramas)
- Devuelve JSON con el contenido de la página

Guarda el `wordSet` y el `bodyText` para el paso 4.

---

### Paso 2 — Queries GSC de esa página específica

Llama al MCP con `pageUrl` para filtrar solo las queries que traen tráfico a **esa URL**:

```
get_search_analytics(
  siteUrl: <propiedad GSC>,
  startDate: <hoy - 90 días>,
  endDate: <hoy - 3 días>,  // latencia GSC
  dimensions: ["query"],
  pageUrl: <url exacta de la página>,
  rowLimit: 500
)
```

> **Importante:** `pageUrl` debe ser la URL exacta tal como aparece en GSC (con o sin trailing slash, con el protocolo correcto). Si no devuelve resultados, prueba con la variante http/https o con/sin www.

---

### Paso 3 — Identificar queries con tráfico real

Del resultado GSC, filtra:
- `clicks >= 1` OR `impressions >= 50`
- Ordena por `clicks DESC, impressions DESC`

Estas son las queries que Google ya asocia con la página.

---

### Paso 4 — Gap analysis y recomendaciones

Para cada query del paso 3, verifica si sus términos aparecen en el `wordSet` y `phrases` del paso 1:

**AUSENTE (gap):** La query o sus términos clave no están en el HTML → **oportunidad de contenido**
**PRESENTE:** Los términos ya están → el problema puede ser de snippet (title/meta), no de contenido

#### Clasificación de prioridad

| Prioridad | Criterio |
|-----------|----------|
| 🔴 ALTA   | impressions > 500, clicks > 10, query AUSENTE del HTML |
| 🟡 MEDIA  | impressions > 100, clicks > 0, query AUSENTE del HTML  |
| 🟢 BAJA   | query presente, pero CTR < 2% (problema de snippet) |

---

## Output esperado

```markdown
## Content Gap Analysis — [URL analizada]
*Período GSC: [fechas] | Scraping: [fecha]*

### Métricas de la página
- Title: "..."
- H1: "..."
- Palabras únicas en página: N
- Total queries GSC analizadas: N

---

### Queries AUSENTES del contenido (gaps de contenido)

| Query | Impressions | Clicks | CTR | Posición | Acción |
|-------|-------------|--------|-----|----------|--------|
| "keyword gap 1" | 1,200 | 45 | 3.7% | 8.2 | Agregar sección/párrafo |
| "keyword gap 2" | 890  | 12 | 1.3% | 12.4 | Mencionar en H2 o párrafo |

### Queries PRESENTES pero con CTR bajo (gaps de snippet)

| Query | Impressions | CTR | Posición | Acción |
|-------|-------------|-----|----------|--------|
| "keyword snippet" | 2,000 | 0.8% | 3.1 | Mejorar title/meta description |

---

### Textos recomendados para agregar a la página

Basándote en las queries ausentes de mayor volumen, redacta:

1. **H2 sugerido:** "[query principal como heading]"
   - Párrafo de 2-3 oraciones que responde la intención de búsqueda

2. **Sección FAQ:**
   - Pregunta: "[query como pregunta]"
   - Respuesta: [respuesta concisa con la keyword integrada naturalmente]

3. **Actualización del Title tag:**
   - Actual: "..."
   - Sugerido: "[keyword principal] | [diferenciador] | Marca"

4. **Meta description sugerida:**
   "[keyword] + beneficio clave + CTA en menos de 155 caracteres"
```

---

## Reglas del análisis

- **No inventar datos:** todas las queries deben venir del MCP, no de suposiciones
- **Intención de búsqueda primero:** antes de recomendar un texto, identifica si la query es informacional, transaccional o navegacional
- **Densidad natural:** las keywords sugeridas deben integrarse con fluidez, no como relleno
- **Priorizar por impacto:** ordena las recomendaciones por volumen de impressions × (1 - CTR actual)
- **Si el HTML es SPA/React:** puede que ScraperAPI no renderice el JavaScript. En ese caso, usar `render: true` en ScraperAPI o indicar la limitación al usuario
