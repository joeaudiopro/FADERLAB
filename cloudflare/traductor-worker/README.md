# Worker del traductor (faderlab.mx/traductor)

Hace dos cosas:

1. **Protege la clave de OpenAI.** Entrega a la página un *client secret* efímero (2 min, una sola sesión). La clave nunca llega al navegador. Todo lo del operador pide un **código de acceso** para que nadie más gaste tu saldo.
2. **Salas de evento (subtítulos por QR).** Cada sala es un Durable Object que recibe los subtítulos de la consola del operador (`/traductor/evento`) y los reparte por WebSocket a los teléfonos del público (`/traductor/escucha`), cada uno en su idioma.
3. **Clientes con marca propia.** Cada cliente tiene logo, colores, mensaje y un enlace fijo (`/traductor/escucha/?c=su-enlace`). Su QR no cambia aunque abras salas nuevas. Los permanentes nunca vencen; los "por evento" muestran "evento terminado" al pasar su fecha de fin. Los perfiles viven en el Durable Object `Directory`.
4. **Audio en los teléfonos.** La consola publica la voz traducida de cada idioma en Cloudflare Realtime (SFU) y cada teléfono escucha solo su idioma. El Worker guarda el App Secret del SFU y hace de intermediario; el navegador nunca lo ve. Es opcional: sin `REALTIME_APP_ID` / `REALTIME_APP_SECRET` las salas funcionan solo con subtítulos.

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
- El despliegue lo hace la GitHub Action `Desplegar Worker del traductor` con los secretos del repo (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPENAI_API_KEY`, `TRADUCTOR_ACCESS_CODE` y, para audio, `REALTIME_APP_ID` y `REALTIME_APP_SECRET`).
- Para probar en local: `npx wrangler dev` (con un archivo `.dev.vars` con los dos secretos) y sirve la carpeta del repo en `http://localhost:8080` (ya está permitido en `ALLOWED_ORIGINS`). En la consola del operador pon `http://127.0.0.1:8787` como URL del Worker; el QR incluirá esa URL automáticamente mientras estés en localhost.

## Endpoints

| Ruta | Quién | Qué |
|---|---|---|
| `POST /session` | operador (`X-Access-Code`) | `{targetLanguage, noiseReduction, sourceTranscript}` → `{value, expires_at}` |
| `POST /room` | operador (`X-Access-Code`) | `{title, langs:["en","fr"], src:true}` → `{code, hostToken, expires}` |
| `GET /room/:code` | público | `{code, title, langs, src, live, ended, expires}` |
| `GET /room/:code/ws?role=host&token=…` | operador | manda `{t:"d",l,x}` (texto parcial), `{t:"s",l,x}` (renglón completo), `{t:"live",v}`, `{t:"end"}`; recibe `{t:"count",c,total}` |
| `GET /room/:code/ws?lang=en` | público | recibe `init` (últimos 40 renglones), `d`, `s`, `live`, `audio` (cambió la publicación de audio), `end` |
| `GET /clients` | operador (`X-Access-Code`) | lista de clientes |
| `PUT /client/:slug` | operador | crea / edita: `{name, type:"permanent"|"event", validFrom, validUntil, message, bg, accent, langs, src, audio, poweredBy, archived}` |
| `PUT` / `DELETE /client/:slug/logo` | operador | sube (PNG/WebP/JPEG, máx. 400 KB) o quita el logo |
| `GET /client/:slug` | público | perfil + `status` (`waiting`, `open`, `upcoming`, `expired`, `archived`) + sala activa |
| `GET /client/:slug/logo` | público | la imagen del logo |
| `POST /room/:code/audio/publish` | operador (`X-Host-Token`) | `{lang, sdp, mid}` (oferta) → `{sdp, rev}` (respuesta del SFU) |
| `POST /room/:code/audio/listen` | público | `{lang}` → `{sessionId, sdp, rev}` (oferta del SFU); 404 si ese idioma aún no transmite |
| `POST /room/:code/audio/answer` | público | `{sessionId, sdp}` (respuesta del teléfono) → `{ok}` |

Las salas duran 24 h y se borran solas. Al terminar una sala se borra su historial.
