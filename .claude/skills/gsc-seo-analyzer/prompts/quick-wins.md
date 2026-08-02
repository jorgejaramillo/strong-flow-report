# Quick Wins Hunter — Guía detallada

## Qué es un Quick Win en SEO

Una página en posición 8-20 ya tiene relevancia temática para Google — el algoritmo "quiere" mostrarla.
El objetivo es pequeñas mejoras on-page que empujen la URL a la primera página (posiciones 1-10),
donde el CTR se multiplica entre 3x y 10x.

## Llamada a la API

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[hace 28 días]",
    "endDate": "[ayer]",
    "dimensions": ["query", "page"],
    "rowLimit": 5000
  }
}
```

## Filtros de selección

| Criterio | Valor | Razón |
|----------|-------|-------|
| Posición mínima | 8 | Debajo de pos. 8 ya hay algo de visibilidad |
| Posición máxima | 20 | Más allá de pos. 20 requiere trabajo más profundo |
| Impresiones mínimas | 100 | Valida que hay volumen de búsqueda real |

Para sitios pequeños (< 5k visitas/mes), bajar impresiones mínimas a 30.

## Cálculo de potencial

```
CTR esperado en pos. 3 = 10%
Potencial de clicks = impresiones × 0.10
Ganancia estimada = potencial - clicks_actuales
```

Nota: Es un estimado conservador. El CTR real varía por tipo de query (branded vs non-branded).

## Priorización

Ordena las oportunidades usando este score compuesto:

```
Score = impressions × (1 / position) × (1 - ctr/100)
```

Mayor score = mayor prioridad. Esto da más peso a queries con mucho volumen y baja posición.

## Agrupación por página

Cuando una página aparece en múltiples queries dentro del rango 8-20:
- Muestra la query con más impresiones como "Query Principal"
- Lista las queries secundarias como "También rankea para: X, Y, Z"
- La acción de optimización debe apuntar a la query principal pero sin ignorar las secundarias

## Tipos de acciones recomendadas por posición

| Posición | Acción prioritaria |
|----------|-------------------|
| 8-12 | Optimizar meta title y H1 para incluir la query exact-match o near-match |
| 12-16 | Mejorar el contenido (añadir sección específica para la query) + internal links |
| 16-20 | Revisar si la intención de búsqueda coincide con el contenido; considera link building |

## Señales de alerta

- Si una página tiene posición < 12 pero CTR < 1%: el problema no es el ranking sino el snippet → priorizar CTR Anomaly Detector
- Si las mismas queries aparecen en múltiples URLs: posible canibalización → usar Cannibalization Check
- Si todas las oportunidades tienen CTR = 0%: los datos pueden estar filtrados o hay un problema de tracking

## Output completo esperado

```markdown
## 🎯 Quick Wins SEO — [siteUrl]
*Período: [startDate] → [endDate]*
*Criterio: posición 8-20 | impresiones ≥ 100 | ordenado por score de oportunidad*

---

### Top Oportunidades

| # | Página | Query Principal | Pos. | Impresiones | CTR | Potencial Clicks |
|---|--------|----------------|------|-------------|-----|-----------------|
| 1 | /blog/post-x | "keyword larga" | 9.2 | 2,340 | 2.1% | +~187 |
| 2 | /servicios/y | "servicio específico" | 14.5 | 890 | 0.9% | +~81 |
| ... | ... | ... | ... | ... | ... | ... |

---

### Plan de acción

**1. /blog/post-x** (Prioridad: Alta)
- Query objetivo: "keyword larga"
- Posición actual: 9.2 → Objetivo: top 5
- Acción: Incluir "keyword larga" en el H1 actual si no está. Añadir una sección específica que responda directamente la query.
- También rankea para: "variante 1", "variante 2"

**2. /servicios/y** (Prioridad: Media)
- Query objetivo: "servicio específico"
- Posición actual: 14.5 → Objetivo: top 10
- Acción: Revisar que la intención transaccional de la query se refleja en el copy. Añadir CTA visible above the fold.

---

*Total analizado: N queries | Quick wins identificados: M páginas*
*Potencial de clicks adicionales si todas alcanzan top 5: ~[suma] clicks/28 días*
```
