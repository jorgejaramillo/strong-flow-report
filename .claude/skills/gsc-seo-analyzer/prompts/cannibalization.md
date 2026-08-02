# Keyword Cannibalization Check — Guía detallada

## Qué es la canibalización de keywords

Ocurre cuando dos o más páginas del mismo sitio compiten por las mismas queries en Google.
Google no sabe cuál mostrar → muestra la "menos óptima", ambas pierden ranking, el CTR se divide.

**Señales de canibalización:**
- Ranking inestable para una keyword (posición fluctúa mucho)
- Una página esperada no rankea pero sí lo hace otra del mismo sitio
- Múltiples URLs del mismo sitio aparecen en los resultados para la misma query

## Llamada a la API

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[hace 28 días]",
    "endDate": "[ayer]",
    "dimensions": ["query", "page"],
    "rowLimit": 10000
  }
}
```

Nota: Para sitios grandes, 10,000 filas puede no ser suficiente para capturar todas las canibalaciones.
Si el sitio tiene > 1,000 páginas, usa `rowLimit: 25000`.

## Algoritmo de detección

```
1. Agrupar todas las filas por query
2. Para cada query, contar cuántas URLs distintas tienen impresiones >= 50
3. Si count > 1: es una canibalización potencial
4. Ordenar el grupo por clicks DESC para determinar URL ganadora vs canibalizada
```

## Determinación de URL principal

La URL "principal" (canónica para esa query) es la que tiene:
1. **Mayor número de clicks** — métrica más directa de relevancia real
2. En empate: **menor posición promedio** — Google la prefiere más consistentemente
3. En empate: **más impresiones** — mayor visibilidad total

La URL "canibalizada" es cualquier otra URL del grupo.

## Clasificación de severidad

| Severidad | Criterio |
|-----------|---------|
| 🔴 Alta | URL canibalizada tiene > 100 impresiones Y posición < 20 |
| 🟡 Media | URL canibalizada tiene 50-100 impresiones |
| 🟢 Baja | URL canibalizada tiene < 50 impresiones o posición > 30 |

Priorizar la resolución de canibalizaciones 🔴 Alta primero.

## Árbol de decisión para acciones correctivas

```
¿El contenido de las dos URLs es idéntico o muy similar?
  ├── SÍ → Redirigir 301 la URL canibalizada a la principal
  └── NO → ¿La intención de búsqueda es la misma?
              ├── SÍ → Añadir canonical tag en URL canibalizada apuntando a principal
              │         + Reescribir el contenido de la canibalizada para intención diferente
              └── NO → No es canibalización real — las páginas atienden intenciones distintas
                        (Ej: "comprar zapatos rojos" vs "historia de los zapatos rojos")
                        Documentar como "intención compartida, sin acción necesaria"
```

## Casos especiales

### Paginación
`/blog/` y `/blog/page/2/` pueden aparecer para la misma query.
Solución: canonical en todas las páginas paginadas → página 1.

### Variantes de URL
`/producto/` vs `/producto` (con/sin trailing slash) — no es canibalización real, es un problema técnico de canonicales.

### Páginas de categoría vs artículos
`/seo/` (categoría) vs `/seo/guia-completa/` (artículo) pueden compartir queries.
No siempre es un problema — depende de cuál tiene mejor ranking y cuál quieres posicionar.

### Contenido en varios idiomas
`/es/producto/` vs `/en/producto/` — usar hreflang, no canonical.

## Output completo esperado

```markdown
## 🔍 Keyword Cannibalization Check — [siteUrl]
*Período: [startDate] → [endDate]*
*Criterio: queries con >1 URL y ≥50 impresiones por URL*

---

### Resumen
- **Total queries analizadas:** [N]
- **Canibalizaciones detectadas:** [M] queries
  - 🔴 Alta severidad: [X]
  - 🟡 Media severidad: [Y]
  - 🟢 Baja severidad: [Z]

---

### Canibalizaciones — Alta Prioridad 🔴

---
**Query: "keyword importante"**
*(N impresiones totales | M clicks totales)*

| URL | Impresiones | Clicks | Posición | Estado |
|-----|-------------|--------|----------|--------|
| /url-principal | 1,200 | 45 | 8.3 | ✅ PRINCIPAL |
| /url-canibalizada | 380 | 8 | 18.7 | ⚠️ CANIBALIZA |

**Diagnóstico:** El contenido de `/url-canibalizada` solapa con `/url-principal`.
**Acción recomendada:** Añadir `<link rel="canonical" href="/url-principal">` en `/url-canibalizada`.
Si el contenido es prácticamente idéntico: 301 redirect `/url-canibalizada` → `/url-principal`.

---
**Query: "otra keyword"**
...

---

### Canibalizaciones — Media Prioridad 🟡

[misma estructura, más compacta]

---

### Plan de implementación

| Prioridad | Query | URL a modificar | Acción |
|-----------|-------|----------------|--------|
| 1 | "keyword importante" | /url-canibalizada | Canonical → /url-principal |
| 2 | "otra keyword" | /url-b | 301 redirect → /url-a |
| ... | | | |

### Impacto estimado
Resolver las [X] canibalizaciones de alta prioridad podría consolidar ranking
y aumentar clicks en las URLs principales en un [estimado conservador: 15-30%].

---
*Nota: Verifica el contenido de las URLs antes de implementar redirects.
Un 301 es permanente — asegúrate de que la URL de destino esté optimizada primero.*
```
