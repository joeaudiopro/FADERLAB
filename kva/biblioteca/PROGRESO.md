# Biblioteca de equipos · progreso

Biblioteca de modelos reales de la Calculadora de KVA (`kva/biblioteca.js`). Cada consumo sale de una ficha técnica o un manual del fabricante. Si no hay dato leído en una fuente, el modelo no entra y se anota aquí como pendiente.

## Bloques

| Bloque | Estado | Fecha | Modelos |
|---|---|---|---|
| 1 · Integración + amplificadores | ✅ Hecho | 2026-11-19 | 82 |
| 2 · Bocinas activas, consolas, RF | ⏳ Siguiente | — | — |
| 3 · Iluminación | Pendiente | — | — |
| 4 · Video y otros | Pendiente | — | — |
| Mantenimiento semanal | Cuando estén los 4 bloques | — | — |

## Marcas hechas (bloque 1)

| Marca | Modelos | Fuentes |
|---|---|---|
| Powersoft | 19 | powersoft.com; X4, X4L, X8 y T602 de PDF de distribuidores |
| QSC | 21 | qsc.com / qsys.com / qscaudio.com |
| Yamaha | 13 | yamaha.com (manuales y hojas de disipación) |
| Crown | 9 | adn.harmanpro.com |
| d&b audiotechnik | 9 | dbaudio.com |
| L-Acoustics | 7 | copias del manual oficial en sitios de distribuidores y rentadoras (l-acoustics.com redirige a la portada) |
| Crest Audio | 4 | peaveycommercialaudio.com |
| **Total** | **82** | |

## Pendientes

### Amplificadores
- **Lab.gruppen** (PLM 20K44, PLM 12K44, PLM 10000Q, PLM 20000Q, FP 10000Q/14000/7000/6400, D 200:4L, D 120:4L, D 80:4L, D 20:4L, D 10:4L, IPD 2400/1200): la fuente oficial no se pudo leer (cdn.mediavalet.com da error de servidor, cdn-media.empowertribe.com pidió autorización, service-tcgroup.tcelectronic.com prohíbe lectura automática). Las fichas de distribuidor (procom-me.com) no traen consumo. Los datos sólo aparecieron en sitios espejo de manuales (manualmachine.com, manuals.plus), que no se usan. Valores vistos ahí, **sin agregar**, para que Carlos decida: PLM 20K44 1/8 = 3548 W a 120 V; PLM 12K44 = 2817 W; D 200:4L = 3529 W (230 V); D 120:4L = 2817 W; D 80:4L = 1907 W; D 20:4L = 441 W; D 10:4L = 252 W (todos 1/8, ruido rosa, 4 Ω × 4). Reintentar mediavalet y empowertribe.
- **Crown I-Tech 12000HD / 9000HD / 5000HD / 4x3500HD y VRack**: las hojas oficiales "Power Draw & Thermal" (adn.harmanpro.com) salen revueltas al leerlas; no se puede asignar 1/8 y 1/3. Reintentar con otra versión del PDF.
- **Crown MA-12000i, MA-5002VZ, XLS 1502/2502**: sin tabla de consumo en manual/ficha (la de MA-5002VZ usa ciclos de trabajo y sale revuelta).
- **Crest Pro 8200, CPX 900/1500/2600, CKi, CPX 1/2/3**: sin ficha oficial legible; CPX 1 se contradice; CPX 2/3 con columnas revueltas. Pro 9200 (2200/5000 W) y CPX 3800 (1185/2975 W) sólo en sitios espejo de manuales.
- **Yamaha PC9501N / PC6501N**: las hojas redirigen a data.yamaha.com, que no se pudo leer. PX: falta el dato a 1/3 (heatspec dio error).
- **L-Acoustics LA-RAK II**: el manual no da consumo por rack (son 3 × LA12X, uno por fase).
- **QSC PLD a 120 V**: sólo hay hoja a 100 V (se usó con FP 0.95).
- Omitidos a propósito: Crest Ci 20x8 / Ci 30x4 (instalación 70 V, no se rentan).

## Fuentes bloqueadas
- l-acoustics.com/documentation (redirige a la portada) y su blob de Azure (PDF ilegible).
- powersoft.com/api/media/file/… y powersoft.com/files/2019/… (permiso no respondido).
- cdn.mediavalet.com (Lab.gruppen, error de servidor), cdn-media.empowertribe.com (autorización), service-tcgroup.tcelectronic.com (robots).
- data.yamaha.com, manual.yamaha.com (permiso no respondido).
- peaveycommercialaudio.com/wp-content/uploads/2026/01/… (Crest Pro 200, permiso).
- manualshive.com (anti-bots).

## Corridas
- 2026-11-19 · Bloque 1: integración del buscador en la app + 82 amplificadores.
