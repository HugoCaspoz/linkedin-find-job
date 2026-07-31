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
| `AUTH_SECRET` | sí | `openssl rand -base64 32`. La app se niega a arrancar con el placeholder. |
| `AUTH_URL` | en producción | URL pública de la app. |
| `ANTHROPIC_API_KEY` | para analizar CVs | https://console.anthropic.com |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | opcional | https://developer.adzuna.com (gratis, agrega Indeed y otros). Sin ellas, Adzuna se salta. |
| `CRON_SECRET` | opcional | Solo para disparar el worker por HTTP. Mínimo 16 caracteres. |

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
- Subida de CV: máximo 5 MB y solo `application/pdf`. Cada subida es una llamada
  de pago a Claude.
- La salida del modelo se valida con zod antes de tocar la DB
  (`src/lib/extractSkills.ts`).

### Arquitectura de búsqueda

Ninguna petición de usuario toca un sitio scrapeado. Hay dos caminos separados:

```
worker (cron)  ──scrape──>  LinkedIn / InfoJobs / Tecnoempleo  ──>  JobListing
                                                                        │
usuario  ──>  /api/jobs/search  ──lee──────────────────────────────────┘
                    └──live──>  Adzuna (API oficial, con key)
```

Esto es lo que hace viable el scraping en producción: las peticiones salen de la
máquina donde corre el worker, no de una IP de datacenter (Vercel, AWS…), que es
justo lo que los antibots de estos sitios miran primero. Además la búsqueda es
una query a Postgres, así que responde en milisegundos y no depende de que
LinkedIn esté accesible.

#### Correr el worker

```bash
npm run scrape                                # queries derivadas de las skills de los usuarios
npm run scrape -- --queries "React,Python"    # queries concretas
npm run scrape -- --max 10                    # tope de queries
```

**Dónde correrlo.** Lo mejor es una máquina de casa: la IP residencial es la que
menos sospecha levanta, y el coste es cero. El worker solo necesita llegar a
Postgres, así que apunta su `.env` a la URL **pública** de la DB de Railway
(`DATABASE_PUBLIC_URL` en las variables del servicio Postgres — la
`DATABASE_URL` normal es `*.railway.internal` y solo resuelve dentro de
Railway).

`.env` en la máquina del worker:

```
DATABASE_URL="<DATABASE_PUBLIC_URL de Railway>"
DIRECT_URL="<la misma>"
AUTH_SECRET="<cualquier cadena de 32+ chars, el worker no la usa pero se valida>"
```

En Windows, tarea programada cada 6 horas:

```powershell
schtasks /create /tn "link-scrape" /tr "cmd /c cd /d C:\code\prueba\link && npm run scrape >> scrape.log 2>&1" /sc hourly /mo 6
```

En Linux/macOS, cron:

```cron
0 */6 * * * cd /srv/link && npm run scrape >> /var/log/link-scrape.log 2>&1
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

Cada ciclo deja una fila en `ScrapeRun` (queries, ofertas, fallos, error), para
que un cron que dejó de funcionar se vea sin rebuscar en logs.

Las queries son **un término por búsqueda**, no la concatenación de skills:
juntarlas es un AND en la mayoría de portales y devuelve cero resultados.

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
cambian el markup, y no hay garantía de que sigan accesibles sin login.
