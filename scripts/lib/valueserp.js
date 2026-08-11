/**
 * Cliente mínimo para la API REST de ValueSERP (https://www.valueserp.com/docs),
 * usado por los scripts de scripts/sections/ para traer resultados de
 * búsqueda de Google (SERP) sin pasar por scraping propio.
 */
import { loadEnv } from './env.js';

const BASE_URL = 'https://api.valueserp.com/search';

function apiKey() {
  loadEnv();
  const { VALUESERP_API_KEY } = process.env;
  if (!VALUESERP_API_KEY) {
    throw new Error('Falta VALUESERP_API_KEY en .env');
  }
  return VALUESERP_API_KEY;
}

/**
 * Llama /search y devuelve el JSON crudo de ValueSERP para una query.
 *
 * Ejemplo de configuración:
 *   valueSerpSearch({
 *     query: 'apartamentos sobre planos en bello',
 *     location: 'Medellin,Antioquia,Colombia',
 *     googleDomain: 'google.com.co',
 *     countryCode: 'co',
 *     languageCode: 'es',
 *     num: 100,
 *   });
 */
export async function valueSerpSearch({ query, location, googleDomain = 'google.com', countryCode, languageCode, num = 100 }) {
  const params = new URLSearchParams({
    api_key: apiKey(),
    q: query,
    location,
    google_domain: googleDomain,
    gl: countryCode,
    hl: languageCode,
    num: String(num),
    output: 'json',
  });
  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  const json = await res.json();
  if (!res.ok || json.request_info?.success === false) {
    throw new Error(`ValueSERP error: ${json.request_info?.message || res.status}`);
  }
  return json;
}
