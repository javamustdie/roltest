/**
 * acciones.js — «¿y yo qué puedo hacer?», en cartas.
 *
 * Los jugadores de esta mesa son novatos. En la hoja impresa (`mesa/hoja-acciones.html`) está todo,
 * pero en mitad de un combate nadie lee una hoja: hay que tener delante cuatro o cinco cosas
 * concretas que tu personaje puede hacer AHORA, con su tirada y su consecuencia. Esto son esos
 * datos, por clase, más el juego de acciones que puede hacer cualquiera — que es justo lo que un
 * novato no sabe que existe (esquivar, ayudar, retirarse, preparar).
 *
 * Solo datos y funciones puras. Ni DOM, ni HTML, ni `document`: la presentación va aparte.
 *
 * ── Contrato ─────────────────────────────────────────────────────────────────────────────────
 *
 *   accionesDe(clase) → Accion[]
 *     Las acciones de una clase, deducida del TEXTO LIBRE de la ficha («Exploradora 2»), igual
 *     que hace `CLASES` en app.js. Nunca devuelve null ni undefined: si el texto no se reconoce
 *     («», null, «Rey de los Gatos»), devuelve un array vacío, así que se puede recorrer siempre.
 *
 *   COMUNES → Accion[]
 *     Las que puede hacer cualquiera, lleve la clase que lleve. Van SIEMPRE, además de las suyas.
 *
 *   POR_CLASE → { [clave]: Accion[] }
 *     Todo, por clave de clase, para bancos de prueba y para recorrer las once.
 *     Claves sin tildes: guerrero, explorador, picaro, clerigo, druida, mago, barbaro, bardo,
 *     paladin, monje, brujo. Son las mismas once clases que reconoce `CLASES` de app.js.
 *
 *   claveClaseDe(texto) → string|null
 *     La clave que ha salido del texto de la ficha, o null. Útil para rotular o para saber si hay
 *     que avisar de que la clase no se reconoce.
 *
 *   COSTES → { [clave]: string }
 *     Etiqueta legible de cada valor posible de `coste`. Para pintarlo sin repetir el texto.
 *
 *   Accion = {
 *     id:     string   Clave estable, única dentro de su lista. Para keys de render y para pruebas.
 *     nombre: string   Título corto de la carta. Lo que hace el personaje, dicho en llano.
 *     que:    string   Qué haces, una frase. Segunda persona.
 *     tirada: string|null   Con qué se tira. null = SIN TIRADA (no es un olvido: es que no se tira).
 *     contra: string|null   Contra qué: una CD, una CA, una salvación. null si no hay objetivo.
 *     efecto: string   Qué pasa si sale.
 *     coste:  string   Una clave de COSTES. Siempre presente.
 *     gasta:  string|null   Qué se consume (un uso, un espacio de conjuro, una antorcha, flechas).
 *     icono:  string   Clave de las CATEGORIAS de objetos.js, para dibujar la carta. NO se importa
 *                      nada de ese fichero: aquí solo viaja la cadena.
 *     aviso:  string|null   El filo: lo que puede salir mal, o el error típico del novato.
 *     fuente: string   De dónde sale lo que dice la carta. Para poder auditarla (ver abajo).
 *   }
 *
 * Los once campos están SIEMPRE presentes; los cuatro que pueden faltar valen null explícito.
 * Las cartas y las listas van congeladas: el render no debe poder corromper los datos de la mesa.
 *
 * ── De dónde salen los números ────────────────────────────────────────────────────────────────
 *
 * Regla de la casa: no se inventa ninguna regla y no se da ningún número que no salga de
 * `.claude/skills/gm/reglas.md` o de una ficha de `campana/partida/`. Lo que no tiene fuente se
 * escribe sin número («lo que diga tu ficha», «la CD que ponga el DJ»). Por eso las clases sin
 * ficha pregenerada —bárbaro, bardo, paladín, monje, brujo, druida, mago— llevan las cartas sin
 * cifras: describen QUÉ puedes hacer, y el número lo pone la ficha que monte el DJ en sesión cero.
 *
 * El campo `fuente` de cada carta dice cuál es:
 *   «reglas §1»        el núcleo: d20, CD 10/13/16/19, competencia +2, ventaja, crítico
 *   «reglas §2»        combate: acciones, 9 m, reacción, cobertura, distancia
 *   «reglas §3»        daño y muerte, y los diales 1 a 6 que van dentro
 *   «reglas §4»        conjuros: trucos ilimitados, hasta 2.º nivel, concentración, el 1d6 del Bosque
 *   «reglas §5»        condiciones
 *   «reglas §6»        lo que se resuelve con una prueba contra una CD de la tabla
 *   «ficha X»          bram, elara, nix o sor-ivet: sus rasgos y sus números
 *   «clase del SRD»    la clase existe y el rasgo existe, pero el número lo pone la ficha
 *
 * Si cambian las reglas, esto se revisa: es la versión que tiene el jugador delante y no puede
 * discrepar ni de `reglas.md` ni de la hoja impresa.
 */

/** Etiquetas de coste. Las claves son los valores válidos del campo `coste`. */
export const COSTES = Object.freeze({
  accion: "Tu acción",
  adicional: "Acción adicional",
  reaccion: "Tu reacción",
  movimiento: "Tu movimiento",
  ninguno: "No cuesta turno",
  rato: "Lleva un rato",
});

/**
 * Normaliza una carta: rellena con null los cuatro campos opcionales y la congela. Se hace aquí y
 * no a mano en cada carta para que el contrato se cumpla por construcción — si un día falta un
 * campo, falta en un sitio, no en sesenta.
 */
const carta = (o) =>
  Object.freeze({
    id: o.id,
    nombre: o.nombre,
    que: o.que,
    tirada: o.tirada ?? null,
    contra: o.contra ?? null,
    efecto: o.efecto,
    coste: o.coste,
    gasta: o.gasta ?? null,
    icono: o.icono,
    aviso: o.aviso ?? null,
    fuente: o.fuente,
  });

const lista = (...cs) => Object.freeze(cs.map(carta));

// ── Lo que puede hacer cualquiera ─────────────────────────────────────────────────────────────
// Este es el bloque que más falta hace. Un novato sabe que puede pegar; no sabe que puede esquivar,
// ni ayudar, ni retirarse sin comerse un ataque. Todo sale de reglas.md §2, §3 y §5.

export const COMUNES = lista(
  {
    id: "atacar",
    nombre: "Atacar",
    que: "Le das con lo que llevas en la mano, o le disparas si está lejos.",
    tirada: "d20 + tu bonificador de ataque (el que pone tu ficha; ya lleva la competencia, +2)",
    contra: "la clase de armadura del enemigo — la sabe el DJ, tú tiras y él te dice",
    efecto: "Si aciertas, tiras los dados de daño del arma y les sumas tu modificador.",
    coste: "accion",
    icono: "espada",
    aviso:
      "Un 20 natural dobla los dados de daño, no el modificador. Un 1 natural falla siempre. " +
      "Disparar con un enemigo pegado a ti se hace con desventaja.",
    fuente: "reglas §1, §2",
  },
  {
    id: "esquivar",
    nombre: "Esquivar",
    que: "Dejas de atacar y te dedicas a que no te den.",
    tirada: null,
    contra: null,
    efecto:
      "Hasta tu siguiente turno, quien te ataque tira con desventaja, y tú tiras tus salvaciones " +
      "de Destreza con ventaja.",
    coste: "accion",
    icono: "escudo",
    aviso: "Es la acción más desaprovechada de la mesa. Si vas justo de PG, esto vale más que pegar.",
    fuente: "reglas §2",
  },
  {
    id: "esconderse",
    nombre: "Esconderte",
    que: "Te quitas de la vista detrás de algo o en la oscuridad.",
    tirada: "d20 + Sigilo",
    contra: "la CD que diga el DJ",
    efecto: "Si nadie sabe dónde estás, atacas con ventaja y a ti cuesta encontrarte.",
    coste: "accion",
    icono: "capucha",
    aviso: "Hace falta cobertura u oscuridad. A campo abierto y a la vista de todos, no hay tirada.",
    fuente: "reglas §2",
  },
  {
    id: "ayudar",
    nombre: "Ayudar",
    que: "Sujetas, distraes, aguantas la cuerda, señalas dónde está el cerrojo.",
    tirada: null,
    contra: null,
    efecto: "Tu compañero tira su siguiente tirada con ventaja: dos d20 y se queda el mejor.",
    coste: "accion",
    icono: "guantes",
    aviso: "Tienes que poder ayudar de verdad. Animar desde diez metros no cuenta.",
    fuente: "reglas §2",
  },
  {
    id: "correr",
    nombre: "Correr",
    que: "Aprietas y te mueves el doble en vez de hacer otra cosa.",
    tirada: null,
    contra: null,
    efecto: "Recorres el doble de tu velocidad (9 m es lo normal, mira tu ficha).",
    coste: "accion",
    icono: "botas",
    aviso: "Correr hacia la puerta suele ser mejor plan que el sexto turno de combate.",
    fuente: "reglas §2",
  },
  {
    id: "retirarte",
    nombre: "Retirarte",
    que: "Sales de al lado de un enemigo con cuidado, sin darle la espalda del todo.",
    tirada: null,
    contra: null,
    efecto: "Tu movimiento de este turno no provoca ataques de oportunidad.",
    coste: "accion",
    icono: "capa",
    aviso: "Si te vas sin más, el que tenías pegado gasta su reacción y te ataca una vez.",
    fuente: "reglas §2",
  },
  {
    id: "oportunidad",
    nombre: "Ataque de oportunidad",
    que: "Alguien intenta irse de tu lado y le das al pasar.",
    tirada: "d20 + tu bonificador de ataque",
    contra: "su clase de armadura",
    efecto: "Un ataque, con su daño normal.",
    coste: "reaccion",
    icono: "daga",
    aviso: "Una reacción por ronda y ya. No pasa en tu turno: pasa cuando le toca a él.",
    fuente: "reglas §2",
  },
  {
    id: "preparar",
    nombre: "Preparar",
    que: "Te quedas esperando con la lanza apuntada y dices en voz alta a qué esperas.",
    tirada: null,
    contra: null,
    efecto:
      "Declaras el desencadenante («si asoma por la puerta») y qué harás. Cuando ocurre, gastas " +
      "tu reacción y lo haces.",
    coste: "accion",
    icono: "lanza",
    aviso: "Si no ocurre, has perdido el turno. Y solo tienes una reacción por ronda.",
    fuente: "reglas §2",
  },
  {
    id: "usar-objeto",
    nombre: "Usar un objeto",
    que: "Bebes una poción, tiras de la palanca, abres la puerta atrancada, cortas una cuerda.",
    tirada: null,
    contra: "si hay riesgo, la CD que diga el DJ",
    efecto: "Lo que haga el objeto. Si no hay riesgo y no hay prisa, funciona sin tirar.",
    coste: "accion",
    gasta: "lo que uses, si es de un solo uso",
    icono: "pocion",
    aviso: "Dar una poción a otro también es tu acción. En combate eso es un turno entero.",
    fuente: "reglas §1, §2",
  },
  {
    id: "antorcha",
    nombre: "Encender una antorcha",
    que: "Prendes una antorcha y la sostienes con una mano.",
    tirada: null,
    contra: null,
    efecto: "6 m de luz brillante y 6 m más de penumbra. Dura una hora, y se apunta.",
    coste: "accion",
    gasta: "una antorcha",
    icono: "antorcha",
    aviso:
      "En penumbra tienes desventaja en Percepción visual. A oscuras estás ciego: desventaja al " +
      "atacar y ventaja para quien te ataque. Las antorchas se cuentan y se acaban.",
    fuente: "reglas §3 dial 5",
  },
  {
    id: "agarrar",
    nombre: "Agarrar",
    que: "Le echas las manos encima para que no se vaya a ningún sitio.",
    tirada: "d20 + Atletismo",
    contra: "la CD que ponga el DJ",
    efecto: "Queda agarrado: velocidad 0 mientras lo sujetes.",
    coste: "accion",
    icono: "cuerda",
    aviso:
      "Para soltarse de un agarre se tira Atletismo o Acrobacias contra la CD que diga el DJ. " +
      "Si te agarran a ti y hay un pozo cerca, tienes un problema.",
    fuente: "reglas §5, §6",
  },
  {
    id: "estabilizar",
    nombre: "Parar la sangre",
    que: "Un compañero está en el suelo agonizando y le tapas el agujero.",
    tirada: "d20 + Medicina",
    contra: "la CD que diga el DJ",
    efecto: "Deja de tirar salvaciones de muerte. Sigue a 0 PG e inconsciente, pero no se muere.",
    coste: "accion",
    icono: "vendas",
    aviso:
      "Vendar una hemorragia de la tabla de heridas es CD 13 de Medicina. Con suministros de " +
      "curandero se estabiliza sin tirada, y esos suministros se gastan.",
    fuente: "reglas §3 dial 2, ficha sor-ivet",
  },
  {
    id: "fijarte",
    nombre: "Fijarte bien",
    que: "Dejas de andar y miras de verdad: el suelo, las paredes, lo que no encaja.",
    tirada: "d20 + Percepción, o Investigación si es cosa de buscar y no de notar",
    contra: "la CD que diga el DJ",
    efecto: "El DJ te cuenta lo que hay ahí y no habías visto.",
    coste: "rato",
    icono: "farol",
    aviso: "Preguntar es gratis: describe qué examinas antes de tirar. Muchas veces no hace falta tirada.",
    fuente: "reglas §1",
  },
  {
    id: "agonizar",
    nombre: "Estás a 0 PG",
    que: "Te han tirado. Caes inconsciente y agonizante, y al empezar tu turno tiras por tu vida.",
    tirada: "d20 a secas, sin sumar nada",
    contra: "10 o más es un éxito; menos, un fallo",
    efecto:
      "Dos éxitos te estabilizan. Dos fallos y mueres. Un 20 natural te devuelve con 1 PG; un 1 " +
      "natural cuenta como dos fallos.",
    coste: "ninguno",
    icono: "hueso",
    aviso:
      "Si te dan mientras agonizas, es un fallo automático. Y al caer a 0 tiras herida " +
      "persistente: se queda. Aquí no hay resurrección de ninguna clase.",
    fuente: "reglas §3, diales 2 y 3",
  },
);

// ── Guerrero ──────────────────────────────────────────────────────────────────────────────────
// Números de la ficha de Bram (`campana/partida/bram.md`): Segundo aliento 1d10+2, Oleada de
// acción, espada larga 1d8/1d10 a dos manos. Aquí no se repiten los bonificadores de Bram porque
// otro guerrero tendrá otros: se remite a la ficha.

const GUERRERO = lista(
  {
    id: "ponerte-delante",
    nombre: "Ponerte delante",
    que: "Te metes entre el bicho y quien no aguanta un golpe.",
    tirada: null,
    contra: null,
    efecto:
      "Para llegar a los de detrás tienen que pasar por ti, y si intentan rodearte te queda tu " +
      "ataque de oportunidad.",
    coste: "movimiento",
    icono: "escudo",
    aviso: "No es un rasgo con nombre: es moverte y quedarte ahí. Funciona porque el DJ tiene que decidir a quién ataca.",
    fuente: "reglas §2",
  },
  {
    id: "dos-manos",
    nombre: "Coger el arma con las dos manos",
    que: "Sueltas el escudo y le das con todo el cuerpo.",
    tirada: "d20 + tu bonificador de ataque",
    contra: "su clase de armadura",
    efecto: "El arma hace un dado de daño más gordo: el que ponga tu ficha para las dos manos.",
    coste: "accion",
    icono: "espada",
    aviso: "Sin escudo bajas de clase de armadura. Pegar más fuerte aquí significa que te den más veces.",
    fuente: "ficha bram",
  },
  {
    id: "segundo-aliento",
    nombre: "Segundo aliento",
    que: "Aprietas los dientes, respiras y aguantas un poco más.",
    tirada: "los PG que diga tu ficha (la de Bram: 1d10+2)",
    contra: null,
    efecto: "Recuperas esos PG en el sitio, sin dejar de hacer tu acción normal.",
    coste: "adicional",
    gasta: "el único uso que tienes hasta el siguiente descanso corto",
    icono: "vendas",
    aviso:
      "Es lo más parecido a curarte que llevas encima, y la curación en esta campaña es escasa. " +
      "No lo tires por cuatro PG.",
    fuente: "ficha bram, reglas §4",
  },
  {
    id: "oleada",
    nombre: "Oleada de acción",
    que: "Un arreón: en este turno haces dos cosas en vez de una.",
    tirada: null,
    contra: null,
    efecto: "Una acción entera de más. Pegar dos veces, o pegar y sacar a alguien a rastras.",
    coste: "accion",
    gasta: "el único uso que tienes hasta el siguiente descanso corto",
    icono: "casco",
    aviso: "Guárdalo para el turno que decide la pelea, no para el primero.",
    fuente: "ficha bram",
  },
  {
    id: "tirar-la-lanza",
    nombre: "Tirar la lanza",
    que: "Le tiras la lanza al que está lejos y no piensas esperar a que llegue.",
    tirada: "d20 + tu bonificador de ataque a distancia",
    contra: "su clase de armadura",
    efecto: "El daño de la lanza que diga tu ficha.",
    coste: "accion",
    gasta: "una lanza, que se queda donde caiga",
    icono: "lanza",
    aviso: "Con un enemigo pegado a ti, desventaja. Y luego hay que ir a recogerla.",
    fuente: "ficha bram, reglas §2",
  },
);

// ── Explorador ────────────────────────────────────────────────────────────────────────────────
// De la ficha de Elara: arco largo, Explorador natural, Enemigo predilecto (bestias). Sin cartas
// de conjuro: la ficha pregenerada del DJ no le da ninguno, y aquí manda la ficha.

const EXPLORADOR = lista(
  {
    id: "disparar",
    nombre: "Disparar",
    que: "Le metes una flecha antes de que llegue a tocarte.",
    tirada: "d20 + tu bonificador de ataque con el arco",
    contra: "su clase de armadura",
    efecto: "El daño del arco que diga tu ficha.",
    coste: "accion",
    gasta: "una flecha — se cuentan una a una",
    icono: "arco",
    aviso:
      "Con un enemigo pegado a ti tiras con desventaja: muévete primero. Después del combate se " +
      "recupera parte de las flechas, si hay tiempo para buscarlas.",
    fuente: "ficha elara, reglas §2, §3 dial 5",
  },
  {
    id: "leer-el-rastro",
    nombre: "Leer el rastro",
    que: "Te agachas y lees el barro: qué ha pasado por aquí, cuántos eran, hace cuánto.",
    tirada: "d20 + Supervivencia",
    contra: "la CD que diga el DJ",
    efecto: "Sabes qué dejó esas marcas y hacia dónde fue.",
    coste: "rato",
    icono: "botas",
    aviso: "Si tu ficha lleva Enemigo predilecto, rastreando eso tiras con ventaja. Dilo tú, que el DJ lo agradece.",
    fuente: "ficha elara, reglas §1",
  },
  {
    id: "guiar",
    nombre: "Guiar por el bosque",
    que: "Vas delante eligiendo por dónde se pasa.",
    tirada: null,
    contra: null,
    efecto:
      "Con Explorador natural no os perdéis en tu terreno salvo por medios mágicos, y el grupo " +
      "avanza a ritmo normal aunque el terreno sea malo.",
    coste: "ninguno",
    icono: "cuerda",
    aviso: "No te protege de lo que vive ahí. Solo de dar vueltas.",
    fuente: "ficha elara",
  },
  {
    id: "adelantarte",
    nombre: "Adelantarte en silencio",
    que: "Te separas del grupo, mires lo que hay más allá y vuelves.",
    tirada: "d20 + Sigilo para ir, d20 + Percepción para enterarte",
    contra: "la CD que diga el DJ",
    efecto: "Vuelves sabiendo qué hay delante antes de que el grupo se meta.",
    coste: "rato",
    icono: "capucha",
    aviso: "Solo, y sin antorcha si quieres que sirva. Si sale mal, sale mal lejos de los demás.",
    fuente: "reglas §2, §6",
  },
  {
    id: "acampar",
    nombre: "Montar el campamento",
    que: "Buscas un sitio defendible, haces fuego y consigues algo que comer.",
    tirada: "d20 + Supervivencia",
    contra: "la CD que diga el DJ",
    efecto: "Refugio, fuego y comida: las tres cosas que hacen falta para que el descanso largo cuente.",
    coste: "rato",
    icono: "raciones",
    aviso:
      "Si falta el fuego o falta la comida, la noche no cuenta como descanso largo y todo el " +
      "mundo gana un nivel de agotamiento. Esta carta es la que salva al grupo.",
    fuente: "reglas §3 diales 1 y 5",
  },
);

// ── Pícaro ────────────────────────────────────────────────────────────────────────────────────
// De la ficha de Nix: Ataque furtivo +1d6, Acción astuta, Experiencia en Sigilo y Juego de Manos,
// herramientas de ladrón. La nota táctica de su ficha —«el combate no se gana a golpes, se evita»—
// va en los avisos a propósito.

const PICARO = lista(
  {
    id: "furtivo",
    nombre: "Golpe sucio",
    que: "Le das donde no te está mirando. Tu ficha lo llama Ataque furtivo.",
    tirada: "tu ataque normal, d20 + tu bonificador",
    contra: "su clase de armadura",
    efecto: "Si acierta, sumas +1d6 de daño (el que dice la ficha de Nix).",
    coste: "accion",
    icono: "daga",
    aviso:
      "Una vez por turno, y solo si tiras con ventaja o si un aliado está pegado al objetivo. " +
      "No es una acción aparte: es tu ataque cuando se cumple eso.",
    fuente: "ficha nix",
  },
  {
    id: "accion-astuta",
    nombre: "Desaparecer",
    que: "Con la acción adicional te escondes, corres o te retiras. Tu ficha lo llama Acción astuta.",
    tirada: "si te escondes, d20 + Sigilo",
    contra: "la CD que diga el DJ",
    efecto: "Te escondes o te largas Y te queda la acción entera para pegar o para lo que sea.",
    coste: "adicional",
    icono: "capa",
    aviso:
      "Todos los turnos, sin gastar nada. Eres el más frágil del grupo: esto es tu armadura. " +
      "Aquí el combate no se gana a golpes, se evita.",
    fuente: "ficha nix",
  },
  {
    id: "abrir",
    nombre: "Abrir lo cerrado",
    que: "Sacas las herramientas y trabajas la cerradura, el cerrojo o el mecanismo de la trampa.",
    tirada: "d20 + tu bonificador con herramientas de ladrón",
    contra: "la CD que diga el DJ",
    efecto: "Cede. O localizas el resorte antes de pisarlo.",
    coste: "rato",
    icono: "ganzuas",
    aviso: "Fallar no la cierra para siempre: pregunta qué costaría intentarlo otra vez. Suele costar tiempo o ruido.",
    fuente: "ficha nix, reglas §1",
  },
  {
    id: "juego-de-manos",
    nombre: "Quitarlo del bolsillo",
    que: "Le sacas la llave, le cambias el vaso o te guardas lo que había en la mesa.",
    tirada: "d20 + Juego de Manos",
    contra: "la CD que diga el DJ",
    efecto: "Lo tienes tú y él no se ha enterado.",
    coste: "accion",
    icono: "moneda",
    aviso: "Si falla, se ha enterado. En una aldea de doce casas eso no se olvida.",
    fuente: "ficha nix, reglas §1",
  },
  {
    id: "mentir",
    nombre: "Contar algo que no es",
    que: "Le cuentas una historia que le conviene creer.",
    tirada: "d20 + Engaño",
    contra: "la CD que diga el DJ",
    efecto: "Se lo cree lo justo para que consigas lo que querías.",
    coste: "rato",
    icono: "capucha",
    aviso:
      "Fallar una tirada social no significa que te contesten una mentira: significa que no " +
      "consigues nada. Y en este pueblo casi todos mienten por miedo, no por codicia.",
    fuente: "reglas §1",
  },
);

// ── Clérigo ───────────────────────────────────────────────────────────────────────────────────
// De la ficha de Sor Ivet: CD de conjuros 13, ataque de conjuro +5, trucos, tres espacios de
// nivel 1, Canalizar Divinidad con salvación de Sabiduría CD 13 a 9 m, y suministros de curandero
// con 10 usos. La advertencia de que curar heridas NO arregla las heridas persistentes también.

const CLERIGO = lista(
  {
    id: "truco",
    nombre: "Tirar un truco",
    que: "Un conjuro pequeño de los que no se gastan nunca.",
    tirada: "según el truco: d20 + tu ataque de conjuro (Sor Ivet, +5), o que él tire salvación",
    contra: "su clase de armadura, o la CD de tus conjuros (Sor Ivet, 13)",
    efecto: "Lo que diga el truco. Y puedes repetirlo todos los turnos de la partida.",
    coste: "accion",
    icono: "simbolo",
    aviso: "Los trucos son ilimitados. Antes de gastar un espacio, mira si un truco te vale.",
    fuente: "reglas §4, ficha sor-ivet",
  },
  {
    id: "curar",
    nombre: "Curar heridas",
    que: "Le pones las manos encima y le cierras lo que se pueda cerrar.",
    tirada: "los PG que diga tu ficha para el conjuro",
    contra: null,
    efecto: "Recupera esos PG. Si estaba agonizando, vuelve en pie con esos PG.",
    coste: "accion",
    gasta: "un espacio de conjuro de nivel 1",
    icono: "vendas",
    aviso:
      "No arregla las heridas persistentes de la tabla: para eso hacen falta suministros y CD 16 " +
      "de Medicina, o una semana de reposo. Y no hay tienda de pociones: lo que gastes no se " +
      "reemplaza. Aparte: la primera vez que se lanza un conjuro de nivel 1 o más en una escena " +
      "del Bosque profundo, el DJ tira 1d6 y con un 1 algo se ha dado cuenta.",
    fuente: "reglas §3 dial 2, §4",
  },
  {
    id: "bendecir",
    nombre: "Bendecir a los tuyos",
    que: "Dices el nombre de tres y les sostienes la mano que tiembla.",
    tirada: "lo que sumen a sus tiradas, según el conjuro",
    contra: null,
    efecto: "Mientras aguantes la concentración, los tuyos tiran mejor.",
    coste: "accion",
    gasta: "un espacio de conjuro de nivel 1, y tu concentración",
    icono: "incensario",
    aviso:
      "Un solo conjuro de concentración a la vez: si lanzas otro, el primero se cae. Y si te " +
      "hacen daño, salvación de Constitución CD 10 —o la mitad del daño recibido, la que sea más " +
      "alta— o lo pierdes.",
    fuente: "reglas §4",
  },
  {
    id: "expulsar",
    nombre: "Expulsar a los muertos",
    que: "Levantas el símbolo y les dices que se vayan.",
    tirada: "ellos tiran salvación de Sabiduría",
    contra: "la CD de tus conjuros (Sor Ivet, 13)",
    efecto: "Los muertos vivientes a 9 m que fallen huyen durante un minuto.",
    coste: "accion",
    gasta: "tu Canalizar Divinidad, uno por descanso corto",
    icono: "campana",
    aviso: "No los mata: los quita de encima un rato. Aprovecha ese rato para algo, no para pegarles.",
    fuente: "ficha sor-ivet",
  },
  {
    id: "curandero",
    nombre: "Suministros de curandero",
    que: "Abres el paño de vendas y agujas y trabajas sobre el que está en el suelo.",
    tirada: null,
    contra: null,
    efecto: "Lo estabilizas sin tirar. Deja de hacer salvaciones de muerte.",
    coste: "accion",
    gasta: "un uso de los que queden (la ficha de Sor Ivet trae 10)",
    icono: "herramienta",
    aviso: "Sigue a 0 PG e inconsciente. Y esos usos se cuentan, como todo lo demás.",
    fuente: "ficha sor-ivet, reglas §3",
  },
);

// ── Druida ────────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada: ninguna carta da un número que no esté en reglas.md. Los usos de Forma
// salvaje, los dados y las CD los pone la ficha que monte el DJ.

const DRUIDA = lista(
  {
    id: "truco",
    nombre: "Tirar un truco",
    que: "Un conjuro pequeño de los que no se gastan nunca.",
    tirada: "según el truco: d20 + tu ataque de conjuro, o que él tire salvación",
    contra: "su clase de armadura, o la CD de tus conjuros — las dos, en tu ficha",
    efecto: "Lo que diga el truco, todas las veces que quieras.",
    coste: "accion",
    icono: "hierbas",
    aviso: "Los trucos son ilimitados. Los espacios de conjuro, no: mira si un truco te vale antes.",
    fuente: "reglas §4",
  },
  {
    id: "conjuro",
    nombre: "Lanzar un conjuro",
    que: "Gastas uno de los pocos conjuros que llevas preparados.",
    tirada: "lo que diga el conjuro en tu ficha",
    contra: "su salvación contra la CD de tus conjuros, o tu ataque de conjuro contra su CA",
    efecto: "Lo que haga el conjuro. Hasta nivel 2 y nada más: aquí no hay conjuros más gordos.",
    coste: "accion",
    gasta: "un espacio de conjuro",
    icono: "baston",
    aviso:
      "La primera vez que se lanza un conjuro de nivel 1 o más en una escena del Bosque profundo, " +
      "el DJ tira 1d6: con un 1, algo se ha dado cuenta. Aquí la magia se oye.",
    fuente: "reglas §4",
  },
  {
    id: "forma-salvaje",
    nombre: "Ponerte piel de bestia",
    que: "Te conviertes en un animal que hayas visto de verdad. Tu ficha lo llama Forma salvaje.",
    tirada: null,
    contra: null,
    efecto:
      "Pasas a usar los PG, la velocidad y los sentidos de la bestia. Cuando esos PG se acaban, " +
      "vuelves a tu cuerpo con los que tuvieras.",
    coste: "accion",
    gasta: "un uso de los que ponga tu ficha",
    icono: "hueso",
    aviso:
      "Lo bueno no es pelear con ella: es pasar por donde no pasa una persona, o cruzar un " +
      "claro sin que nadie vea a nadie raro. Transformada no lanzas conjuros.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "leer-el-monte",
    nombre: "Saber qué es eso",
    que: "Miras la planta, la huella o el bicho y dices qué es y si mata.",
    tirada: "d20 + Naturaleza, o Supervivencia si es cosa de campo",
    contra: "la CD que diga el DJ",
    efecto: "Sabes si se come, si cura, si es de esta comarca y de quién es esa marca.",
    coste: "rato",
    icono: "hierbas",
    aviso: "Preguntar qué sabes es gratis. La tirada es para lo que no salta a la vista.",
    fuente: "reglas §1",
  },
  {
    id: "hablar-con-lo-que-no-habla",
    nombre: "Hablar con un animal",
    que: "Te acercas despacio y le preguntas qué ha visto pasar.",
    tirada: "d20 + Trato con Animales, o lo que diga el conjuro si llevas uno",
    contra: "la CD que diga el DJ",
    efecto: "Se queda quieto, te deja pasar, o te cuenta lo poco que un animal puede contar.",
    coste: "rato",
    icono: "amuleto",
    aviso: "Un animal del Bosque puede no ser un animal. Si algo no encaja, dilo en voz alta.",
    fuente: "reglas §1, §6",
  },
);

// ── Mago ──────────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada. Los dados de daño, los espacios y la CD los pone la ficha.
// La app manda aquí también a los hechiceros: `CLASES` de app.js los mete en la misma entrada.

const MAGO = lista(
  {
    id: "truco",
    nombre: "Tirar un truco",
    que: "Tu conjuro pequeño, el que puedes usar todo el día sin gastar nada.",
    tirada: "d20 + tu ataque de conjuro, o que él tire salvación — según el truco",
    contra: "su clase de armadura, o la CD de tus conjuros",
    efecto: "Lo que diga el truco. Ilimitado: es tu arma de verdad.",
    coste: "accion",
    icono: "pergamino",
    aviso: "Los magos novatos guardan los espacios y se olvidan de que el truco no se acaba nunca.",
    fuente: "reglas §4",
  },
  {
    id: "conjuro",
    nombre: "Lanzar un conjuro",
    que: "Gastas uno de los espacios que llevas y sueltas algo gordo.",
    tirada: "lo que diga el conjuro en tu ficha",
    contra: "su salvación contra la CD de tus conjuros, o tu ataque de conjuro contra su CA",
    efecto: "Lo que haga el conjuro. Hasta nivel 2: no hay nada mayor en esta campaña.",
    coste: "accion",
    gasta: "un espacio de conjuro",
    icono: "libro",
    aviso:
      "La primera vez que se lanza un conjuro de nivel 1 o más en una escena del Bosque profundo, " +
      "el DJ tira 1d6: con un 1, algo se ha dado cuenta. Piensa si merece la pena.",
    fuente: "reglas §4",
  },
  {
    id: "concentracion",
    nombre: "Mantener la concentración",
    que: "Algunos conjuros duran solo mientras los sostengas con la cabeza.",
    tirada: "salvación de Constitución si te hacen daño",
    contra: "CD 10, o la mitad del daño recibido, la que sea más alta",
    efecto: "Si la superas, el conjuro sigue. Si no, se cae y el espacio está gastado.",
    coste: "ninguno",
    icono: "anillo",
    aviso: "Uno a la vez. Si lanzas otro de concentración, el primero se cae solo, sin tirada.",
    fuente: "reglas §4",
  },
  {
    id: "saber",
    nombre: "Acordarte de lo que has leído",
    que: "Has leído sobre esto. Rebuscas en la memoria.",
    tirada: "d20 + Arcanos, Historia o Religión, lo que toque",
    contra: "la CD que diga el DJ",
    efecto: "El DJ te dice lo que sabe tu personaje, que es más de lo que sabes tú.",
    coste: "rato",
    icono: "libro",
    aviso: "Pregunta siempre: a veces no hay tirada porque tu personaje lo sabe y ya está.",
    fuente: "reglas §1",
  },
  {
    id: "luz",
    nombre: "Hacer luz sin fuego",
    que: "Si tu ficha lleva el truco de luz, iluminas un objeto y lo llevas en la mano.",
    tirada: null,
    contra: null,
    efecto: "Luz sin gastar antorcha. En esta campaña, eso es dinero.",
    coste: "accion",
    icono: "vela",
    aviso:
      "Mira tu ficha antes de decirlo: si no llevas ese truco, no lo tienes. Y la luz también te " +
      "hace visible a lo que hay fuera del círculo.",
    fuente: "reglas §3 dial 5, §4",
  },
);

// ── Bárbaro ───────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada. La furia da ventaja en Fuerza —eso sí está en reglas.md §1—, pero el daño
// extra y el aguante no llevan número aquí: los pone la ficha.

const BARBARO = lista(
  {
    id: "furia",
    nombre: "Ponerte furioso",
    que: "Dejas de tener miedo y de tener cuidado.",
    tirada: null,
    contra: null,
    efecto:
      "Mientras dure: ventaja en pruebas y salvaciones de Fuerza, pegas más fuerte y los golpes " +
      "te hacen menos daño. Cuánto, lo dice tu ficha.",
    coste: "adicional",
    gasta: "un uso de furia de los que ponga tu ficha",
    icono: "hacha",
    aviso: "Se te acaba si dejas de pelear. Y furioso no lanzas conjuros ni piensas mucho.",
    fuente: "clase del SRD, sin números: los pone la ficha. La ventaja, reglas §1",
  },
  {
    id: "con-todo",
    nombre: "Dar con todo",
    que: "Coges el arma grande con las dos manos y le entras encima.",
    tirada: "d20 + tu bonificador de ataque",
    contra: "su clase de armadura",
    efecto: "El dado de daño más grande que tengas, el que ponga tu ficha.",
    coste: "accion",
    icono: "hacha",
    aviso: "Sin escudo. Todo lo que le hagas, te lo van a devolver.",
    fuente: "reglas §2",
  },
  {
    id: "oler-la-trampa",
    nombre: "Oler que algo va mal",
    que: "Se te ponen los pelos de punta antes de que caiga la piedra.",
    tirada: "salvación de Destreza, con ventaja",
    contra: "la CD que diga el DJ",
    efecto: "Te aparta a tiempo de lo que puedas ver venir: una trampa, un derrumbe, una red.",
    coste: "ninguno",
    icono: "piedra",
    aviso: "Solo vale para lo que se puede ver. En oscuridad total no te salva de nada.",
    fuente: "clase del SRD; la ventaja, reglas §1",
  },
  {
    id: "romper",
    nombre: "Romperlo con las manos",
    que: "La puerta está atrancada y tú no tienes ganzúas.",
    tirada: "d20 + Atletismo",
    contra: "la CD que diga el DJ",
    efecto: "Cede: la puerta, la tabla, la cadena, el candado.",
    coste: "accion",
    icono: "palanca",
    aviso: "Hace un ruido que se oye en toda la casa. Pregunta al DJ qué hay al otro lado antes.",
    fuente: "reglas §1, §6",
  },
  {
    id: "meter-miedo",
    nombre: "Meter miedo",
    que: "No dices nada. Te pones delante y que se lo piensen.",
    tirada: "d20 + Intimidación",
    contra: "la CD que diga el DJ",
    efecto: "Se echan atrás, contestan, o dejan de hacer lo que iban a hacer.",
    coste: "rato",
    icono: "casco",
    aviso: "Los aldeanos de aquí ya tienen miedo de otra cosa. A veces meterles más no sirve de nada.",
    fuente: "reglas §1",
  },
);

// ── Bardo ─────────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada: el dado que reparte y los usos que tiene los pone la ficha.

const BARDO = lista(
  {
    id: "inspirar",
    nombre: "Dar aliento",
    que: "Le dices al que está temblando algo que le hace sostener la mano.",
    tirada: null,
    contra: null,
    efecto:
      "Le das un dado. Cuando él quiera, lo tira y lo suma a una tirada suya. Qué dado y cuántos " +
      "usos tienes, en tu ficha.",
    coste: "adicional",
    gasta: "un uso de los que ponga tu ficha",
    icono: "campana",
    aviso: "Se lo das ANTES de que sepa si ha fallado. Repártelo pronto, que se te va a olvidar.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "conjuro",
    nombre: "Lanzar un conjuro",
    que: "Llevas unos pocos conjuros. Los trucos, esos no se gastan.",
    tirada: "lo que diga el conjuro en tu ficha",
    contra: "su salvación contra la CD de tus conjuros, o tu ataque de conjuro contra su CA",
    efecto: "Lo que haga el conjuro, hasta nivel 2.",
    coste: "accion",
    gasta: "un espacio de conjuro, salvo si es un truco",
    icono: "pergamino",
    aviso:
      "La primera vez que se lanza un conjuro de nivel 1 o más en una escena del Bosque profundo, " +
      "el DJ tira 1d6: con un 1, algo se ha dado cuenta.",
    fuente: "reglas §4",
  },
  {
    id: "concentracion",
    nombre: "Mantener la concentración",
    que: "Hay conjuros que duran mientras no te rompan la cabeza.",
    tirada: "salvación de Constitución si te hacen daño",
    contra: "CD 10, o la mitad del daño recibido, la que sea más alta",
    efecto: "Si la superas, el conjuro sigue. Si no, se cae y el espacio está gastado.",
    coste: "ninguno",
    icono: "anillo",
    aviso: "Uno a la vez, y no se puede sostener dos.",
    fuente: "reglas §4",
  },
  {
    id: "hablar",
    nombre: "Hablar para salir de esta",
    que: "Convences, negocias o das largas hasta que se abra otra puerta.",
    tirada: "d20 + Persuasión, Engaño o Interpretación, lo que encaje",
    contra: "la CD que diga el DJ",
    efecto: "Consigues el paso, el nombre, la noche de cama o el minuto que necesitabas.",
    coste: "rato",
    icono: "moneda",
    aviso:
      "Fallar no significa que te mientan: significa que no consigues nada. Y aquí la gente calla " +
      "por miedo, no por interés.",
    fuente: "reglas §1",
  },
  {
    id: "distraer",
    nombre: "Montar el número",
    que: "Cantas, tropiezas, tiras algo al suelo: que todos te miren a ti.",
    tirada: "d20 + Interpretación o Engaño",
    contra: "la CD que diga el DJ",
    efecto: "El que se cuela por detrás lo hace con ventaja mientras te miran.",
    coste: "accion",
    icono: "baston",
    aviso: "Te miran a ti. Piensa antes de dónde vas a salir tú.",
    fuente: "reglas §1, §2",
  },
);

// ── Paladín ───────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada. El castigo, la reserva de curación y los usos van sin cifra.

const PALADIN = lista(
  {
    id: "aguantar-delante",
    nombre: "Aguantar delante",
    que: "Te plantas donde va a doler y no te mueves de ahí.",
    tirada: null,
    contra: null,
    efecto:
      "Para llegar a los de detrás hay que pasar por ti, y si se van de tu lado te queda tu " +
      "ataque de oportunidad.",
    coste: "movimiento",
    icono: "escudo",
    aviso: "Aguantar no es una regla con nombre: es quedarte, y decidir que te quedas.",
    fuente: "reglas §2",
  },
  {
    id: "castigo",
    nombre: "Descargar el golpe",
    que: "Aciertas, y encima del acero le metes lo otro. Tu ficha lo llama Castigo divino.",
    tirada: "primero tu ataque normal; el daño de más, el que diga tu ficha",
    contra: "su clase de armadura",
    efecto: "Daño extra encima del daño del arma, en el mismo golpe.",
    coste: "ninguno",
    gasta: "un espacio de conjuro, después de saber que has acertado",
    icono: "espada",
    aviso: "Se gasta DESPUÉS de acertar, nunca antes. Y los espacios son pocos.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "imponer-manos",
    nombre: "Poner las manos",
    que: "Le tocas la herida y le pasas parte de lo que te queda.",
    tirada: null,
    contra: null,
    efecto: "Recupera los PG que saques de tu reserva. Cuánta reserva tienes, en tu ficha.",
    coste: "accion",
    gasta: "de tu reserva de curación, que no vuelve hasta el descanso",
    icono: "guantes",
    aviso:
      "No arregla las heridas persistentes de la tabla: eso son suministros y CD 16 de Medicina, " +
      "o una semana de reposo. Y no resucita a nadie: aquí no hay resurrección.",
    fuente: "clase del SRD; los límites, reglas §3 diales 2 y 3",
  },
  {
    id: "notar-lo-que-no-deberia",
    nombre: "Notar lo que no debería estar",
    que: "Se te encoge algo cuando hay cerca algo que no está vivo del todo.",
    tirada: null,
    contra: null,
    efecto: "Sabes que hay algo así cerca, y por dónde. No qué es ni cuántos.",
    coste: "accion",
    gasta: "un uso de los que ponga tu ficha",
    icono: "simbolo",
    aviso: "Notar no es ver. Y en este valle hay cosas que no salen en ninguna lista.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "conjuro",
    nombre: "Lanzar un conjuro",
    que: "Llevas unos pocos, casi todos para sostener al que se cae.",
    tirada: "lo que diga el conjuro en tu ficha",
    contra: "su salvación contra la CD de tus conjuros",
    efecto: "Lo que haga el conjuro, hasta nivel 2.",
    coste: "accion",
    gasta: "un espacio de conjuro — los mismos que usa el castigo",
    icono: "amuleto",
    aviso:
      "La primera vez que se lanza un conjuro de nivel 1 o más en una escena del Bosque profundo, " +
      "el DJ tira 1d6: con un 1, algo se ha dado cuenta. Tu fe aquí también llama la atención.",
    fuente: "reglas §4",
  },
);

// ── Monje ─────────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada. Los dados de golpe sin arma, los puntos y la CA sin armadura van sin cifra.

const MONJE = lista(
  {
    id: "manos-y-pies",
    nombre: "Pegar sin arma",
    que: "Le das con la mano, con el pie o con el bastón que llevas.",
    tirada: "d20 + tu bonificador de ataque",
    contra: "su clase de armadura",
    efecto: "El daño que ponga tu ficha para golpear sin arma.",
    coste: "accion",
    icono: "baston",
    aviso: "No necesitas arma, y eso importa cuando te registran a la entrada de un sitio.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "otro-golpe",
    nombre: "Y otro golpe",
    que: "Después de atacar, cuelas uno más con la acción adicional.",
    tirada: "d20 + tu bonificador de ataque",
    contra: "su clase de armadura",
    efecto: "Un golpe sin arma de más, con su daño.",
    coste: "adicional",
    icono: "guantes",
    aviso: "Gratis y todos los turnos. Si te olvidas de esto, estás peleando a medias.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
  {
    id: "puntos",
    nombre: "Gastar un punto",
    que: "Tienes unos pocos puntos (los de tu ficha) y con uno haces una de tres cosas.",
    tirada: null,
    contra: null,
    efecto:
      "Pegar dos veces más de golpe; esquivar con la acción adicional; o correr o retirarte con " +
      "la acción adicional.",
    coste: "adicional",
    gasta: "un punto de los que ponga tu ficha",
    icono: "anillo",
    aviso: "Esquivar con la adicional y seguir pegando con la acción es lo que te mantiene vivo.",
    fuente: "clase del SRD, sin números: los pone la ficha. Esquivar, correr y retirarte, reglas §2",
  },
  {
    id: "caer-de-pie",
    nombre: "Caer de pie",
    que: "Trepas, saltas la zanja, bajas por donde no hay escalera.",
    tirada: "d20 + Acrobacias, o Atletismo si es de fuerza bruta",
    contra: "la CD que diga el DJ",
    efecto: "Llegas arriba, o abajo, sin romperte nada.",
    coste: "rato",
    icono: "botas",
    aviso: "Di antes de tirar por dónde vas a subir. El DJ te dirá lo que cuesta.",
    fuente: "reglas §1",
  },
  {
    id: "sin-armadura",
    nombre: "No llevas armadura",
    que: "Vas sin nada encima y aun así cuesta darte.",
    tirada: null,
    contra: null,
    efecto: "Tu clase de armadura la lleva la ficha, y sale de esquivar, no de llevar hierro.",
    coste: "ninguno",
    icono: "capa",
    aviso: "No te pongas armadura de la que encontréis: la pierdes. Coge las botas y deja la coraza.",
    fuente: "clase del SRD, sin números: los pone la ficha",
  },
);

// ── Brujo ─────────────────────────────────────────────────────────────────────────────────────
// Sin ficha pregenerada. Ni los dados del truco ni los espacios llevan cifra aquí.

const BRUJO = lista(
  {
    id: "truco",
    nombre: "Tirar tu truco",
    que: "Tu conjuro de siempre, el que no se gasta nunca. Es tu arma.",
    tirada: "d20 + tu ataque de conjuro",
    contra: "su clase de armadura",
    efecto: "El daño que ponga tu ficha. Todos los turnos, sin gastar nada.",
    coste: "accion",
    icono: "libro",
    aviso: "No lleves cuenta de esto: es ilimitado. Lo que se cuenta son los espacios.",
    fuente: "reglas §4",
  },
  {
    id: "conjuro",
    nombre: "Gastar un espacio",
    que: "Sueltas uno de los muy pocos conjuros que tienes.",
    tirada: "lo que diga el conjuro en tu ficha",
    contra: "su salvación contra la CD de tus conjuros",
    efecto: "Lo que haga el conjuro, hasta nivel 2.",
    coste: "accion",
    gasta: "un espacio de conjuro — tienes muy pocos, mira cuántos en tu ficha",
    icono: "pergamino",
    aviso:
      "La primera vez que se lanza un conjuro de nivel 1 o más en una escena del Bosque profundo, " +
      "el DJ tira 1d6: con un 1, algo se ha dado cuenta. A ti eso te debería preocupar más que a nadie.",
    fuente: "reglas §4",
  },
  {
    id: "concentracion",
    nombre: "Mantener la concentración",
    que: "Lo que has soltado dura mientras lo sostengas.",
    tirada: "salvación de Constitución si te hacen daño",
    contra: "CD 10, o la mitad del daño recibido, la que sea más alta",
    efecto: "Si la superas, sigue. Si no, se cae y el espacio está gastado.",
    coste: "ninguno",
    icono: "anillo",
    aviso: "Uno a la vez. Con los espacios que tienes, perder uno se nota mucho.",
    fuente: "reglas §4",
  },
  {
    id: "saber-lo-que-no-se-cuenta",
    nombre: "Saber lo que no se cuenta",
    que: "Sabes cosas que en un pueblo como este es mejor no saber.",
    tirada: "d20 + Arcanos o Religión",
    contra: "la CD que diga el DJ",
    efecto: "Reconoces la marca, el nombre o la clase de trato que hay detrás de esto.",
    coste: "rato",
    icono: "libro",
    aviso: "Si alguien te oye decirlo en voz alta delante de un aldeano, eso tiene consecuencias.",
    fuente: "reglas §1",
  },
  {
    id: "pedirle-algo",
    nombre: "Pedirle algo al que te lo dio",
    que: "Tu poder viene de un trato con algo. Puedes pedir más, y te va a costar.",
    tirada: null,
    contra: null,
    efecto: "Sin regla y sin número: se lo dices al DJ y él te dice el precio antes de aceptar.",
    coste: "rato",
    icono: "fardo",
    aviso:
      "Esto no es un botón: es un gancho de trama. Y si alguna vez te ofrecen devolver a un " +
      "muerto, es mentira o cuesta algo terrible.",
    fuente: "reglas §3 dial 3, §6",
  },
);

// ── Índice y búsqueda por texto de ficha ──────────────────────────────────────────────────────

export const POR_CLASE = Object.freeze({
  guerrero: GUERRERO,
  explorador: EXPLORADOR,
  picaro: PICARO,
  clerigo: CLERIGO,
  druida: DRUIDA,
  mago: MAGO,
  barbaro: BARBARO,
  bardo: BARDO,
  paladin: PALADIN,
  monje: MONJE,
  brujo: BRUJO,
});

/**
 * Las mismas expresiones que `CLASES` de app.js, EN EL MISMO ORDEN, y a propósito: la clase se
 * deduce del texto libre que escribe el DJ en la ficha («Exploradora 2»), y si esta lista y la de
 * app.js discreparan, la banda enseñaría el icono de una clase y la ficha las acciones de otra.
 *
 * El orden importa: se devuelve la primera que encaje. «Hechicero» cae en mago, igual que en
 * app.js: la app no distingue las dos, y un hechicero se maneja con las cartas del mago.
 */
const RE_CLASE = [
  ["guerrero", /guerrer/i],
  ["explorador", /explorador|ranger|explorad/i],
  ["picaro", /pícar|picar|ladr/i],
  ["clerigo", /clérig|clerig|cléri|sacerd/i],
  ["druida", /druid/i],
  ["mago", /mag[oa]|hechicer/i],
  ["barbaro", /bárbar|barbar/i],
  ["bardo", /bard/i],
  ["paladin", /paladí|paladi/i],
  ["monje", /monj/i],
  ["brujo", /bruj/i],
];

/** La clave de clase que sale del texto de la ficha, o null si no se reconoce nada. */
export function claveClaseDe(clase) {
  const t = String(clase ?? "");
  if (!t.trim()) return null;
  for (const [clave, re] of RE_CLASE) if (re.test(t)) return clave;
  return null;
}

/** Un único array vacío congelado, para no crear uno nuevo en cada clase no reconocida. */
const VACIO = Object.freeze([]);

/**
 * Las acciones de una clase. Acepta el texto tal cual está en la ficha («Clériga 2») o la clave
 * («clerigo»). Devuelve SIEMPRE un array: vacío si no se reconoce la clase, para que quien pinte
 * pueda recorrerlo sin comprobar nada. Las comunes van aparte, en COMUNES: se enseñan siempre.
 */
export function accionesDe(clase) {
  const clave = claveClaseDe(clase);
  return clave ? POR_CLASE[clave] : VACIO;
}
