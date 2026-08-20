## Job Matcher

Sube tu CV (PDF) o pega tu LinkedIn, Claude extrae tus skills/años de experiencia, y busca ofertas en Adzuna (API) + LinkedIn/InfoJobs/Tecnoempleo (scraping).

### Setup

```bash
npm install
docker compose up -d      # Postgres local en :5432
cp .env.example .env      # y rellena las claves
npm run db:migrate
npm run dev
```

Variables de `.env`:

| Variable | Obligatoria | Notas |
| --- | --- | --- |
| `DATABASE_URL` | sí | Postgres. La de `.env.example` apunta al contenedor local. |
| `DIRECT_URL` | sí | Conexión sin pooler, solo para migraciones. En local, la misma que `DATABASE_URL`. |
| `AUTH_SECRET` | sí | `openssl rand -base64 32`. La app se niega a arrancar con el placeholder (ver `src/instrumentation.ts`). |
| `AUTH_URL` | en producción | URL pública de la app. |
| `ANTHROPIC_API_KEY` | para analizar CVs | https://console.anthropic.com |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | opcional | https://developer.adzuna.com (gratis, agrega Indeed y otros). Sin ellas, Adzuna se salta. |
| `CRON_SECRET` | opcional | Protege `POST /api/cron/scrape` y `GET /api/cron/status`. Mínimo 16 caracteres. |

`AUTH_SECRET` y `AUTH_URL` son los nombres de next-auth v5. Los antiguos
`NEXTAUTH_SECRET` / `NEXTAUTH_URL` siguen funcionando como fallback.

### Deploy en Railway

La app y Postgres van en Railway; el worker de scraping **no** (ver
[Correr el worker](#correr-el-worker)).

1. **Postgres**: en el proyecto, *New → Database → PostgreSQL*.
2. **App**: *New → GitHub Repo*, apuntando a este repo. `railway.json` ya define
   build, migraciones y arranque, así que no hay que configurar comandos.
3. **Variables** del servicio de la app:

   ```
   DATABASE_URL   = ${{Postgres.DATABASE_URL}}
   DIRECT_URL     = ${{Postgres.DATABASE_URL}}
   AUTH_SECRET    = <openssl rand -base64 32>
   AUTH_URL       = https://<tu-dominio>.up.railway.app
   ANTHROPIC_API_KEY = ...
   ADZUNA_APP_ID  = ...
   ADZUNA_APP_KEY = ...
   ```

   `DIRECT_URL` puede ser la misma URL: el Postgres de Railway no va detrás de
   un pooler. En Neon o Supabase sí, y ahí tiene que ser la conexión directa o
   las migraciones fallan.

4. **Dominio**: *Settings → Networking → Generate Domain*, y pon esa URL en
   `AUTH_URL`. Sin eso el login redirige mal.

Notas del pipeline:

- `postinstall` ejecuta `prisma generate`, así el cliente nunca queda
  desactualizado en un build con `node_modules` cacheado.
- Las migraciones corren en `preDeployCommand` (`npm run db:deploy`), no en el
  build: ahí ya existen las variables de runtime y la versión nueva no recibe
  tráfico hasta que terminan. **En otras plataformas sin fase pre-deploy, lanza
  `npm run db:deploy` a mano antes de `npm start`.**
- `next start` escucha en `0.0.0.0` y respeta `PORT`, que es lo que Railway
  inyecta. No hace falta ningún flag.
- SQLite no sirve en ningún caso: el filesystem del contenedor es efímero.

### Límites y protección

- Rate limits por usuario/IP en Postgres (`src/lib/rateLimit.ts`): 10
  subidas/hora, 60 búsquedas/hora, 5 registros/hora por IP. Están en la DB y no
  en memoria a propósito: en serverless cada instancia arrancaría con un
  contador vacío.
- Login (`src/lib/auth.ts`): 10 intentos fallidos por email y 20 por IP cada 15
  minutos. Solo cuentan los **fallos**, así que entrar bien nunca gasta cuota y
  nadie se bloquea a sí mismo. Se limita por email además de por IP porque
  `clientIp` se fía de `x-forwarded-for`, y un atacante puede variar esa
  cabecera a voluntad; el límite por email es el que aguanta un ataque
  distribuido contra una sola cuenta. Al pasarse, el login devuelve
  `code=rate_limited` y la UI lo distingue de una contraseña incorrecta.
- Subida de CV: máximo 5 MB y solo `application/pdf`. Cada subida es una llamada
  de pago a Claude.
- La salida del modelo se valida con zod antes de tocar la DB
  (`src/lib/extractSkills.ts`).
- Borrar la cuenta pide la contraseña otra vez: 5 fallos por cuenta cada 15
  minutos, y solo cuentan los fallos.

### Datos personales

Se guarda el **texto completo** del CV (`Profile.cvText`) porque es lo que se le
manda al modelo para extraer skills. Es el dato más sensible de la app, así que
hay tres acciones, todas desde *Tus datos* en el dashboard:

| Acción | Endpoint | Qué hace |
| --- | --- | --- |
| Descargar | `GET /api/account/export` | JSON con usuario, perfil, `cvText` íntegro y skills. |
| Borrar el CV | `DELETE /api/profile` | Borra `Profile` y, por cascada, `Skill`. La cuenta sigue. Idempotente. |
| Borrar la cuenta | `DELETE /api/account` | Borra `User`; `Profile` y `Skill` caen por `ON DELETE CASCADE`. Pide la contraseña. |

Al borrar la cuenta se limpian además las filas de `RateLimit` que identifican a
esa persona (`upload:`, `search:`, `export:`, `account-delete:` y
`login:email:`). Las que van por IP (`login:ip:`, `register:`) **no** se tocan:
son compartidas con cualquiera detrás de esa dirección, y borrarlas a petición
sería una forma de resetear un contador de fuerza bruta cuando te convenga.

**Aviso sobre la sesión.** Con `strategy: "jwt"` no hay sesiones en servidor, así
que el token que ya tiene el navegador sigue siendo criptográficamente válido
hasta que caduque, aunque la cuenta ya no exista — no hay nada que revocar. Por
eso el cliente hace `signOut()` justo después de borrar. Un token robado en ese
hueco no da acceso a nada: las rutas comprueban que el usuario exista y
responden 401 (`/api/account`, `/api/account/export`, `/api/profile/upload`).
`/api/profile/upload` lo comprueba **antes** del parseo del PDF y de la llamada
de pago a Claude, para que un token huérfano no pueda gastar dinero.

### Tests y CI

```bash
npm test          # vitest, una pasada
npm run test:watch
```

Cubren lo que se rompe solo: el mapeo de HTML a `NormalizedJob` de los tres
scrapers (selectores, ids, modalidad, URLs sin query string), la construcción
de los filtros de cada portal (`f_WT`, `en_remoto`), el parseo de Adzuna, y el
manejo de la respuesta del modelo en `extractSkills.ts` (JSON entre prosa,
duplicados, tope de 100 skills, respuesta cortada por `max_tokens`) y los
umbrales de salud de `scrapeHealth.ts`. Todas las fuentes se prueban con `fetch`
stubeado: los tests no salen a la red ni tocan Postgres.

**Lo que estos tests NO detectan:** que LinkedIn, InfoJobs o Tecnoempleo cambien
su markup. Los fixtures de `src/lib/jobSources/__fixtures__/` están escritos a
mano, así que verifican que *nuestro* parseo no se rompa, no que el HTML real
siga siendo ese. Para eso el aviso es de producción: si una fuente empieza a
devolver cero ofertas de forma sostenida, es que cambió el markup — y eso es
justo lo que reporta `GET /api/cron/status` como `degraded`
(ver [Monitorización](#monitorización)).

`.github/workflows/ci.yml` corre en cada push y PR:

- **check**: `typecheck`, `lint`, `test` y `build`. El build va **sin secretos a
  propósito**: la validación de entorno ocurre al arrancar el servidor
  (`src/instrumentation.ts`), no al construir, y este paso es lo que mantiene
  esa propiedad.
- **migrations**: levanta un Postgres, aplica las migraciones sobre una base
  vacía y comprueba con `prisma migrate diff --exit-code` que `schema.prisma` no
  se ha ido por su cuenta. Sin esto, un cambio de schema sin migración solo
  falla en el `preDeployCommand` de Railway, con el deploy ya a medias.

### Arquitectura de búsqueda

Ninguna petición de usuario toca un sitio scrapeado. Hay dos caminos separados:

```
worker (cron)  ──scrape──>  LinkedIn / InfoJobs / Tecnoempleo  ──>  JobListing
                                                                        │
usuario  ──>  /api/jobs/search  ──lee──────────────────────────────────┘
                    └──live──>  Adzuna (API oficial, con key)
```

#### Cómo se puntúa una oferta

El ranking se calcula **en SQL, antes del LIMIT**. Ordenar en JS lo que ya
llegó recortado por fecha escondería justo las mejores coincidencias.

Cada skill suma **3 si aparece en el título y 1 si aparece en la descripción**,
así que una oferta con tres de tus skills en el título gana a otra que menciona
seis en el cuerpo. La respuesta trae `score` y `matchedSkills`, y la UI enseña
por qué encaja cada oferta. Los resultados de Adzuna se puntúan con la misma
regla en JS (`src/lib/matching.ts`) para que la lista combinada tenga un orden
coherente.

Las skills se buscan **por palabra completa**, no como subcadena: si no, "Go"
casa con "Django" y "R" con "React", que es lo que convierte una lista de skills
en ruido. El límite de palabra se aplica solo en los lados donde la skill
termina en carácter de palabra, porque anclar el final de "C++" no casaría nunca
("+" no lo es). Limitación conocida: "C" sí casa con "C++" y "C#", porque ahí la
C es palabra completa. Se documenta en vez de añadir reglas ad-hoc que romperían
el matching de "C++" y "C#".

#### Índices

`prisma/migrations/20260819000000_add_trigram_indexes` activa `pg_trgm` y crea
dos índices GIN, sobre `title` y `description`. Sin ellos cada búsqueda es un
scan secuencial de toda la tabla: el matching usa comodín por la izquierda, que
ningún btree puede servir.

Medido sobre 60.000 ofertas:

| Consulta | Plan | Tiempo |
| --- | --- | --- |
| Skill de 3+ caracteres | Bitmap Index Scan | ~0,3 ms |
| Lo mismo sin los índices | Seq Scan | ~110 ms |
| Con una skill de 1-2 caracteres en el conjunto | Seq Scan | ~250 ms |

Dos cosas que cuestan caro y no son obvias:

- **`COALESCE(description, '')` inutiliza el índice.** No hace falta: en un
  `WHERE`, `NULL ~* patrón` da NULL y la fila se descarta igual.
- **Unir contra una tabla de patrones (`unnest` + `JOIN`) también.** Con el
  patrón viniendo de una relación, el planner no llega al índice: se midió
  ~1.200 ms frente a ~0,5 ms con los términos desplegados uno por skill. Por eso
  la query se construye con un término por skill en vez de con un `JOIN`, que
  se leería mejor. `TOP_SKILLS` acota cuántos términos salen.

pg_trgm no puede extraer trigramas de patrones de menos de 3 caracteres, así que
"Go", "R" o "C" caen a scan secuencial, y como los términos van en `OR`, una
sola skill corta arrastra la consulta entera. Es la excepción, no la norma, y
arreglarlo bien pide otro índice distinto.

Esto es lo que hace viable el scraping en producción: las peticiones salen de la
máquina donde corre el worker, no de una IP de datacenter (Vercel, AWS…), que es
justo lo que los antibots de estos sitios miran primero. Además la búsqueda es
una query a Postgres, así que responde en milisegundos y no depende de que
LinkedIn esté accesible.

#### Correr el worker

```bash
npm run scrape:prod                                # contra la DB de Railway (.env.worker)
npm run scrape                                     # contra la DB local (.env)
npm run scrape:prod -- --queries "React,Python"    # queries concretas
npm run scrape:prod -- --max 10                    # tope de queries
```

Son dos scripts porque son dos bases de datos: `scrape` usa `.env` (Postgres
local de desarrollo) y `scrape:prod` usa `.env.worker` (la de Railway, que
sirve a los usuarios). Con un solo fichero habría que comentar y descomentar
líneas cada vez, que es justo como se acaba indexando en la base equivocada.

**Dónde correrlo.** Lo mejor es una máquina de casa: la IP residencial es la que
menos sospecha levanta, y el coste es cero. El worker solo necesita llegar a
Postgres, así que apunta su `.env.worker` a la URL **pública** de la DB de Railway
(`DATABASE_PUBLIC_URL` en las variables del servicio Postgres — la
`DATABASE_URL` normal es `*.railway.internal` y solo resuelve dentro de
Railway).

`.env.worker` en la máquina del worker (plantilla en `.env.worker.example`):

```
DATABASE_URL="<DATABASE_PUBLIC_URL de Railway>"
DIRECT_URL="<la misma>"
```

No hace falta `AUTH_SECRET`: el worker no llega a `env()` en ningún momento, así
que nunca se valida.

En Windows, tarea programada cada 6 horas:

```powershell
schtasks /create /tn "link-scrape" /tr "cmd /c cd /d C:\code\prueba\link && npm run scrape:prod >> scrape.log 2>&1" /sc hourly /mo 6
```

En Linux/macOS, cron:

```cron
0 */6 * * * cd /srv/link && npm run scrape:prod >> /var/log/link-scrape.log 2>&1
```

Si el PC está apagado, el índice deja de refrescarse. Las ofertas se sirven
hasta 14 días, así que aguanta apagones de días, no de semanas.

**Alternativa: cron service en Railway.** Un segundo servicio desde el mismo
repo con `startCommand: npm run scrape` y un schedule cron. Funciona y no
depende de tu PC, pero las peticiones salen de una IP de datacenter, que es
exactamente lo que el worker existía para evitar. Es un intercambio consciente,
no un descuido.

Tercera vía: `POST /api/cron/scrape` con `Authorization: Bearer $CRON_SECRET`,
por si prefieres dispararlo desde un scheduler externo.

Cada ciclo deja una fila en `ScrapeRun` (queries, ofertas, fallos, error), y
`GET /api/cron/status` la lee — ver [Monitorización](#monitorización).

Las queries son **un término por búsqueda**, no la concatenación de skills:
juntarlas es un AND en la mayoría de portales y devuelve cero resultados.

#### Monitorización

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/status
```

Devuelve **200** si todo va bien y **503** si no, así que un monitor HTTP
cualquiera (UptimeRobot, Better Stack, healthchecks.io) sirve de alerta sin
parsear el body. Estados:

| `status` | HTTP | Qué pasó |
| --- | --- | --- |
| `ok` | 200 | Ciclo reciente terminado y todas las fuentes con ofertas frescas. |
| `running` | 200 | Hay un ciclo en curso y ninguno completado aún. |
| `never_run` | 503 | El worker no ha corrido nunca. |
| `stale` | 503 | El último ciclo terminó hace más de 24h, o empezó y nunca terminó. El cron está parado. |
| `degraded` | 503 | El cron corre, pero alguna fuente lleva más de 48h sin ofertas frescas. |

`degraded` es el que detecta **scrapers rotos**: cuando un portal cambia el
markup, los selectores dejan de casar y la fuente devuelve lista vacía sin dar
error, así que el ciclo va aparentemente bien mientras esa fuente se seca. El
campo `sources[]` dice cuál, con su `ageHours` y su total de ofertas.

Los umbrales están en `src/lib/scrapeHealth.ts` (`MAX_RUN_AGE_HOURS`,
`MAX_SOURCE_AGE_HOURS`).

### Notas sobre el scraping

InfoJobs desactivó el acceso a nuevas API keys, LinkedIn nunca ofreció una
pública para esto y Tecnoempleo no tiene. `src/lib/jobSources/*Scrape.ts` leen
el HTML público de resultados de búsqueda (sin login) en vez de usar una API.

Esto viola los ToS de esos sitios — es scraping, no un acceso soportado — y
conlleva riesgo real: bloqueo de IP, y en el caso de LinkedIn, riesgo legal si
el volumen escala (han demandado a scrapers antes).

Mitigaciones en el código:

- Sin login, así que no hay ninguna cuenta en riesgo.
- Solo el worker scrapea, en segundo plano y a un ritmo fijo.
- Throttle compartido por host en Postgres (`HostCooldown`), ~4-7s entre
  requests, atómico, así que varias instancias hacen cola en vez de pisarse.
- Cache en Postgres (`ScrapeCache`) para que un ciclo disparado dos veces no
  repita las peticiones.
- Timeout de red de 8s por fuente.
- Poda de ofertas con más de 30 días.

Los scrapers son selectores CSS sobre HTML público: se rompen si esos sitios
cambian el markup, y no hay garantía de que sigan accesibles sin login. Los
tests fijan el contrato de parseo, pero no ven el HTML real (ver
[Tests y CI](#tests-y-ci)).
