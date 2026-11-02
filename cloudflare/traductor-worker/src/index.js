// FaderLab · Traductor — Worker de Cloudflare
// Única función: guardar la clave de OpenAI y entregar al navegador un
// "client secret" efímero (dura 2 min, solo sirve para abrir UNA sesión
// de traducción). La clave real nunca sale de aquí.
//
// Secretos (wrangler secret put ...):
//   OPENAI_API_KEY  — clave de la API de OpenAI
//   ACCESS_CODE     — código que pide la página antes de traducir
// Variables (wrangler.toml):
//   ALLOWED_ORIGINS — orígenes permitidos, separados por coma

const LANGS = new Set(["es", "en", "pt", "fr", "de", "it", "ja", "zh", "ko", "ru", "hi", "id", "vi"]);
const NOISE = new Set(["near_field", "far_field"]);
const SECRET_TTL = 120; // segundos para conectar; la sesión sigue viva después

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://faderlab.mx")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    if (req.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (url.pathname === "/health") return json({ ok: true }, 200, cors);
    if (url.pathname !== "/session" || req.method !== "POST") return json({ error: "No encontrado" }, 404, cors);
    if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);

    // Falla cerrado: sin código configurado no se entrega nada.
    if (!env.OPENAI_API_KEY || !env.ACCESS_CODE) return json({ error: "Worker sin configurar (faltan secretos)" }, 500, cors);
    if (!(await sameText(req.headers.get("X-Access-Code") || "", env.ACCESS_CODE))) {
      return json({ error: "Código de acceso incorrecto" }, 401, cors);
    }

    let body = {};
    try { body = await req.json(); } catch { /* cuerpo vacío = valores por defecto */ }
    const language = String(body.targetLanguage || "es");
    if (!LANGS.has(language)) return json({ error: "Idioma de salida no soportado" }, 400, cors);

    const input = {};
    if (body.sourceTranscript !== false) input.transcription = { model: "gpt-realtime-whisper" };
    input.noise_reduction = NOISE.has(body.noiseReduction) ? { type: body.noiseReduction } : null;

    const upstream = await fetch("https://api.openai.com/v1/realtime/translations/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: SECRET_TTL },
        session: {
          model: "gpt-realtime-translate",
          audio: { input, output: { language } },
        },
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.value) {
      const msg = data?.error?.message || `OpenAI respondió ${upstream.status}`;
      return json({ error: msg }, upstream.ok ? 502 : upstream.status, cors);
    }
    // Solo lo necesario: nunca reenviar nada más de la respuesta.
    return json({ value: data.value, expires_at: data.expires_at }, 200, cors);
  },
};

async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
