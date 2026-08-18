---
name: cliente-nuevo
description: >
  Da de alta un cliente nuevo en el repo local: valida la API key de Flow,
  sincroniza el config real, valida site.active y verifica que gsc.siteUrl
  sea una propiedad real en Search Console. Usar cuando el usuario pida
  "instala el cliente <slug>", "da de alta <cliente>", "agrega el cliente
  nuevo <slug>", "onboarding de <cliente>", o equivalentes. Asume que el
  site ya existe en Flow (flow.jorgejaramillo.com) y que el usuario ya
  generó su API key — si no, pedísela primero.
---

# Cliente nuevo — alta local

Cubre los pasos 2-4 de "Agregar un cliente nuevo" en
[README.md](../../../README.md) — el paso 1 (crear el site en Flow, con
`clients/_template/config.json` como referencia de estructura) es manual y
externo, se asume ya hecho cuando se invoca este skill. El paso 5 (generar
el primer reporte) es el skill `flow`, aparte — **no lo corras
automáticamente**, tiene costo real (DataForSEO, ValueSERP, Cloudflare
Browser Rendering): preguntale al usuario primero.

## 1. API key local

Si `clients/<slug>/config.json` no existe o no tiene `config_api_key`,
pedile al usuario que lo cree con:
```json
{"config_api_key": "sk_live_..."}
```
(la key sale del tab "API Keys" → "+ Generate key" en el site dentro de
Flow — se muestra una sola vez). No se puede continuar sin esto.

## 2. Sincronizar el config real

```bash
node scripts/sync-config.js <slug>
```

- Si falla (401 = key inválida/revocada, u otro error): **detente y
  avisa** al usuario — no sigas con datos viejos ni reintentes con otra key
  sin preguntar.
- Si funciona, queda `clients/<slug>/.flow-cache.json` con el config real.
  La estructura completa y las reglas de cada campo están en
  [CONFIG_SPEC.md](../../../CONFIG_SPEC.md) — es la fuente de verdad, no
  se inventan campos fuera de ahí.

## 3. Validar `site.active` (regla dura)

Leé `clients/<slug>/.flow-cache.json` → `data.site.active`. Si es
`false`: **detente y avisa** al usuario, no sigas con nada más de este
skill ni con `flow`. No es una sugerencia — ver CONFIG_SPEC.md.

## 4. Verificar `gsc.siteUrl` contra Search Console

`gsc.siteUrl` tiene que coincidir EXACTO con una propiedad verificada
(`https://dominio.com/` o `sc-domain:dominio.com`) — un typo silencioso acá
no rompe nada visible, simplemente GSC devuelve cero filas y el reporte
sale vacío. Correr:

```bash
node scripts/verify-gsc-site.js <slug>
```

Si dice "NO ENCONTRADA": reportáselo al usuario junto con las propiedades
similares que el script sugiere (mismo dominio, distinta variante) — no
asumas cuál es la correcta ni la corrijas vos solo, preguntá.

## 5. Confirmar datos mínimos poblados

Revisá en `.flow-cache.json` (repórtalo si falta algo, no inventes
valores):
- `crawl.seedUrls` — al menos `"/"`.
- `seedKeywords` — sin esto la tabla "Volumen de búsqueda" sale vacía.
- `keywords.brand` — sin esto las secciones brand/no-brand no separan nada.
- `site.country` mapeado en `LOCATION_NAMES` y `COUNTRY_CODES` dentro de
  `scripts/sections/keyword-volume.js`. Si el país del cliente no está en
  esos dos mapas (alpha-3 → nombre completo / alpha-2), agregalo vos mismo
  antes de intentar correr `keywordVolume` — son dos líneas, mirá los
  países ya soportados como ejemplo.

## 6. Reportar y preguntar por el siguiente paso

Resumí al usuario: key válida, `site.active`, resultado de
`verify-gsc-site.js`, y qué datos mínimos faltan (si falta alguno).
Preguntale si querés correr el primer reporte ahora (skill `flow`,
`node scripts/run-flow.js <slug>`) o dejarlo para después — no lo corras
sin confirmar, tiene costo.
