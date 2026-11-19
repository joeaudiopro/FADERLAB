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
// 3) Audio en los teléfonos (Cloudflare Realtime SFU):
//    POST /room/:code/audio/publish → la consola publica la voz traducida de un idioma
//    POST /room/:code/audio/listen  → un teléfono pide escuchar un idioma (recibe oferta SDP)
//    POST /room/:code/audio/answer  → el teléfono devuelve su respuesta SDP
//    El App Secret del SFU nunca sale de aquí.
// 4) Clientes (marca propia y enlace fijo):
//    GET  /clients              → lista de clientes (operador)
//    PUT  /client/:slug         → crear / editar perfil (operador)
//    DELETE /client/:slug       → borrar cliente (operador)
//    PUT  /client/:slug/logo    → subir logo PNG/WebP/JPEG (operador); DELETE lo quita
//    GET  /client/:slug         → perfil público + sala activa (público, enlace del QR)
//    GET  /client/:slug/logo    → imagen del logo (público)
//    Un cliente "permanente" (iglesia, escuela) nunca vence; uno "por evento" tiene fechas.
//    Cada sala nueva de un cliente reemplaza a la anterior: el QR del cliente nunca cambia.
// 5) Códigos de operador y monitoreo:
//    Un código de operador pertenece a un cliente: con él solo se abre y opera la sala de ese
//    cliente (y se piden sesiones de traducción). El código maestro (ACCESS_CODE) puede todo.
//    GET    /me                         → quién soy (maestro u operador de qué cliente)
//    POST   /client/:slug/codes         → crear código de operador {label} (maestro; se muestra una vez)
//    GET    /client/:slug/codes         → listar códigos del cliente (maestro)
//    DELETE /client/:slug/codes/:id     → revocar (maestro)
//    GET    /monitor                    → salas abiertas, oyentes, operador conectado y minutos por cliente (maestro)
// 6) Horas del plan por cliente (quotaH en el perfil, en horas-idioma: 1 h con 2 idiomas = 2 h):
//    GET    /usage/:slug                → consumo del mes contra el plan (maestro, u operador de ese cliente)
//    Al agotarse: el servicio en curso termina normal, pero el operador ya no puede abrir otra sala.
//    Además, un operador solo obtiene sesiones de traducción si la sala de su cliente está abierta.
//
// Secretos (wrangler secret put ...):
//   OPENAI_API_KEY       — clave de la API de OpenAI
//   ACCESS_CODE          — código que piden las páginas del operador
//   REALTIME_APP_ID      — App ID de Cloudflare Realtime SFU (opcional: sin él no hay audio)
//   REALTIME_APP_SECRET  — App Secret de Cloudflare Realtime SFU
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
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_MAX = 400 * 1024;
const CLIENT_CACHE_S = 8; // el público consulta seguido mientras espera: respuesta en caché unos segundos

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
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Access-Code, X-Host-Token",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    if (req.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (url.pathname === "/health") return json({ ok: true }, 200, cors);

    const parts = url.pathname.split("/").filter(Boolean); // ["room", "ABC123", "ws"]

    // ---------- audio de la sala (publicar: operador con token; escuchar: público) ----------
    if (parts[0] === "room" && parts[2] === "audio" && parts.length === 4 && req.method === "POST") {
      if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);
      return audioRoute(parts[1].toUpperCase(), parts[3], req, env, cors);
    }

    // ---------- clientes: rutas públicas ----------
    if (parts[0] === "client" && req.method === "GET" && (parts.length === 2 || (parts.length === 3 && parts[2] === "logo"))) {
      const slug = parts[1].toLowerCase();
      if (!SLUG_RE.test(slug)) return json({ error: "Cliente no encontrado" }, 404, cors);
      if (parts[2] === "logo") {
        const logo = await directory(env).getLogo(slug);
        if (!logo) return new Response("", { status: 404 });
        return new Response(logo.data, { headers: { "Content-Type": logo.type, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
      }
      if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);
      const cache = caches.default, key = new Request(`https://cache.invalid/client/${slug}`);
      let data = null;
      const hit = await cache.match(key);
      if (hit) data = await hit.json();
      else {
        data = await publicClient(slug, env);
        await cache.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": `max-age=${CLIENT_CACHE_S}` } }));
      }
      if (!data) return json({ error: "Cliente no encontrado" }, 404, cors);
      return json(data, 200, cors);
    }

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

    // ---------- de aquí en adelante: solo con código (maestro u operador) ----------
    const isClientRoute = parts[0] === "client" && parts.length >= 2 && (
      (parts.length === 2 && (req.method === "PUT" || req.method === "DELETE")) ||
      (parts[2] === "logo" && parts.length === 3 && (req.method === "PUT" || req.method === "DELETE")) ||
      (parts[2] === "codes" && ((parts.length === 3 && (req.method === "GET" || req.method === "POST")) || (parts.length === 4 && req.method === "DELETE"))));
    const isOperatorRoute = (req.method === "POST" && (url.pathname === "/session" || url.pathname === "/room")) ||
      (req.method === "GET" && (url.pathname === "/clients" || url.pathname === "/me" || url.pathname === "/monitor" || (parts[0] === "usage" && parts.length === 2))) || isClientRoute;
    if (!isOperatorRoute) return json({ error: "No encontrado" }, 404, cors);
    if (!okOrigin) return json({ error: "Origen no permitido" }, 403, cors);
    // Falla cerrado: sin código configurado no se entrega nada.
    if (!env.OPENAI_API_KEY || !env.ACCESS_CODE) return json({ error: "Worker sin configurar (faltan secretos)" }, 500, cors);
    const who = await whoIs(req.headers.get("X-Access-Code") || "", env);
    if (!who) return json({ error: "Código de acceso incorrecto" }, 401, cors);
    if (url.pathname === "/me") {
      if (who.role === "master") return json({ role: "master" }, 200, cors);
      const c = await directory(env).get(who.client);
      return json({ role: "operator", label: who.label, client: c, usage: c ? await clientUsage(env, c) : null }, 200, cors);
    }
    if (parts[0] === "usage") {
      const slug = String(parts[1] || "").toLowerCase();
      if (who.role === "operator" && slug !== who.client) return json({ error: "Este código solo puede ver su cliente" }, 403, cors);
      const c = SLUG_RE.test(slug) ? await directory(env).get(slug) : null;
      if (!c) return json({ error: "Cliente no encontrado" }, 404, cors);
      return json(await clientUsage(env, c), 200, cors);
    }
    // lo que solo puede hacer el maestro
    const masterOnly = url.pathname === "/clients" || url.pathname === "/monitor" || isClientRoute;
    if (masterOnly && who.role !== "master") return json({ error: "Este código solo puede operar la sala de su cliente" }, 403, cors);
    if (url.pathname === "/clients") return json({ clients: await directory(env).list() }, 200, cors);
    if (url.pathname === "/monitor") return json(await monitor(env), 200, cors);
    if (isClientRoute) return clientRoute(parts[1].toLowerCase(), parts[2], req, env, cors, parts[3]);
    let body = {};
    try { body = await req.json(); } catch { /* cuerpo vacío = valores por defecto */ }

    if (url.pathname === "/room") {
      if (who.role === "operator") body.client = who.client; // un operador solo abre salas de su cliente
      return createRoom(body, env, cors, who);
    }
    if (who.role === "operator") {
      // el operador solo traduce con la sala de su cliente abierta, y sin exceder su plan (salvo el servicio en curso)
      const c = await directory(env).get(who.client);
      const st = c?.room ? await env.ROOMS.get(env.ROOMS.idFromName(c.room)).status() : null;
      if (!st || st.ended) return json({ error: "Abre la sala de tu cliente en la consola para iniciar la traducción" }, 403, cors);
      const u = await clientUsage(env, c);
      if (u.over && !st.host) return json({ error: quotaMsg(u), quota: true, contact: CONTACT, usage: u }, 402, cors);
    }
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

// Contacto de ventas que ven los operadores (un solo lugar para cambiarlo: agrega teléfono cuando lo haya).
const CONTACT = { label: "Instagram @joeaudiopro", url: "https://ig.me/m/joeaudiopro" };
const BUSY_MSG = `Esta sala ya se está usando en otra computadora. Si necesitas operar otra sala al mismo tiempo, contacta a FaderLab para contratar un servicio adicional: ${CONTACT.label}.`;

async function createRoom(body, env, cors, who = { role: "master" }) {
  // sala de un cliente: valida vigencia y usa su nombre si no viene título
  let client = null;
  if (body.client) {
    const slug = String(body.client).toLowerCase();
    client = SLUG_RE.test(slug) ? await directory(env).get(slug) : null;
    if (!client) return json({ error: "Cliente no encontrado" }, 404, cors);
    const st = clientStatus(client);
    if (st === "archived") return json({ error: "Este cliente está archivado" }, 400, cors);
    if (st === "expired") return json({ error: "La vigencia de este cliente ya terminó; edita sus fechas para volver a usarlo" }, 400, cors);
    // ¿ya hay otro operador transmitiendo esta sala? Un operador no puede quitársela; el maestro puede forzar.
    if (client.room) {
      const cur = await env.ROOMS.get(env.ROOMS.idFromName(client.room)).status();
      if (cur && !cur.ended && cur.host && !(who.role === "master" && body.force)) {
        return json({ error: BUSY_MSG, busy: true, canForce: who.role === "master", room: client.room, live: cur.live, contact: CONTACT }, 409, cors);
      }
    }
    // horas del plan agotadas: el operador ya no puede abrir otra sala este mes (el maestro sí)
    if (who.role === "operator") {
      const u = await clientUsage(env, client);
      if (u.over) return json({ error: quotaMsg(u), quota: true, contact: CONTACT, usage: u }, 402, cors);
    }
  }
  const title = (String(body.title || "").trim() || client?.name || "").slice(0, 80);
  const langs = [...new Set(Array.isArray(body.langs) ? body.langs.map(String) : [])].filter((l) => LANGS.includes(l));
  const src = !!body.src;
  const audio = !!body.audio && audioConfigured(env);
  if (!langs.length && !src) return json({ error: "Elige al menos un idioma" }, 400, cors);
  if (langs.length > MAX_LANGS) return json({ error: `Máximo ${MAX_LANGS} idiomas por sala` }, 400, cors);

  const hostToken = randomToken(24);
  const tokenHash = await sha256(hostToken);
  for (let i = 0; i < 6; i++) {
    const code = randomCode(6);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const meta = await stub.init({ title, langs, src, audio, tokenHash, ttl: ROOM_TTL, client: client?.slug || null });
    if (meta) {
      if (client) {
        // el enlace del cliente apunta a la sala nueva; la anterior se cierra
        const old = await directory(env).setRoom(client.slug, code);
        if (old && old !== code) await directory(env).untrackRoom(old);
        if (old && old !== code) { try { await env.ROOMS.get(env.ROOMS.idFromName(old)).end(); } catch {} }
        await purgeClient(client.slug);
      }
      await directory(env).trackRoom(code, { code, client: client?.slug || null, title, langs, src, audio, created: Date.now(), expires: meta.expires });
      return json({ code, hostToken, expires: meta.expires, audio, audioAvailable: audioConfigured(env), client: client?.slug || null }, 200, cors);
    }
  }
  return json({ error: "No pude generar un código de sala, intenta de nuevo" }, 500, cors);
}

// ---------- clientes ----------
function directory(env) { return env.DIRECTORY.get(env.DIRECTORY.idFromName("clientes")); }
async function purgeClient(slug) { try { await caches.default.delete(new Request(`https://cache.invalid/client/${slug}`)); } catch {} }

function clientStatus(p, now = Date.now()) {
  if (p.archived) return "archived";
  if (p.type === "event" && p.validUntil && now > p.validUntil) return "expired";
  if (p.type === "event" && p.validFrom && now < p.validFrom) return "upcoming";
  return "active";
}

async function publicClient(slug, env) {
  const p = await directory(env).get(slug);
  if (!p) return null;
  let status = clientStatus(p);
  let room = null;
  if (status === "active" && p.room) {
    const info = await env.ROOMS.get(env.ROOMS.idFromName(p.room)).info();
    if (info && !info.ended) room = { code: p.room, langs: info.langs, src: info.src, audio: info.audio, live: info.live };
  }
  if (status === "active") status = room ? "open" : "waiting";
  return {
    slug: p.slug, name: p.name, type: p.type, message: p.message, bg: p.bg, accent: p.accent,
    poweredBy: p.poweredBy, logo: p.logoRev ? `/client/${p.slug}/logo?v=${p.logoRev}` : null,
    validFrom: p.validFrom || null, validUntil: p.validUntil || null, status, room,
  };
}

function cleanProfile(b, slug, prev) {
  const str = (x, n) => String(x ?? "").trim().slice(0, n);
  const name = str(b.name, 80);
  if (!name) return { error: "Falta el nombre del cliente" };
  const type = b.type === "event" ? "event" : "permanent";
  const num = (x) => (Number.isFinite(+x) && +x > 0 ? Math.round(+x) : null);
  const validFrom = type === "event" ? num(b.validFrom) : null;
  const validUntil = type === "event" ? num(b.validUntil) : null;
  if (type === "event" && !validUntil) return { error: "Un cliente por evento necesita fecha de fin" };
  if (validFrom && validUntil && validFrom > validUntil) return { error: "La fecha de inicio es posterior a la de fin" };
  const langs = [...new Set(Array.isArray(b.langs) ? b.langs.map(String) : [])].filter((l) => LANGS.includes(l)).slice(0, MAX_LANGS);
  const now = Date.now();
  return {
    profile: {
      logoRev: 0, room: null, ...prev,
      slug, name, type, validFrom, validUntil,
      message: str(b.message, 240),
      bg: HEX_RE.test(b.bg) ? b.bg.toLowerCase() : "#0a0a0a",
      accent: HEX_RE.test(b.accent) ? b.accent.toLowerCase() : "#20c8e8",
      langs, src: b.src !== false, audio: b.audio !== false, poweredBy: b.poweredBy !== false,
      quotaH: Number.isFinite(+b.quotaH) && +b.quotaH > 0 ? Math.min(1000, Math.round(+b.quotaH * 100) / 100) : null,
      archived: !!b.archived, created: prev?.created || now, updated: now,
    },
  };
}

function sniffImage(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function clientRoute(slug, sub, req, env, cors, id) {
  if (!SLUG_RE.test(slug)) return json({ error: "Enlace inválido: usa minúsculas, números y guiones (2 a 40)" }, 400, cors);
  const dir = directory(env);
  if (sub === "codes") {
    if (!(await dir.get(slug))) return json({ error: "Cliente no encontrado" }, 404, cors);
    if (req.method === "GET") return json({ codes: await dir.listCodes(slug) }, 200, cors);
    if (req.method === "DELETE") return json({ revoked: await dir.revokeCode(slug, String(id || "")) }, 200, cors);
    let body = {};
    try { body = await req.json(); } catch {}
    const label = String(body.label || "").trim().slice(0, 60) || "Operador";
    const code = operatorCode();
    const rec = await dir.addCode(slug, await sha256(normCode(code)), label);
    return json({ code, ...rec }, 200, cors); // el código en claro solo viaja esta vez
  }
  if (sub === "logo") {
    if (!(await dir.get(slug))) return json({ error: "Cliente no encontrado" }, 404, cors);
    if (req.method === "DELETE") { const p = await dir.setLogo(slug, null, null); await purgeClient(slug); return json({ client: p }, 200, cors); }
    const buf = await req.arrayBuffer();
    if (buf.byteLength > LOGO_MAX) return json({ error: "El logo pesa demasiado (máximo 400 KB)" }, 413, cors);
    const type = sniffImage(buf);
    if (!type) return json({ error: "El logo debe ser PNG, WebP o JPEG" }, 415, cors);
    const p = await dir.setLogo(slug, type, buf);
    await purgeClient(slug);
    return json({ client: p }, 200, cors);
  }
  if (req.method === "DELETE") {
    // borrar cliente: cierra su sala si estaba abierta; su QR mostrará "no encontrado"
    const p = await dir.get(slug);
    if (!p) return json({ error: "Cliente no encontrado" }, 404, cors);
    if (p.room) { try { await env.ROOMS.get(env.ROOMS.idFromName(p.room)).end(); } catch {} }
    if (p.room) await dir.untrackRoom(p.room);
    await dir.remove(slug);
    await purgeClient(slug);
    return json({ deleted: slug }, 200, cors);
  }
  let body = {};
  try { body = await req.json(); } catch {}
  const prev = await dir.get(slug);
  const r = cleanProfile(body, slug, prev);
  if (r.error) return json({ error: r.error }, 400, cors);
  await dir.put(slug, r.profile);
  await purgeClient(slug);
  return json({ client: r.profile, created: !prev }, 200, cors);
}

// ---------- horas del plan ----------
async function clientUsage(env, c) {
  const month = monthKey();
  const storedMs = await directory(env).usageOf(c.slug, month);
  let ongoingMs = 0, live = false, service = false;
  if (c.room) {
    const st = await env.ROOMS.get(env.ROOMS.idFromName(c.room)).status();
    if (st && !st.ended) { ongoingMs = st.ongoingMs || 0; live = st.live; service = st.host; }
  }
  const usedMin = Math.round((storedMs + ongoingMs) / 6000) / 10;
  const quotaMin = c.quotaH ? Math.round(c.quotaH * 60) : null;
  return {
    month, usedMin, quotaMin, live, service,
    remainingMin: quotaMin == null ? null : Math.max(0, Math.round((quotaMin - usedMin) * 10) / 10),
    pct: quotaMin ? Math.round(usedMin / quotaMin * 1000) / 10 : null,
    over: quotaMin != null && usedMin >= quotaMin,
  };
}
const fmtH = (min) => { const m = Math.round(min); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
const quotaMsg = (u) => `Se agotaron las horas de traducción de este mes (${fmtH(u.usedMin)} de ${fmtH(u.quotaMin)}). Para ampliar tu plan, contacta a FaderLab: ${CONTACT.label}.`;

// ---------- códigos y monitoreo ----------
const OP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function operatorCode() {
  // 12 símbolos (~59 bits) en grupos de 4: FXK7-2MQP-9RTA
  let out = "";
  while (out.length < 12) for (const b of crypto.getRandomValues(new Uint8Array(24))) if (b < 248 && out.length < 12) out += OP_ALPHABET[b % 31];
  return out.match(/.{4}/g).join("-");
}
async function whoIs(code, env) {
  if (!code) return null;
  if (await sameText(code, env.ACCESS_CODE)) return { role: "master" };
  const n = normCode(code);
  if (n.length !== 12) return null;
  const op = await directory(env).checkCode(await sha256(n));
  return op ? { role: "operator", client: op.slug, label: op.label, id: op.id } : null;
}
// mes calendario en hora del centro de México (UTC−6, sin horario de verano)
const monthKey = (ms = Date.now()) => new Date(ms - 6 * 3600e3).toISOString().slice(0, 7);
async function monitor(env) {
  const dir = directory(env);
  const [index, clients] = await Promise.all([dir.listRooms(), dir.list()]);
  const names = Object.fromEntries(clients.map((c) => [c.slug, c]));
  const rooms = [];
  await Promise.all(index.map(async (r) => {
    if (r.expires < Date.now()) { await dir.untrackRoom(r.code); return; }
    const st = await env.ROOMS.get(env.ROOMS.idFromName(r.code)).status();
    if (!st || st.ended) { await dir.untrackRoom(r.code); return; }
    const c = r.client ? names[r.client] : null;
    rooms.push({ ...r, clientName: c?.name || null, logo: c?.logoRev ? `/client/${c.slug}/logo?v=${c.logoRev}` : null, ...st });
  }));
  rooms.sort((a, b) => (b.live - a.live) || (b.created - a.created));
  const now = Date.now(), m0 = monthKey(now), d = new Date(now - 6 * 3600e3);
  const m1 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
  return { now, months: [m0, m1], usage: await dir.usage([m0, m1]), clients: clients.map((c) => ({ slug: c.slug, name: c.name, quotaH: c.quotaH || null })), rooms };
}

// Directorio de clientes: un solo Durable Object con todos los perfiles y logos.
export class Directory extends DurableObject {
  async list() { return [...(await this.ctx.storage.list({ prefix: "c:" })).values()].sort((a, b) => a.name.localeCompare(b.name, "es")); }
  async get(slug) { return (await this.ctx.storage.get("c:" + slug)) || null; }
  async put(slug, p) { await this.ctx.storage.put("c:" + slug, p); return p; }
  async setRoom(slug, code) {
    const p = await this.get(slug); if (!p) return null;
    const old = p.room || null; p.room = code; await this.put(slug, p); return old;
  }
  async setLogo(slug, type, data) {
    const p = await this.get(slug); if (!p) return null;
    if (data) { await this.ctx.storage.put("logo:" + slug, { type, data }); p.logoRev = (p.logoRev || 0) + 1; }
    else { await this.ctx.storage.delete("logo:" + slug); p.logoRev = 0; }
    await this.put(slug, p); return p;
  }
  async getLogo(slug) { return (await this.ctx.storage.get("logo:" + slug)) || null; }
  async remove(slug) {
    await this.ctx.storage.delete(["c:" + slug, "logo:" + slug]);
    for (const [k, v] of await this.ctx.storage.list({ prefix: "op:" })) if (v.slug === slug) await this.ctx.storage.delete(k);
    return true;
  }
  // códigos de operador: se guarda solo el hash
  async addCode(slug, hash, label) {
    const rec = { id: hash.slice(0, 10), slug, label, created: Date.now(), lastUsed: null };
    await this.ctx.storage.put("op:" + hash, rec);
    return rec;
  }
  async listCodes(slug) {
    return [...(await this.ctx.storage.list({ prefix: "op:" })).values()].filter((r) => r.slug === slug).sort((a, b) => a.created - b.created);
  }
  async revokeCode(slug, id) {
    for (const [k, v] of await this.ctx.storage.list({ prefix: "op:" })) if (v.slug === slug && v.id === id) { await this.ctx.storage.delete(k); return true; }
    return false;
  }
  async checkCode(hash) {
    const rec = await this.ctx.storage.get("op:" + hash);
    if (!rec) return null;
    const c = await this.get(rec.slug);
    if (!c) return null;
    if (!rec.lastUsed || Date.now() - rec.lastUsed > 3600e3) { rec.lastUsed = Date.now(); await this.ctx.storage.put("op:" + hash, rec); }
    return rec;
  }
  // índice de salas abiertas (para el monitoreo)
  async trackRoom(code, r) { await this.ctx.storage.put("room:" + code, r); }
  async untrackRoom(code) { await this.ctx.storage.delete("room:" + code); }
  async listRooms() { return [...(await this.ctx.storage.list({ prefix: "room:" })).values()]; }
  // minutos-idioma por cliente y mes (lo que cobra OpenAI)
  async addUsage(slug, month, ms) {
    const k = `use:${month}:${slug}`;
    await this.ctx.storage.put(k, ((await this.ctx.storage.get(k)) || 0) + ms);
  }
  async usageOf(slug, month) { return (await this.ctx.storage.get(`use:${month}:${slug}`)) || 0; }
  async usage(months) {
    const out = {};
    for (const m of months) {
      out[m] = {};
      for (const [k, v] of await this.ctx.storage.list({ prefix: `use:${m}:` })) out[m][k.slice(`use:${m}:`.length)] = Math.round(v / 60000 * 10) / 10;
    }
    return out;
  }
}

// ---------- audio: puente con Cloudflare Realtime SFU ----------
function audioConfigured(env) { return !!(env.REALTIME_APP_ID && env.REALTIME_APP_SECRET); }

async function sfu(env, method, path, body) {
  const base = (env.SFU_BASE || "https://rtc.live.cloudflare.com/v1").replace(/\/+$/, "");
  const r = await fetch(`${base}/apps/${env.REALTIME_APP_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.REALTIME_APP_SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  const trackErr = data.tracks?.find?.((t) => t.errorCode);
  if (!r.ok || data.errorCode || trackErr) {
    const e = trackErr || data;
    return { ok: false, error: e.errorDescription || e.errorCode || `Realtime respondió ${r.status}` };
  }
  return { ok: true, data };
}

const isSdp = (x) => typeof x === "string" && x.startsWith("v=") && x.length < 60000;

async function audioRoute(code, action, req, env, cors) {
  if (!CODE_RE.test(code)) return json({ error: "Sala no encontrada" }, 404, cors);
  if (!audioConfigured(env)) return json({ error: "El audio no está configurado en el Worker" }, 503, cors);
  let body = {};
  try { body = await req.json(); } catch {}
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  const lang = String(body.lang || "");

  if (action === "publish") {
    const ok = await stub.canPublish(req.headers.get("X-Host-Token") || "", lang);
    if (ok !== true) return json({ error: ok }, ok === "Token inválido" ? 401 : 400, cors);
    if (!isSdp(body.sdp)) return json({ error: "SDP inválido" }, 400, cors);
    const s = await sfu(env, "POST", "/sessions/new");
    if (!s.ok) return json({ error: s.error }, 502, cors);
    const sid = s.data.sessionId;
    const t = await sfu(env, "POST", `/sessions/${sid}/tracks/new`, {
      sessionDescription: { type: "offer", sdp: body.sdp },
      tracks: [{ location: "local", mid: String(body.mid ?? "0"), trackName: lang }],
    });
    if (!t.ok) return json({ error: t.error }, 502, cors);
    const rev = await stub.setAudio(lang, sid, lang);
    return json({ sdp: t.data.sessionDescription.sdp, rev }, 200, cors);
  }

  if (action === "listen") {
    const pub = await stub.getAudio(lang);
    if (!pub) return json({ error: "Todavía no hay audio para este idioma" }, 404, cors);
    const s = await sfu(env, "POST", "/sessions/new");
    if (!s.ok) return json({ error: s.error }, 502, cors);
    const sid = s.data.sessionId;
    const t = await sfu(env, "POST", `/sessions/${sid}/tracks/new`, {
      tracks: [{ location: "remote", sessionId: pub.sessionId, trackName: pub.trackName }],
    });
    if (!t.ok) return json({ error: t.error }, 502, cors);
    return json({ sessionId: sid, sdp: t.data.sessionDescription.sdp, rev: pub.rev }, 200, cors);
  }

  if (action === "answer") {
    const sid = String(body.sessionId || "");
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(sid) || !isSdp(body.sdp)) return json({ error: "Datos inválidos" }, 400, cors);
    const r = await sfu(env, "PUT", `/sessions/${sid}/renegotiate`, { sessionDescription: { type: "answer", sdp: body.sdp } });
    if (!r.ok) return json({ error: r.error }, 502, cors);
    return json({ ok: true }, 200, cors);
  }
  return json({ error: "No encontrado" }, 404, cors);
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

  async init({ title, langs, src, audio, tokenHash, ttl, client }) {
    if (await this.getMeta()) return null; // código ocupado
    const now = Date.now();
    const meta = { title, langs, src, audio: !!audio, client: client || null, tokenHash, created: now, expires: now + ttl * 1000, live: false, ended: false };
    await this.ctx.storage.put("meta", meta);
    await this.ctx.storage.setAlarm(meta.expires);
    this.meta = meta;
    return meta;
  }

  async info() {
    const m = await this.getMeta();
    if (!m) return null;
    return { title: m.title, langs: m.langs, src: m.src, audio: !!m.audio, client: m.client || null, live: m.live, ended: m.ended, expires: m.expires };
  }

  // ---------- audio ----------
  async canPublish(token, lang) {
    const m = await this.getMeta();
    if (!m || m.ended) return "Sala no encontrada";
    if (!m.audio) return "Esta sala no tiene audio";
    if ((await sha256(token)) !== m.tokenHash) return "Token inválido";
    if (!m.langs.includes(lang)) return "Idioma no disponible";
    return true;
  }
  async setAudio(lang, sessionId, trackName) {
    const audio = (await this.ctx.storage.get("audio")) || {};
    const rev = (audio[lang]?.rev || 0) + 1;
    audio[lang] = { sessionId, trackName, rev };
    await this.ctx.storage.put("audio", audio);
    this.broadcast("l:" + lang, { t: "audio", rev }); // los teléfonos que escuchan se reconectan
    return rev;
  }
  async getAudio(lang) {
    const m = await this.getMeta();
    if (!m || m.ended || !m.audio) return null;
    return ((await this.ctx.storage.get("audio")) || {})[lang] || null;
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
      const pub = m.audio && !m.ended ? ((await this.ctx.storage.get("audio")) || {})[att.lang] : null;
      server.send(JSON.stringify({ t: "init", title: m.title, lang: att.lang, lines, partial: this.partial[att.lang] || "", live: m.live, ended: m.ended, audio: !!m.audio, audioRev: pub ? pub.rev : 0 }));
      if (m.ended) { server.close(1000, "Sala terminada"); return new Response(null, { status: 101, webSocket: client }); }
    } else {
      server.send(JSON.stringify({ t: "hello", title: m.title, langs: m.langs, src: m.src, audio: !!m.audio, expires: m.expires }));
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
      this.lastText = Date.now();
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
      const v = !!msg.v;
      if (v && !m.liveSince) m.liveSince = Date.now();
      if (!v) await this.closeUsage(m);
      m.live = v;
      await this.ctx.storage.put("meta", m);
      this.broadcastListeners({ t: "live", v: m.live });
    } else if (msg.t === "end") {
      await this.end();
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch {}
    this.sendCounts();
    // si se fue el último operador, deja de contar minutos (vuelve a contar cuando reconecte y mande live)
    if ((ws.deserializeAttachment() || {}).role === "host" && !this.hostConnected()) {
      const m = await this.getMeta();
      if (m && m.live && !m.ended) { await this.closeUsage(m); m.live = false; await this.ctx.storage.put("meta", m); this.broadcastListeners({ t: "live", v: false }); }
    }
  }
  hostConnected() {
    return this.ctx.getWebSockets("host").some((w) => w.readyState === 1);
  }
  async closeUsage(m) {
    if (!m.liveSince) return;
    const ms = Math.max(0, Date.now() - m.liveSince) * Math.max(1, m.langs.length);
    m.usedMs = (m.usedMs || 0) + ms;
    m.liveSince = null;
    try { await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("clientes")).addUsage(m.client || "_sueltas", monthKey(), ms); } catch {}
  }
  async status() {
    const m = await this.getMeta();
    if (!m) return null;
    const counts = {}; let total = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const a = ws.deserializeAttachment() || {};
      if (a.role === "listener") { counts[a.lang] = (counts[a.lang] || 0) + 1; total++; }
    }
    const ongoingMs = m.liveSince ? (Date.now() - m.liveSince) * Math.max(1, m.langs.length) : 0; // aún no registrado en el directorio
    const usedMs = (m.usedMs || 0) + ongoingMs;
    return { live: m.live, ended: m.ended, host: this.hostConnected(), counts, total, liveSince: m.liveSince || null, ongoingMs, usedMin: Math.round(usedMs / 6000) / 10, lastText: this.lastText || null };
  }
  async webSocketError() { this.sendCounts(); }

  async alarm() { await this.end(); await this.ctx.storage.deleteAll(); this.meta = null; }

  async end() {
    const m = await this.getMeta();
    if (m && !m.ended) {
      await this.closeUsage(m);
      m.ended = true; m.live = false;
      await this.ctx.storage.put("meta", m);
      for (const l of [...m.langs, "src"]) await this.ctx.storage.delete("lines:" + l);
      await this.ctx.storage.delete("audio");
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
