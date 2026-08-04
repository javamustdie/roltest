/**
 * Dónde están los ojos y la boca en cada retrato, en fracciones de 0 a 1 del recuadro.
 *
 * Esto se mide A MANO mirando el retrato. No es pereza: no hay detección de caras en el
 * navegador sin cargar un modelo, y un retrato por jugador se mide en un minuto.
 *
 * Sirve para animar la cara DE VERDAD: los párpados se dibujan encima de los ojos y la boca
 * encima de la boca. El intento anterior —una franja oscura bajando por todo el recuadro— movía
 * el marco pero dejaba la cara quieta, y se notaba muchísimo.
 *
 * Y no vale generar fotogramas con la misma semilla y otro prompt: probado, y sale otro
 * personaje —otro pelo, otra pose—, porque la semilla solo mantiene la imagen si el prompt no
 * cambia.
 *
 * Para medir uno nuevo: superponer una rejilla de porcentajes sobre el retrato y leer las
 * coordenadas. Con el encuadre que genera scripts/retrato.mjs, POR_DEFECTO acierta bastante.
 */
const POR_DEFECTO = {
  ojoIzq: [0.425, 0.34],
  ojoDer: [0.600, 0.335],
  boca: [0.490, 0.535],
  ojoRx: 0.052,   // semieje horizontal del ojo
  ojoRy: 0.020,   // semieje vertical
  bocaRx: 0.058,
};

const MEDIDOS = {
  // Medido sobre medios/imagenes/pj-javamustdie.webp con rejilla de porcentajes.
  javamustdie: { ojoIzq: [0.425, 0.34], ojoDer: [0.600, 0.335], boca: [0.490, 0.535] },
};

export const rasgosDe = (id) => ({ ...POR_DEFECTO, ...(MEDIDOS[id] ?? {}) });
