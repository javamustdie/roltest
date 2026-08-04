/**
 * Datos de las aventuras jugables para el centro de mandos.
 *
 * IMPORTANTE: si cambias localizaciones o ids de narración aquí, corre
 * `node scripts/preparar-app.mjs` — comprueba que siguen cuadrando con los ficheros de
 * escenas de cada aventura y avisa si se han desincronizado.
 */

/** La campaña de verdad. */
const CORVALAR = {
  titulo: "El Diezmo de Corvalar",

  /** Cuenta atrás de la cabecera. `null` en aventuras que no llevan reloj. */
  reloj: {
    etiqueta: "Luna Muerta",
    noches: 3,
    agotado: "Es la Luna Muerta. El Bosque entra en la aldea y no se lleva solo a uno.",
  },

  /** Coordenadas en un lienzo de 100×100 para el mapa de localizaciones. */
  localizaciones: [
    {
      id: "L0",
      nombre: "El camino del sur",
      x: 12, y: 78,
      audio: "l0-entrada",
      voz: "narrador",
      arte: "l0-corvalar",
      pie: "San Bran, desproporcionada para una aldea de doce casas",
      sabeis: [
        "Sela Ramos, once años, ha huido. La Luna Muerta es en tres noches.",
        "Ocho marcas de tiza en la pared de la iglesia. Alguien ha empezado la novena.",
      ],
      conecta: ["L1"],
    },
    {
      id: "L1",
      nombre: "Corvalar",
      x: 26, y: 62,
      audio: "l1-domar",
      voz: "domar",
      arte: "l1-domar",
      pie: "Domar en la herrería",
      sabeis: [
        "Domar quiere que encontréis a Sela antes que los perros.",
        "La anciana Bregit dice que antes no se daban niños.",
        "Tomás, el zagal, no mira a nadie a los ojos.",
      ],
      conecta: ["L0", "L2", "L3", "L4"],
    },
    {
      id: "L2",
      nombre: "Casa de los Ramos",
      x: 13, y: 45,
      audio: "l2-mirena",
      voz: "mirena",
      sabeis: [
        "Dos platos en la mesa y comida para uno.",
        "Barro de turbera en el suelo, y va hacia el vado.",
      ],
      conecta: ["L1"],
    },
    {
      id: "L3",
      nombre: "Iglesia de San Bran",
      x: 33, y: 40,
      audio: "l3-olen",
      voz: "olen",
      arte: "l3-registro",
      pie: "El registro parroquial, doscientos años de diezmos",
      sabeis: [
        "Ocho entradas de diezmo, con nombre, edad y fecha.",
        '"No es esto lo pactado. Lo pactado era la tierra."',
      ],
      conecta: ["L1"],
    },
    {
      id: "L4",
      nombre: "El Vado de las Piedras",
      x: 48, y: 66,
      audio: "l4-vado",
      voz: "narrador",
      arte: "l4-vado",
      pie: "El vado, frontera del Bosque",
      sabeis: [
        "Algo grande y bajo vive entre las piedras.",
        "De noche, quien cruza es visto por el Bosque.",
      ],
      conecta: ["L1", "L5", "L6"],
    },
    {
      id: "L5",
      nombre: "Choza de la Hilandera",
      x: 63, y: 84,
      audio: "l5-vesna",
      voz: "vesna",
      arte: "l5-vesna",
      pie: "Vesna hila con la puerta abierta",
      sabeis: [
        "El pacto se cierra con alguien que se ofrezca libremente.",
        "Vesna fue el diezmo de hace cuarenta años. Y volvió.",
      ],
      conecta: ["L4", "L6"],
    },
    {
      id: "L6",
      nombre: "El Círculo de Abedules",
      x: 72, y: 48,
      audio: "l6-sela",
      voz: "sela",
      arte: "l6-circulo",
      pie: "Ocho montones de piedras, y silencio",
      sabeis: [
        "Sela está escondida bajo unas raíces, a treinta pasos.",
        "Los Encorvados son los ocho diezmos anteriores. No están muertos.",
      ],
      conecta: ["L4", "L5", "L7"],
    },
    {
      id: "L7",
      nombre: "El Corazón",
      x: 89, y: 22,
      audio: "l7-acreedor",
      voz: "acreedor",
      arte: "l7-corazon",
      pie: "El Corazón del Bosque",
      sabeis: [
        "Acepta un niño, un voluntario, o la tierra.",
        "No se le puede matar. Sí se le puede pagar.",
      ],
      conecta: ["L6"],
    },
  ],

  /** Etiquetas de las voces, para mostrar quién habla en cada pieza. */
  voces: {
    narrador: "narrador",
    domar: "Domar, el padre",
    mirena: "Mirena, la madre",
    olen: "Padre Olen",
    vesna: "Vesna, la Hilandera",
    sela: "Sela",
    acreedor: "El Acreedor",
  },

  /** Estado inicial de la partida. */
  partidaInicial: [
    { pj: "Elara", clase: "Exploradora 2", pg: 20, pgMax: 20, ca: 15, heridas: [], agotamiento: 0 },
    { pj: "Bram", clase: "Guerrero 2", pg: 20, pgMax: 20, ca: 17, heridas: [], agotamiento: 0 },
    { pj: "Sor Ivet", clase: "Clériga 2", pg: 17, pgMax: 17, ca: 16, heridas: [], agotamiento: 0 },
    { pj: "Nix", clase: "Pícaro 2", pg: 15, pgMax: 15, ca: 14, heridas: [], agotamiento: 0 },
  ],

  suministrosIniciales: { Antorchas: 8, Raciones: 12, Aceite: 2, Flechas: 40 },

  /** Tabla de heridas persistentes, para marcarlas con un toque. */
  heridas: [
    "Costillas rotas", "Pierna herida", "Brazo herido", "Ojo dañado", "Oído reventado",
    "Hemorragia", "Conmoción", "Mano destrozada", "Cicatriz", "Marca del Bosque",
  ],
};

/**
 * La partida de prueba: 30-45 min para comprobar en mesa que las reglas se aplican bien
 * antes de empezar la campaña. No destripa nada de Corvalar.
 *
 * Comparte reparto de voces con la campaña a propósito (el plan de ElevenLabs solo permite
 * tres voces en la cuenta), así que Nera usa la voz `mirena` y el Ahogado la de `acreedor`.
 */
const PRUEBA = {
  titulo: "Prueba · El Pozo de Sarna",
  esPrueba: true,
  // Sin reloj de noches: es una sesión suelta de 30-45 minutos. Lo que aprieta aquí es la luz.
  reloj: null,

  localizaciones: [
    {
      id: "P1",
      nombre: "La alquería de Sarna",
      x: 22, y: 70,
      audio: "p1-entrada",
      voz: "narrador",
      arte: "p1-alqueria",
      pie: "La alquería, con la puerta abierta",
      sabeis: [
        "La puerta está abierta. Nadie deja una puerta abierta aquí.",
        "La valla del corral se rompió hacia fuera, no hacia dentro.",
        "Queda una hora de luz. Después, antorchas contadas.",
      ],
      conecta: ["P2"],
    },
    {
      id: "P2",
      nombre: "El pozo",
      x: 52, y: 44,
      audio: "p2-ahogado",
      voz: "acreedor",
      arte: "p2-pozo",
      pie: "El brocal, arañado de abajo hacia arriba",
      sabeis: [
        "Las huellas van del corral al pozo. Ninguna vuelve.",
        "Salvación de pavor: Sabiduría CD 13.",
        "El fuego le hace el doble de daño.",
      ],
      conecta: ["P1", "P3"],
    },
    {
      id: "P3",
      nombre: "El desván",
      x: 80, y: 24,
      audio: "p3-nera",
      voz: "mirena",
      arte: "p3-desvan",
      pie: "El desván, y una cuna vacía desde febrero",
      sabeis: [
        "Nera bajó al pozo con su marido y subió sola.",
        "Toma llevaba nueve días apilando piedras en el patio.",
        "Hay cuatro salidas y ninguna es la buena.",
      ],
      conecta: ["P2"],
    },
  ],

  voces: {
    narrador: "narrador",
    acreedor: "El Ahogado",
    mirena: "Nera",
  },

  // Los mismos cuatro pregenerados: la prueba no obliga a hacer fichas nuevas.
  partidaInicial: [
    { pj: "Elara", clase: "Exploradora 2", pg: 20, pgMax: 20, ca: 15, heridas: [], agotamiento: 0 },
    { pj: "Bram", clase: "Guerrero 2", pg: 20, pgMax: 20, ca: 17, heridas: [], agotamiento: 0 },
    { pj: "Sor Ivet", clase: "Clériga 2", pg: 17, pgMax: 17, ca: 16, heridas: [], agotamiento: 0 },
    { pj: "Nix", clase: "Pícaro 2", pg: 15, pgMax: 15, ca: 14, heridas: [], agotamiento: 0 },
  ],

  // Menos suministros que en la campaña, a propósito: así el dial de luz se nota en 40 minutos.
  suministrosIniciales: { Antorchas: 6, Raciones: 4, Aceite: 1, Flechas: 20 },

  heridas: CORVALAR.heridas,
};

/** Todas las aventuras jugables. La clave es lo que se guarda en ajustes. */
export const CAMPANAS = { corvalar: CORVALAR, prueba: PRUEBA };

/** Con cuál se arranca la primera vez. Se juega la prueba antes de la campaña. */
export const CAMPANA_POR_DEFECTO = "prueba";
