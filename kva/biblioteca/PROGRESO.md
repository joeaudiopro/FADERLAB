# Biblioteca de equipos · progreso

Biblioteca de modelos reales de la Calculadora de KVA (`kva/biblioteca.js`). Cada consumo sale de una ficha técnica o un manual del fabricante. Si no hay dato leído en una fuente, el modelo no entra y se anota aquí como pendiente.

## Bloques

| Bloque | Estado | Fecha | Modelos |
|---|---|---|---|
| 1 · Integración + amplificadores | ✅ Hecho | 2026-11-19 | 90 |
| 2 · Bocinas activas, consolas, RF | ✅ Hecho | 2026-11-20 | 195 |
| 3 · Iluminación | ⏳ Siguiente | — | — |
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

## Marcas hechas (bloque 2)

| Marca | Modelos | Fuentes |
|---|---|---|
| Yamaha (bocinas) | 27 | yamaha.com; 7 de copias (fullcompass, manualmachine, etc.) |
| QSC (bocinas) | 22 | qsc.com; algunas copias. Sólo publica 1/8 → w3 estimado |
| dBTechnologies | 24 | manuales en dbtechnologies.com (1/8 y 1/3 de ficha) |
| Electro-Voice | 9 | electrovoice.com |
| JBL | 5 | copias de fichas (jblpro.com dio error) |
| Mackie | 5 | mackie.com (consumo sin condición, tomado como 1/8) |
| Martin Audio | 1 | martin-audio.com |
| Yamaha (consolas/Rio) | 15 | yamaha.com; QL y DM7 de copias |
| Allen & Heath | 20 | casi todas copias de distribuidores; A&H publica "W max" |
| DiGiCo | 19 | digico.biz + nota técnica TN70 "UPS Power Use" |
| Midas | 4 | copias (manualslib, manuals.plus) |
| Behringer | 2 | copias |
| Soundcraft | 1 | copia |
| Shure | 26 | pubs.shure.com y copias de fichas |
| Sennheiser | 15 | docs.cloud.sennheiser.com y copias |
| **Total** | **195** | |

## Pendientes

### Bloque 2 · sólo dato máximo (no entran hasta que Carlos decida el criterio)
- **Meyer Sound (20):** LEOPARD, 900-LFC, 1100-LFC, PANTHER, 2100-LFC, 750-LFC, LINA, ULTRA-X40/X42, X20/22/23, X80/82, UPQ-D1, 700-HP, UPA-1P, UPJ-1P, MJF-212A, MICA, MILO 120, MINA, 650-P, UMS-1P. Las fichas sólo dan idle / continuo >10 s / burst <1 s / pico, a 115 y 230 V. PANTHER, 2100-LFC, ULTRA-X80 y 1100-LFC son sólo 200–240 V (v:'2').
- **Martin Audio CDD-LIVE 8/12/15, SXP118:** "Nominal power consumption 550 W", igual al "550W Max" de BlacklineX XP12; parece máximo. BlacklineX XP12 (550 W máx.) y XP118 (1000 W máx.).
- **RCF HDL 30-A, HDL 6-A, HDL 26-A:** sólo corriente "long term" 3.15–3.2 A a 230 V / 6.3 A a 115 V (coincide con el fusible).
- **Behringer B212D/B215D (600 W máx.), B208D/B210D (300 W máx.); JBL PRX800W ("Full Power" 450/600 W); JBL SRX910LA (idle/continuo/pico); dBTechnologies DVA T8/T12 (placa 1320/3680 W, parece límite del powerCON).**

### Bloque 2 · sin dato o sin leer
- Bocinas: RCF ART 9xx, HDL 10-A/20-A/50-A, SUB 8004/8006/9004-AS, SUB 705-AS II, NX, TT+; dBT SUB 928, DVA T4, ES 503 (campos vacíos); JBL PRX915/918XLF/ONE, EON700, IRX, SRX906LA; EV ZLX G2 (sin cifra), ETX-12P, EVOLVE, EVERSE; Mackie Thump115S/118S, SRT, DRM; Yamaha DHR12M, DBR12 (tabla ambigua), DXL1K; QSC LS218, LS112; Meyer LYON, LEO-M, 500-HP, MJF-210, CQ-1/2, MILO; Martin XP15 (PDF falló).
- Consolas: Yamaha DM7 Compact, TF-Rack, Tio1608-D2, toda la familia Rivage PM (dato en manual.yamaha.com, bloqueado); A&H S3000, DM64, CDM64, AR2412, Qu-16/24, SQ ahm; DiGiCo SD12-96; Midas HD96-24, M32R, DL16, DL251, PRO (manuales sin W); Behringer X32 Compact/Producer/Rack, Wing Compact/Rack, S16/S32/SD16/SD8, XR18 (copias en manualslib localizadas, sin leer); Soundcraft Vi (Vi1000 sin dato), Ui24R.
- RF: Shure UA844+SWB (sin consumo propio), SBC220, SBC450; Sennheiser ASA 214, Spectera.

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
- jblpro.com (error), m.musictribe.com (robots), rcf.it (descargas devuelven HTML), sennheiser.com/globalassets (redirige a optimizely), pubs.shure.com/guide (permiso), soundhouse.co.jp (robots), datasheets binarios de electrovoice.com (robots).

## Corridas
- 2026-11-19 · Bloque 1: integración del buscador en la app + 82 amplificadores.
- 2026-11-19 · Ajuste: 8 Lab.gruppen de copias de manuales (aprobado), campo `copia` y aviso de fuentes en la página.
- 2026-11-20 · Bloque 2: 195 modelos (93 bocinas/subs/line arrays activos, 62 consolas/stageboxes/racks, 41 RF e in-ears). Meyer y 4 Martin Audio fuera por tener sólo máximos.
