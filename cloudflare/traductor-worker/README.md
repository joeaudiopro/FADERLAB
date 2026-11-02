# Worker del traductor (faderlab.mx/traductor)

Guarda la clave de OpenAI y entrega a la página un *client secret* efímero (2 min, una sola sesión). La clave nunca llega al navegador. Además pide un **código de acceso** para que nadie más gaste tu saldo.

## Desplegar (una vez)

```bash
cd cloudflare/traductor-worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY   # pega tu clave sk-...
npx wrangler secret put ACCESS_CODE      # inventa un código largo
npx wrangler deploy
```

Con el `wrangler.toml` tal cual, el Worker queda en `https://traductor-api.faderlab.mx` (es la URL que la página usa por defecto). Prueba: `https://traductor-api.faderlab.mx/health` → `{"ok":true}`.

## Recomendaciones

- En el dashboard de OpenAI crea un **proyecto aparte** para esto, con su propia clave y un **límite de gasto** mensual.
- Si alguna vez sospechas que el código se filtró: `npx wrangler secret put ACCESS_CODE` con uno nuevo.
- Para probar en local, sirve la carpeta del repo en `http://localhost:8080` (ya está permitido en `ALLOWED_ORIGINS`).

## Endpoint

`POST /session` · cabecera `X-Access-Code` · cuerpo:

```json
{ "targetLanguage": "en", "noiseReduction": "off | near_field | far_field", "sourceTranscript": true }
```

Respuesta: `{ "value": "ek_...", "expires_at": 1234567890 }`.
