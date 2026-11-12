// FaderLab · Traductor — Worker de Cloudflare
//
// 1) POST /session  → entrega al navegador un "client secret" efímero de OpenAI
//    (2 min, una sola sesión). La clave real nunca sale de aquí.
// 2) Salas de evento (subtítulos por QR):
//    POST /room              → crea una sala (requiere código de acceso)
//    GET  /room/:code        → datos públicos de la sala (título, idiomas)
//    GET  /room/:code/ws     → WebSocket: operador (?role=host&token=) o público (?lang=)
//    Cada sala es un Durable Object que reenvía los subtítulos de cada idioma
//    a todos los teléfonos conectados a ese idioma.
//
// Secretos (wrangler secret put ...):
//   OPENAI_API_KEY  — clave de la API de OpenAI
//   ACCESS_CODE     — código que piden las páginas del operador
// Variables (wrangler.toml):
//   ALLOWED_ORIGINS — orígenes permitidos, separados por coma

import { DurableObject } from "cloudflare:workers";

const LANGS = ["es", "en", "pt", "fr", "de", "it", "ja", "zh", "ko", "ru", "hi", "id", "vi"];
const NOISE = new Set(["near_field", "far_field"]);
const SECRET_TTL = 120;          // segundos para conectar; la sesión sigue viva después
const ROOM_TTL = 24 * 3600;      // una sala vive 24 h
const MAX_LANGS = 8;
const KEEP_LINES = 40;           // renglones que recibe quien llega tarde
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O, 1/I/L
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

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
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    if (req.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (url.pathname === "/health") return json({ ok: true }, 200, cors);

    const parts = url.pathname.split("/").filter(Boolean); // ["room", "ABC123", "ws"]

    // ---------- salas: rutas públicas (el público no lleva código) ----------
    if (parts[0] === "room" && parts.length >= 2 && req.method === "GET") {
      if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);
      const code = parts[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "Sala no encontrada" }, 404, cors);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (parts[2] === "ws") {
        if (req.headers.get("Upgrade") !== "websocket") return json({ error: "Se esperaba WebSocket" }, 426, cors);
        return stub.fetch(req);
      }
      const info = await stub.info();
      if (!info) return json({ error: "Sala no encontrada" }, 404, cors);
      return json({ code, ...info }, 200, cors);
    }

    // ---------- de aquí en adelante: solo el operador ----------
    if (req.method !== "POST" || (url.pathname !== "/session" && url.pathname !== "/room")) {
      return json({ error: "No encontrado" }, 404, cors);
    }
    if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);
    // Falla cerrado: sin código configurado no se entrega nada.
    if (!env.OPENAI_API_KEY || !env.ACCESS_CODE) return json({ error: "Worker sin configurar (faltan secretos)" }, 500, cors);
    if (!(await sameText(req.headers.get("X-Access-Code") || "", env.ACCESS_CODE))) {
      return json({ error: "Código de acceso incorrecto" }, 401, cors);
    }
    let body = {};
    try { body = await req.json(); } catch { /* cuerpo vacío = valores por defecto */ }

    if (url.pathname === "/room") return createRoom(body, env, cors);
    return createSession(body, env, cors);
  },
};

async function createSession(body, env, cors) {
  const language = String(body.targetLanguage || "es");
  if (!LANGS.includes(language)) return json({ error: "Idioma de salida no soportado" }, 400, cors);

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
}

async function createRoom(body, env, cors) {
  const title = String(body.title || "").trim().slice(0, 80);
  const langs = [...new Set(Array.isArray(body.langs) ? body.langs.map(String) : [])].filter((l) => LANGS.includes(l));
  const src = !!body.src;
  if (!langs.length && !src) return json({ error: "Elige al menos un idioma" }, 400, cors);
  if (langs.length > MAX_LANGS) return json({ error: `Máximo ${MAX_LANGS} idiomas por sala` }, 400, cors);

  const hostToken = randomToken(24);
  const tokenHash = await sha256(hostToken);
  for (let i = 0; i < 6; i++) {
    const code = randomCode(6);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const meta = await stub.init({ title, langs, src, tokenHash, ttl: ROOM_TTL });
    if (meta) return json({ code, hostToken, expires: meta.expires }, 200, cors);
  }
  return json({ error: "No pude generar un código de sala, intenta de nuevo" }, 500, cors);
}

// =====================================================================
// Sala: un Durable Object por código. Usa WebSockets "hibernables":
// Cloudflare mantiene las conexiones aunque el objeto se duerma.
// =====================================================================
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.meta = undefined;   // se carga del storage
    this.partial = {};       // renglón en curso por idioma (solo memoria)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async getMeta() {
    if (this.meta === undefined) this.meta = (await this.ctx.storage.get("meta")) || null;
    return this.meta;
  }

  async init({ title, langs, src, tokenHash, ttl }) {
    if (await this.getMeta()) return null; // código ocupado
    const now = Date.now();
    const meta = { title, langs, src, tokenHash, created: now, expires: now + ttl * 1000, live: false, ended: false };
    await this.ctx.storage.put("meta", meta);
    await this.ctx.storage.setAlarm(meta.expires);
    this.meta = meta;
    return meta;
  }

  async info() {
    const m = await this.getMeta();
    if (!m) return null;
    return { title: m.title, langs: m.langs, src: m.src, live: m.live, ended: m.ended, expires: m.expires };
  }

  async fetch(req) {
    const m = await this.getMeta();
    if (!m) return new Response("Sala no encontrada", { status: 404 });
    const url = new URL(req.url);
    let tag, att;
    if (url.searchParams.get("role") === "host") {
      if (m.ended) return new Response("Sala terminada", { status: 410 });
      if ((await sha256(url.searchParams.get("token") || "")) !== m.tokenHash) return new Response("Token inválido", { status: 401 });
      tag = "host"; att = { role: "host" };
    } else {
      const lang = url.searchParams.get("lang") || "";
      if (!(m.langs.includes(lang) || (lang === "src" && m.src))) return new Response("Idioma no disponible", { status: 400 });
      tag = "l:" + lang; att = { role: "listener", lang };
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [tag]);
    server.serializeAttachment(att);

    if (att.role === "listener") {
      const lines = m.ended ? [] : (await this.ctx.storage.get("lines:" + att.lang)) || [];
      server.send(JSON.stringify({ t: "init", title: m.title, lang: att.lang, lines, partial: this.partial[att.lang] || "", live: m.live, ended: m.ended }));
      if (m.ended) { server.close(1000, "Sala terminada"); return new Response(null, { status: 101, webSocket: client }); }
    } else {
      server.send(JSON.stringify({ t: "hello", title: m.title, langs: m.langs, src: m.src, expires: m.expires }));
    }
    this.sendCounts();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const att = ws.deserializeAttachment() || {};
    if (att.role !== "host" || typeof raw !== "string") return; // el público solo manda "ping" (auto-respuesta)
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const m = await this.getMeta();
    if (!m || m.ended) return;
    const ok = (l) => m.langs.includes(l) || (l === "src" && m.src);

    if (msg.t === "d" && ok(msg.l) && typeof msg.x === "string") {
      const x = msg.x.slice(0, 2000);
      this.partial[msg.l] = ((this.partial[msg.l] || "") + x).slice(-4000);
      this.broadcast("l:" + msg.l, { t: "d", x });
    } else if (msg.t === "s" && ok(msg.l)) {
      // fin de renglón: el operador manda el texto definitivo (por si alguien llegó a medias)
      const line = String(msg.x ?? this.partial[msg.l] ?? "").trim().slice(0, 4000);
      this.partial[msg.l] = "";
      if (!line) return;
      const key = "lines:" + msg.l;
      const lines = (await this.ctx.storage.get(key)) || [];
      lines.push({ x: line, ts: Date.now() });
      await this.ctx.storage.put(key, lines.slice(-KEEP_LINES));
      this.broadcast("l:" + msg.l, { t: "s", x: line });
    } else if (msg.t === "live") {
      m.live = !!msg.v;
      await this.ctx.storage.put("meta", m);
      this.broadcastListeners({ t: "live", v: m.live });
    } else if (msg.t === "end") {
      await this.end();
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch {}
    this.sendCounts();
  }
  async webSocketError() { this.sendCounts(); }

  async alarm() { await this.end(); await this.ctx.storage.deleteAll(); this.meta = null; }

  async end() {
    const m = await this.getMeta();
    if (m && !m.ended) {
      m.ended = true; m.live = false;
      await this.ctx.storage.put("meta", m);
      for (const l of [...m.langs, "src"]) await this.ctx.storage.delete("lines:" + l);
    }
    this.partial = {};
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ t: "end" })); ws.close(1000, "Sala terminada"); } catch {}
    }
  }

  broadcast(tag, obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets(tag)) { try { ws.send(s); } catch {} }
  }
  broadcastListeners(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() || {}).role === "listener") { try { ws.send(s); } catch {} }
    }
  }
  sendCounts() {
    const c = {}; let total = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue; // WebSocket.OPEN
      const a = ws.deserializeAttachment() || {};
      if (a.role === "listener") { c[a.lang] = (c[a.lang] || 0) + 1; total++; }
    }
    this.broadcast("host", { t: "count", c, total });
  }
}

// ---------- utilidades ----------
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}
async function sha256(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomCode(n) {
  // rechazo de sesgo: 31 símbolos, descartamos bytes >= 248
  let out = "";
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (b < 248 && out.length < n) out += CODE_ALPHABET[b % 31];
    }
  }
  return out;
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
