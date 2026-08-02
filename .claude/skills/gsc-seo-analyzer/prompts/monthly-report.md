# Monthly Report — Guía detallada

## Objetivo

Comparar el rendimiento orgánico de los últimos 28 días vs los 28 días anteriores.
El reporte debe ser ejecutivo: números claros, variaciones destacadas, y conclusiones accionables.
Evita tablas interminables — prioriza los cambios más significativos.

## Cálculo de períodos

```
Hoy = fecha actual
Período actual: (hoy - 28 días) → (hoy - 2 días)  [ayer tiene datos incompletos]
Período anterior: (hoy - 56 días) → (hoy - 29 días)
```

Ejemplo con hoy = 2024-02-15:
- Actual: 2024-01-18 → 2024-02-13
- Anterior: 2023-12-21 → 2024-01-17

## Llamadas a la API

### Llamada 1: Período actual (por página)

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[hace 28 días]",
    "endDate": "[hace 2 días]",
    "dimensions": ["page"],
    "rowLimit": 5000
  }
}
```

### Llamada 2: Período anterior (por página)

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[hace 56 días]",
    "endDate": "[hace 29 días]",
    "dimensions": ["page"],
    "rowLimit": 5000
  }
}
```

### Llamada 3: Totales del sitio (sin dimensión page)

Para el resumen ejecutivo, hacer una tercera llamada sin dimensión page para obtener los totales globales:

```json
{
  "tool": "get_search_analytics",
  "params": {
    "siteUrl": "[siteUrl]",
    "startDate": "[fecha]",
    "endDate": "[fecha]",
    "dimensions": ["date"],
    "rowLimit": 60
  }
}
```

Suma los valores de cada período para obtener totales comparables.

## Metodología de análisis

### Join entre períodos

```
Para cada page en período_actual:
  buscar en período_anterior por el mismo page
  si existe: calcular delta = actual - anterior
  si no existe: es página nueva (marcar como "nueva" con delta = 100%)

Para cada page en período_anterior que NO está en actual:
  marcar como "desaparecida" (delta = -100%)
```

### Cálculo de variaciones

```
variacion_pct = ((valor_actual - valor_anterior) / valor_anterior) × 100
delta_absoluto = valor_actual - valor_anterior
```

Para posición: un número MENOR es MEJOR. Invertir la lógica de "mejora/empeora".

### Top Gainers

Ordenar por `delta_clicks DESC`, tomar top 5.
Excluir páginas con < 50 clicks en el período actual (evita ruido estadístico).

### Top Losers

Ordenar por `delta_clicks ASC`, tomar top 5 (los más negativos).
Excluir páginas con < 20 clicks en ambos períodos.

## Interpretación de resultados

| Escenario | Posible causa |
|-----------|--------------|
| Clicks ↑, Impresiones ↑ | Crecimiento real — más páginas indexadas o mejor ranking |
| Clicks ↑, Impresiones → | Mejora de CTR — snippets más atractivos |
| Clicks →, Impresiones ↑ | Pérdida de CTR — nuevas páginas con ranking bajo |
| Clicks ↓, Impresiones ↓ | Pérdida de visibilidad — posibles penalizaciones o desindexación |
| Clicks ↓, Impresiones → | Bajada de CTR — competidores o cambios en SERP |
| Posición mejora, Clicks ↓ | Estacionalidad o cambios en intención de búsqueda |

## Alertas automáticas a mencionar

- Si clicks totales caen > 20%: mencionar posible Google Update, revisar Google Search Status
- Si posición media sube > 3 puntos (empeora): posible pérdida de autoridad o contenido penalizado
- Si hay páginas con pérdida de clicks > 50%: investigar con `inspect_url`
- Si top losers son todas del mismo directorio: problema estructural en esa sección

## Output completo esperado

```markdown
## 📊 Reporte Mensual de Tráfico Orgánico
**[siteUrl]**
*Período actual: [startDate1] → [endDate1]*
*Período anterior: [startDate2] → [endDate2]*

---

### Resumen Ejecutivo

| Métrica | Período Actual | Período Anterior | Variación |
|---------|---------------|-----------------|-----------|
| Clicks totales | 12,450 | 10,890 | **+1,560 (+14.3%)** ↑ |
| Impresiones | 280,000 | 265,000 | **+15,000 (+5.7%)** ↑ |
| CTR promedio | 4.4% | 4.1% | **+0.3pp** ↑ |
| Posición media | 18.2 | 19.5 | **-1.3** ↑ (mejor) |

**Páginas activas:** [N] vs [M] período anterior

---

### 🏆 Top 5 Gainers (páginas que más crecieron)

| Página | Clicks Antes | Clicks Ahora | Variación |
|--------|-------------|-------------|-----------|
| /blog/post-exitoso | 320 | 890 | **+570 (+178%)** |
| /categoría/x | 450 | 780 | **+330 (+73%)** |
| ... | | | |

### 📉 Top 5 Losers (páginas que más cayeron)

| Página | Clicks Antes | Clicks Ahora | Variación |
|--------|-------------|-------------|-----------|
| /blog/post-caído | 680 | 210 | **-470 (-69%)** |
| /producto/y | 340 | 120 | **-220 (-65%)** |
| ... | | | |

---

### Páginas nuevas este período
[Lista de URLs que no existían en el período anterior]

### Páginas desaparecidas
[Lista de URLs que tenían tráfico antes y ahora no aparecen]

---

### Conclusiones y Próximos Pasos

1. **[Insight principal]**: [explicación basada en los datos]
2. **[Acción prioritaria]**: Investigar la caída de [/blog/post-caído] — ha perdido -69% de clicks en 28 días. Usar `inspect_url` para verificar indexación.
3. **[Oportunidad]**: [/blog/post-exitoso] está creciendo fuertemente — considera crear contenido relacionado para capturar más tráfico en este tema.
4. **Tendencia general**: [evaluación positiva/negativa/neutral con contexto]

---
*Generado con datos de Google Search Console | Latencia de datos: ~2-3 días*
```
