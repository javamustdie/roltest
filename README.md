# Centro de mandos — El Diezmo de Corvalar

Aplicación web de mesa para dirigir una partida de rol. **Esto es solo la interfaz**: el kit del
Director de Juego (la aventura, las reglas y los secretos) vive en otro sitio y no se publica.

## Instalarla en el tablet

1. Abre la URL de este sitio en el navegador del tablet.
2. Menú → **«Añadir a la pantalla de inicio»**. Queda con icono y a pantalla completa.
3. En **Ajustes**, pega tus claves de API. Se guardan **solo en el dispositivo**, en
   `localStorage`, y no viajan a ningún sitio salvo al servicio al que pertenecen.

Funciona **sin conexión** una vez instalada: la escena, el arte, el mapa, el estado del grupo y
la narración pregenerada están en caché. Solo hablar con el DJ necesita red.

## Qué necesitas

| Para qué | Servicio |
|---|---|
| Voz del DJ y transcripción de lo que decís | [ElevenLabs](https://elevenlabs.io) |
| El cerebro del DJ | [API de Claude](https://console.anthropic.com) |

Sin claves la app se abre igual y se puede ver la escena, el mapa y el grupo; lo que no funciona
es el botón de hablar.

## Aviso

Las claves las pone el dueño del dispositivo y se quedan en él. **Si prestas el tablet, bórralas
en Ajustes.** El repositorio no contiene ninguna clave.

---

Reglas derivadas del SRD 5.2 de Wizards of the Coast, CC-BY-4.0.
Generado desde el kit de campaña; no se edita a mano.
