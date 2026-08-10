// Config de Unlighthouse para el paso "pagespeed" (ver pagespeed.js).
// unlighthouse-ci no expone `puppeteerClusterOptions` por flag de CLI, así
// que este archivo se pasa con --config-file para forzar una sola URL a la
// vez (una instancia de Chrome/Lighthouse en vez de varias en paralelo) —
// lo más liviano en CPU/RAM posible para este uso puntual.
export default {
  puppeteerClusterOptions: {
    maxConcurrency: 1,
  },
};
