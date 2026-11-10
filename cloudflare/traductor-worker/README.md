# Worker del traductor (faderlab.mx/traductor)

Hace dos cosas:

1. **Protege la clave de OpenAI.** Entrega a la página un *client secret* efímero (2 min, una sola sesión). La clave nunca llega al navegador. Todo lo del operador pide un **código de acceso** para que nadie más gaste tu saldo.
2. **Salas de evento (subtítulos por QR).** Cada sala es un Durable Object que recibe los subtítulos de la consola del operador (`/traductor/evento`) y los reparte por WebSocket a los teléfonos del público (`/traductor/escucha`), cada uno en su idioma.

## Desplegar (una vez)

```bash
cd cloudflare/traductor-worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY   # pega tu clave sk-...
npx wrangler secret put ACCESS_CODE      # inventa un código largo
npx wrangler deploy
```

Con el `wrangler.toml` tal cual, el Worker queda en `https://traductor-api.faderlab.mx` (es la URL que las páginas usan por defecto). Prueba: `https://traductor-api.faderlab.mx/health` → `{"ok":true}`.

El primer `deploy` crea también el Durable Object de las salas (migración `v1`); no hay que hacer nada más.

## Recomendaciones

- En el dashboard de OpenAI crea un **proyecto aparte** para esto, con su propia clave y un **límite de gasto** mensual.
- Si alguna vez sospechas que el código se filtró: `npx wrangler secret put ACCESS_CODE` con uno nuevo.
- Para probar en local: `npx wrangler dev` (con un archivo `.dev.vars` con los dos secretos) y sirve la carpeta del repo en `http://localhost:8080` (ya está permitido en `ALLOWED_ORIGINS`). En la consola del operador pon `http://127.0.0.1:8787` como URL del Worker; el QR incluirá esa URL automáticamente mientras estés en localhost.

## Endpoints

| Ruta | Quién | Qué |
|---|---|---|
| `POST /session` | operador (`X-Access-Code`) | `{targetLanguage, noiseReduction, sourceTranscript}` → `{value, expires_at}` |
| `POST /room` | operador (`X-Access-Code`) | `{title, langs:["en","fr"], src:true}` → `{code, hostToken, expires}` |
| `GET /room/:code` | público | `{code, title, langs, src, live, ended, expires}` |
| `GET /room/:code/ws?role=host&token=…` | operador | manda `{t:"d",l,x}` (texto parcial), `{t:"s",l,x}` (renglón completo), `{t:"live",v}`, `{t:"end"}`; recibe `{t:"count",c,total}` |
| `GET /room/:code/ws?lang=en` | público | recibe `init` (últimos 40 renglones), `d`, `s`, `live`, `end` |

Las salas duran 24 h y se borran solas. Al terminar una sala se borra su historial.
