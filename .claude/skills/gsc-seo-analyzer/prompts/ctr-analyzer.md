# CTR Anomaly Detector — Guía detallada

## Por qué el CTR importa

Una página puede rankear en posición 5 y tener un CTR de 0.5% cuando el benchmark es 6%.
Eso significa que Google muestra la página, pero el usuario elige otro resultado.
El problema suele ser: título poco atractivo, meta description genérica, o mismatch con la intención.

## CTR de referencia por posición

| Posición | CTR Benchmark (desktop+mobile) |
|----------|-------------------------------|
| 1 | ~28% |
| 2 | ~15% |
| 3 | ~10% |
| 4 | ~7% |
| 5 | ~6% |
| 6-7 | ~4% |
| 8-10 | ~2.5% |
| 11-20 | ~1% |

Si el CTR de una página es < 50% del benchmark de su posición, es una anomalía.

## Llamadas a la API

### Paso 1: Identificar páginas problemáticas

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[hace 28 días]",
    "endDate": "[ayer]",
    "dimensions": ["page"],
    "rowLimit": 2000
  }
}
```

**Filtro:** `impressions >= 500 AND ctr < 0.02` (CTR < 2%)

Para sitios pequeños, bajar umbral a `impressions >= 100`.

### Paso 2: Obtener queries principales de esas URLs

Para las top 10-15 URLs problemáticas, hacer una segunda llamada:

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

Filtrar por las URLs problemáticas para obtener sus queries principales (ordenar por impresiones DESC).

## Diagnóstico por tipo de problema

### Problema 1: Título no contiene la keyword
- Señal: query con muchas impresiones, título de la página no incluye la keyword
- Solución: incluir la keyword al inicio del meta title

### Problema 2: Meta description genérica o ausente
- Señal: Google auto-genera el snippet a partir del cuerpo del texto (se ve truncado o irrelevante)
- Solución: escribir meta description específica con CTA y la keyword principal

### Problema 3: Mismatch de intención
- Señal: queries informacionales llegan a páginas transaccionales (o viceversa)
- Solución: crear contenido que satisfaga la intención, o ajustar el targeting de la página

### Problema 4: Competencia con rich snippets
- Señal: CTR bajo pero posición buena, en queries donde Google muestra featured snippets/PAA
- Solución: optimizar para el featured snippet (respuesta directa en 40-60 palabras en la página)

## Generación de títulos y meta descriptions

Al generar sugerencias, sigue estas reglas:

**Títulos (meta title):**
- Máximo 60 caracteres
- Keyword principal al inicio o cerca del inicio
- Incluir un diferenciador (número, año, beneficio)
- Formato: `[Keyword Principal] — [Beneficio o Diferenciador] | [Marca]`

**Meta descriptions:**
- Máximo 160 caracteres
- Incluir la keyword principal de forma natural
- CTA explícito: "Descubre", "Aprende", "Compara", "Obtén"
- No repetir el título — ampliar con información complementaria

## Output completo esperado

```markdown
## 📉 CTR Anomaly Detector — [siteUrl]
*Período: [startDate] → [endDate]*
*Criterio: impresiones ≥ 500 | CTR < 2%*

---

### Páginas con CTR anómalo: [N encontradas]

| Página | Impresiones | CTR Actual | Posición Media | Benchmark CTR | Gap |
|--------|-------------|------------|----------------|---------------|-----|
| /blog/post | 3,200 | 0.8% | 6.2 | 4% | -3.2pp |
| /servicios | 1,800 | 1.1% | 9.5 | 2.5% | -1.4pp |

---

### Propuestas de mejora

---
**[/blog/post]**
Query principal: "keyword importante" (1,450 impresiones)
Posición: 6.2 | CTR actual: 0.8% | Esperado: ~4%

**Diagnóstico:** Título no incluye la keyword. Meta description genérica.

**Título actual sugerido:**
> [Keyword Importante]: Guía Completa 2024 | Marca

**Meta description sugerida:**
> Aprende todo sobre [keyword importante] en esta guía actualizada. Casos prácticos, ejemplos y los mejores consejos para [beneficio específico]. ← 158 caracteres

---

**[/servicios]**
Query principal: "servicio x precio" (890 impresiones)
Posición: 9.5 | CTR actual: 1.1% | Esperado: ~2.5%

**Diagnóstico:** Mismatch de intención — query transaccional llega a página informacional.

**Título sugerido:**
> [Servicio X] — Ver Precios y Planes | Marca

**Meta description sugerida:**
> Consulta los precios actualizados de [Servicio X]. Planes desde [precio], sin permanencia. Solicita presupuesto en 2 minutos. ← 132 caracteres

---

### Resumen de impacto potencial

Si las páginas detectadas alcanzan el benchmark de CTR de su posición:
- Clicks adicionales estimados: +[N] clicks/28 días
- Sin necesidad de mejorar rankings — solo optimizar snippets

*Nota: Los títulos sugeridos son propuestas basadas en las queries detectadas.
Ajusta al tono y estilo de la marca antes de implementar.*
```
