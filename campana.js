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

  /**
   * Coordenadas en un lienzo de 100×100 para el mapa de localizaciones.
   *
   * `ambiente` es la música de fondo que suena al llegar: la pone la app sola para que el DJ no
   * tenga que acordarse en cada movimiento, y él puede cambiarla con la herramienta `ambiente`
   * cuando la escena cambie de tono (una pelea, una muerte).
   */
  localizaciones: [
    {
      id: "L0",
      ambiente: "tension",
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
      ambiente: "calma",
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
      ambiente: "tension",
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
      ambiente: "tension",
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
      ambiente: "tension",
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
      ambiente: "calma",
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
      ambiente: "horror",
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
      ambiente: "horror",
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

  /**
   * Relojes de tensión previstos. No se crean solos: los pone el DJ con `crear_reloj` cuando la
   * ficción los pide. Están escritos aquí para que llame a las cosas por su nombre y no invente
   * tres relojes distintos para la misma presión en tres sesiones seguidas.
   *
   * Ojo: esto NO es el `reloj` de arriba. Aquél es la cuenta atrás de las tres noches hasta la
   * Luna Muerta y corre sola; estos se llenan por lo que la mesa hace o deja de hacer.
   */
  relojesSugeridos: [
    {
      titulo: "El rito de Corvalar",
      segmentos: 8,
      quePasa:
        "Los ancianos dejan de esperaros. Salen ellos a por Sela, con perros y con antorchas, y " +
        "la novena piedra se pone con vosotros o sin vosotros.",
    },
    {
      titulo: "La aldea sospecha de vosotros",
      segmentos: 6,
      quePasa:
        "Corvalar deja de hablaros. Se cierran las puertas, se acaba el pan que os vendían y " +
        "alguien registra vuestras cosas mientras dormís.",
    },
    {
      titulo: "La niebla os alcanza",
      segmentos: 4,
      quePasa:
        "El Bosque llega a las casas. El vado amanece seco, el ganado de un corral aparece " +
        "muerto y lo que vive entre los abedules ya está de este lado.",
    },
  ],

  /**
   * Los secretos: información DESLIGADA del sitio donde se encuentra. El DJ suelta el que cuadre
   * cuando la mesa se gana saber algo, en vez de esconderlo detrás de una tirada concreta. Es lo
   * que evita el atasco de «no registraron el cadáver y la trama no avanza».
   *
   * Los `id` llevan prefijo `s-` para no chocar con los ids de audio y de arte de las escenas:
   * `scripts/pregenerar.mjs` aborta el lote entero si dos aventuras repiten un id.
   *
   * `peso` es lo único que ordena la lista: los `mayor` son la cadena que lleva al final 4 y no
   * se sueltan en la primera escena. `bandera` es la clave de `campana/estado.json` → `banderas`
   * que hay que marcar al revelarlo, para que soltar el secreto y apuntar el avance sean el
   * mismo gesto. La versión en prosa, para leerla de un vistazo, está en
   * `campana/aventura/escenas.md` → «Secretos y pistas», y los ids cuadran uno a uno.
   */
  secretos: [
    {
      id: "s-tiza",
      peso: "menor",
      bandera: null,
      texto:
        "En el muro de la iglesia hay ocho marcas de tiza a la altura de un hombre, y una novena " +
        "empezada. Nadie en Corvalar sabe decir quién las hace, y ninguno pregunta.",
    },
    {
      id: "s-silencio",
      peso: "menor",
      bandera: null,
      texto:
        "Nadie en la aldea os ha mentido todavía: os han contestado a otra cosa. Saben qué " +
        "noche es, saben de quién es la hija y llevan ocho generaciones sabiendo lo que se hace " +
        "con ella.",
    },
    {
      id: "s-bregit",
      peso: "mayor",
      bandera: "conoce_clausula_tierra",
      texto:
        "La anciana Bregit recuerda, de boca de su abuela, que antes no se daban niños. Dice que " +
        "los niños los empezaron ellos porque salía más barato.",
    },
    {
      id: "s-tomas",
      peso: "menor",
      bandera: "sabe_donde_esta_sela",
      texto:
        "Tomás, el zagal, vio por dónde se fue Sela y no se lo ha dicho a nadie. Desde esa noche " +
        "no le mira a los ojos a ningún adulto de la aldea.",
    },
    {
      id: "s-dos-platos",
      peso: "menor",
      bandera: "gano_confianza_de_mirena",
      texto:
        "En casa de los Ramos hay dos platos puestos y comida para uno. Mirena lleva tres días " +
        "sacando raciones para alguien que no duerme bajo su techo.",
    },
    {
      id: "s-escondite",
      peso: "menor",
      bandera: "sabe_donde_esta_sela",
      texto:
        "Mirena escondió a su hija cerca del Círculo de Abedules. Es el peor sitio del mundo " +
        "para esconderla, y ella no lo sabe.",
    },
    {
      id: "s-sela-habla",
      peso: "menor",
      bandera: "encontro_a_sela",
      texto:
        "Sela dice que el Bosque le habla desde la primera noche, que no grita, que si va ella " +
        "ya está y que si no va ella van a ir más. No está mintiendo.",
    },
    {
      id: "s-domar-delato",
      peso: "menor",
      bandera: "sabe_que_domar_delato",
      texto:
        "Domar no solo aceptó el diezmo: fue él quien avisó a los ancianos de que su hija había " +
        "huido. Lo hizo, lo sabe, y os sigue pidiendo que la encontréis.",
    },
    {
      id: "s-registro",
      peso: "menor",
      bandera: "leyo_registro_iglesia",
      texto:
        "El libro de San Bran tiene doscientos años y la letra de nueve curas distintos. Dentro " +
        "hay ocho entradas de diezmo con nombre, edad y fecha, y tres de las ocho las escribió " +
        "el Padre Olen de su puño.",
    },
    {
      id: "s-margen",
      peso: "mayor",
      bandera: "conoce_clausula_tierra",
      texto:
        "Al margen de la primera entrada, con letra más antigua y más apretada que el asiento: " +
        "«No es esto lo pactado. Lo pactado era la tierra. Que Dios nos perdone la rebaja.»",
    },
    {
      id: "s-vado-seco",
      peso: "menor",
      bandera: null,
      texto:
        "El vado se seca antes de cada Luna Muerta. Cuando amanezca seco y cubierto de moscas no " +
        "es sequía: es que el Bosque está más cerca de las casas que ayer.",
    },
    {
      id: "s-perro-pago",
      peso: "menor",
      bandera: "pago_al_perro_de_turba",
      texto:
        "Lo que guarda el vado no persigue fuera del agua, y se le puede pagar. Deja pasar a " +
        "quien le da carne, y se acuerda de quién se la dio.",
    },
    {
      id: "s-visto",
      peso: "menor",
      bandera: "cruzo_vado_de_noche",
      texto:
        "Quien cruza el vado de noche es visto, y el Bosque no vuelve a olvidarlo. A partir de " +
        "ahí, lo que vive entre los abedules le llama por su nombre.",
    },
    {
      id: "s-recibos",
      peso: "menor",
      bandera: null,
      texto:
        "Los ocho montones de piedras del Círculo no son tumbas: son recibos. Los ocho diezmos " +
        "anteriores no están muertos, están cambiados.",
    },
    {
      id: "s-encorvados",
      peso: "menor",
      bandera: null,
      texto:
        "Los Encorvados no atacan: rodean, miran e imitan. Se vuelven hostiles solo si alguien " +
        "intenta salir del Círculo llevándose algo que pertenece al Bosque, y hablan con la voz " +
        "de la persona que fueron.",
    },
    {
      id: "s-vesna-diezmo",
      peso: "mayor",
      bandera: "hablo_con_vesna",
      texto:
        "Vesna fue el diezmo de hace cuarenta años: bajó al Círculo con nueve años y volvió, y " +
        "eso es lo que la aldea no le perdona. El pacto se cierra con quien se ofrezca " +
        "libremente; ella se ofreció, y no la aceptaron.",
    },
    {
      id: "s-tierra",
      peso: "mayor",
      bandera: "conoce_clausula_tierra",
      texto:
        "Los primeros colonos no pidieron protección: tomaron la tierra. El pacto no fue un " +
        "regalo del Bosque, fue una deuda a plazos, y los niños fueron el plazo más pequeño que " +
        "consiguieron negociar.",
    },
    {
      id: "s-acreedor",
      peso: "mayor",
      bandera: "hablo_con_el_acreedor",
      texto:
        "Al Acreedor no se le puede matar, pero sí se le puede pagar, y no entiende el regateo: " +
        "entiende lo que se le ofrece. Acepta un niño, un voluntario, o la tierra.",
    },
  ],

  /**
   * La gente. Es lo que sale en «Quién es quién» del tablet, y solo cuando la mesa ya los ha
   * conocido: `que` lo LEEN LOS JUGADORES, así que aquí va únicamente lo que se ve desde fuera.
   * Lo que cada uno oculta está en `campana/mundo.md` y se suelta por la lista de secretos.
   *
   * `retrato` es el gancho para el día que haya arte de NPC: se pone el id de un `.webp` de
   * `app/arte/` y la galería lo pinta encima del medallón. Hoy va a `null` en todos —no hay
   * retratos generados— y el medallón de `app/quienes.js` hace de marcador de posición.
   * NO se llama `arte`: `scripts/preparar-app.mjs` caza esa clave por expresión regular sobre el
   * fichero entero y exigiría un `<!-- imagen: … -->` en las escenas.
   */
  npcs: [
    {
      id: "domar",
      nombre: "Domar Ramos",
      que: "Herrero. El padre de Sela. Os ha pedido que la encontréis vosotros.",
      donde: "L1",
      retrato: null,
    },
    {
      id: "mirena",
      nombre: "Mirena Ramos",
      que: "Tejedora. La madre de Sela. No abre la puerta.",
      donde: "L2",
      retrato: null,
    },
    {
      // A Sela no se le apunta el `donde` a propósito: dónde está es EL hallazgo de la aventura,
      // y este fichero lo lee una pantalla que miran los jugadores.
      id: "sela",
      nombre: "Sela Ramos",
      que: "Once años. Es a ella a quien le toca el diezmo. Lleva tres noches fuera.",
      donde: null,
      retrato: null,
    },
    {
      id: "olen",
      nombre: "Padre Olen",
      que: "El cura de San Bran. Sesenta años, y toda la vida en la misma parroquia.",
      donde: "L3",
      retrato: null,
    },
    {
      id: "vesna",
      nombre: "Vesna",
      que: "La Hilandera. Vive sola al otro lado del vado. La aldea le echa la culpa de todo.",
      donde: "L5",
      retrato: null,
    },
    {
      id: "bregit",
      nombre: "Anciana Bregit",
      que: "La mayor de la aldea. Ciega. Está siempre junto al fuego de la taberna.",
      donde: "L1",
      retrato: null,
    },
    {
      id: "tomas",
      nombre: "Tomás",
      que: "Zagal, quince años. Cuida las cabras y no mira a nadie a los ojos.",
      donde: "L1",
      retrato: null,
    },
  ],

  /**
   * Papeles que el DJ puede sacar en pantalla con `mostrar_documento`, por id.
   *
   * Están escritos como estarían escritos de verdad, sin resumir y sin explicar: lo que se lee se
   * relee y se discute entre ellos, y lo que se narra se olvida. Un renglón en blanco separa
   * párrafos y una línea que empieza por «— » sale como firma.
   */
  documentos: [
    {
      id: "d-registro",
      tipo: "registro",
      titulo: "Registro de San Bran · los asientos de diezmo",
      texto:
        "Primera. Anselma Vidal, ocho años. Luna Muerta, cuatro de noviembre.\n\n" +
        "Segunda. Perot Cerdán, doce años. Luna Muerta, veintinueve de octubre.\n\n" +
        "Tercera. Vesna Turgal, nueve años. Luna Muerta, once de noviembre.\n\n" +
        "Al margen de la tercera, con la misma mano pero más apretada: devuelta. No consta " +
        "segunda entrega.\n\n" +
        "Cuarta. Cándida Olmo, ocho años. Luna Muerta, dos de noviembre.\n\n" +
        "Quinta. Andrés Ramos, diez años. Luna Muerta, veintiséis de octubre.\n\n" +
        "Sexta. Bartolo Cerdán, once años. Luna Muerta, siete de noviembre.\n\n" +
        "Séptima. Ilda Vidal, nueve años. Luna Muerta, treinta de octubre.\n\n" +
        "Octava. Roque Olmo, ocho años. Luna Muerta, quince de noviembre.\n\n" +
        "Al pie del folio, con tinta nueva y sin terminar: Nov",
    },
    {
      id: "d-margen",
      tipo: "pagina",
      titulo: "Al margen de la primera entrada",
      texto:
        "No es esto lo pactado.\n\n" +
        "Lo pactado era la tierra.\n\n" +
        "Que Dios nos perdone la rebaja.",
    },
    {
      id: "d-tiza",
      tipo: "inscripcion",
      titulo: "El muro de la iglesia, a la altura de un hombre",
      texto: "IIII  IIII\n\nI",
    },
    {
      id: "d-nota-sela",
      tipo: "carta",
      titulo: "Un papel doblado cuatro veces, metido en un hueco del muro",
      texto:
        "Madre no vengas mas de noche que te ven.\n\n" +
        "Deja el pan en la piedra grande y vete. Yo lo cojo por la mañana.\n\n" +
        "No estoy sola. Habla conmigo y no me hace nada. Dice que si voy yo ya esta.\n\n" +
        "No se lo digas a padre.\n\n" +
        "— Sela",
    },
    {
      id: "d-carta-olen",
      tipo: "carta",
      titulo: "Doblada dentro del registro. No va dirigida a nadie",
      texto:
        "He escrito tres nombres con esta misma mano. He dado la misa del domingo siguiente las " +
        "tres veces, y en las tres nadie me preguntó nada. Eso es lo que no puedo contar en " +
        "confesión.\n\n" +
        "Quien venga después de mí: en el primer folio hay una línea al margen que ninguno de " +
        "los nueve hemos leído nunca en voz alta. Yo tampoco. Léela tú, si puedes.\n\n" +
        "Que Dios no me lo tenga en cuenta, porque yo sí me lo tengo.\n\n" +
        "— Olen, cura de San Bran",
    },
  ],

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
      ambiente: "tension",
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
      ambiente: "horror",
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
      ambiente: "duelo",
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

  // La prueba también lleva relojes, secretos, gente y papeles: si no, la mesa no vería en 40
  // minutos las mismas piezas que va a usar en la campaña, que es justo para lo que existe.
  // Aquí lo que aprieta no son las noches, es la luz.
  relojesSugeridos: [
    {
      titulo: "La luz se acaba",
      segmentos: 6,
      quePasa:
        "Se apaga la última antorcha. A oscuras, en la turbera, lo que sale del pozo ataca con " +
        "ventaja y nadie ve de dónde viene.",
    },
    {
      titulo: "Nera decide",
      segmentos: 4,
      quePasa:
        "Nera baja del desván sin esperaros, coge un hatillo y se va por el camino del sur. No " +
        "mira atrás ni una vez, y ya no vais a preguntarle nada.",
    },
  ],

  // Cuatro secretos: los mismos hechos que están repartidos por las escenas, pero sueltos, para
  // que el DJ practique soltarlos donde cuadren y no donde le tocaba.
  secretos: [
    {
      id: "s-cuerda",
      peso: "menor",
      bandera: "examino_el_pozo",
      texto:
        "La cuerda del pozo está cortada, no rota, y el brocal está arañado por dentro de abajo " +
        "hacia arriba. Alguien la soltó desde arriba mientras había peso colgando de ella.",
    },
    {
      id: "s-piedras",
      peso: "menor",
      bandera: "oyo_a_nera_en_el_desvan",
      texto:
        "Toma pasó una noche fuera, al norte, donde el camino se pierde entre abedules, y volvió " +
        "distinto. Nueve días trayendo cosas del bosque: primero ramas, luego piedras que " +
        "apilaba en el patio. Ella las deshacía y él las volvía a apilar.",
    },
    {
      id: "s-fuego",
      peso: "menor",
      bandera: null,
      texto:
        "Lo que hay en el pozo es agua y turba, y la turba seca arde. El fuego le hace el doble " +
        "de daño que el acero, y una antorcha encendida es un arma.",
    },
    {
      id: "s-cuna",
      peso: "mayor",
      bandera: "oyo_a_nera_en_el_desvan",
      texto:
        "Toma empezó a hablar de que había una que había que dar. Miró a Nera, y luego miró la " +
        "cuna. La cuna está vacía desde febrero, y él la miró igual.",
    },
  ],

  npcs: [
    {
      id: "nera",
      nombre: "Nera",
      que: "La mujer de la alquería. Estaba en el desván, callada, esperando a que os fuerais.",
      donde: "P3",
      retrato: null,
    },
    {
      id: "toma",
      nombre: "Toma Sarna",
      que: "El marido de Nera. Nadie lo ha visto desde hace nueve días.",
      donde: null,
      retrato: null,
    },
  ],

  documentos: [
    {
      id: "d-rayas",
      tipo: "inscripcion",
      titulo: "La jamba de la puerta del establo, rayada con un clavo",
      texto: "IIII  IIII\n\nI",
    },
    {
      id: "d-toma",
      tipo: "pagina",
      titulo: "Una hoja de almanaque, escrita por detrás con la letra de un hombre",
      texto:
        "una hay que dar\n\n" +
        "una hay que dar\n\n" +
        "una hay que dar\n\n" +
        "no la mia no la mia\n\n" +
        "una hay que dar",
    },
  ],

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
