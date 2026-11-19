# Biblioteca de equipos · progreso

Biblioteca de modelos reales de la Calculadora de KVA (`kva/biblioteca.js`). Cada consumo sale de una ficha técnica o un manual del fabricante. Si no hay dato leído en una fuente, el modelo no entra y se anota aquí como pendiente.

## Bloques

| Bloque | Estado | Fecha | Modelos |
|---|---|---|---|
| 1 · Integración + amplificadores | ✅ Hecho | 2026-11-19 | 90 |
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
| Lab.gruppen | 8 | copias del manual en sitios de manuales (manualmachine.com, manuals.plus), aprobado por Carlos el 2026-11-19 |
| **Total** | **90** | |

## Pendientes

### Amplificadores
- **Lab.gruppen PLM 20000Q, FP 10000Q/14000/7000/6400, IPD 2400/1200**: sin dato legible ni en copias (la tabla de FP sale revuelta; IPD 2400 sólo placa cortada; PLM 20000Q placa «2400/2950W» sin condición). Fuente oficial: cdn.mediavalet.com (error), cdn-media.empowertribe.com (autorización), service-tcgroup.tcelectronic.com (robots).
- **Crown I-Tech 12000HD / 9000HD / 5000HD / 4x3500HD y VRack**: las hojas oficiales "Power Draw & Thermal" (adn.harmanpro.com) salen revueltas al leerlas; no se puede asignar 1/8 y 1/3. Reintentar con otra versión del PDF.
- **Crown MA-12000i, MA-5002VZ, XLS 1502/2502**: sin tabla de consumo en manual/ficha (la de MA-5002VZ usa ciclos de trabajo y sale revuelta).
- **Crest Pro 8200, CPX 900/1500/2600, CKi, CPX 1/2/3**: sin ficha oficial legible; CPX 1 se contradice; CPX 2/3 con columnas revueltas. Pro 9200 (2200/5000 W) y CPX 3800 (1185/2975 W) sólo en sitios espejo de manuales.
- **Yamaha PC9501N / PC6501N**: las hojas redirigen a data.yamaha.com, que no se pudo leer. PX: falta el dato a 1/3 (heatspec dio error).
- **L-Acoustics LA-RAK II**: el manual no da consumo por rack (son 3 × LA12X, uno por fase).
- **QSC PLD a 120 V**: sólo hay hoja a 100 V (se usó con FP 0.95).
- Omitidos a propósito: Crest Ci 20x8 / Ci 30x4 (instalación 70 V, no se rentan).

## Reglas acordadas con Carlos
- 2026-11-19: se aceptan copias del manual del fabricante en sitios de manuales o espejos cuando la fuente oficial no se puede leer. Esos modelos llevan `copia:1` (en Ninja dice «copia de terceros») y la página muestra un aviso en letra chica.

## Fuentes bloqueadas
- l-acoustics.com/documentation (redirige a la portada) y su blob de Azure (PDF ilegible).
- powersoft.com/api/media/file/… y powersoft.com/files/2019/… (permiso no respondido).
- cdn.mediavalet.com (Lab.gruppen, error de servidor), cdn-media.empowertribe.com (autorización), service-tcgroup.tcelectronic.com (robots).
- data.yamaha.com, manual.yamaha.com (permiso no respondido).
- peaveycommercialaudio.com/wp-content/uploads/2026/01/… (Crest Pro 200, permiso).
- manualshive.com (anti-bots).

## Corridas
- 2026-11-19 · Bloque 1: integración del buscador en la app + 82 amplificadores.
- 2026-11-19 · Ajuste: 8 Lab.gruppen de copias de manuales (aprobado), campo `copia` y aviso de fuentes en la página.
