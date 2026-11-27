# CLAUDE.md — IR Remote (project guide)

Reference for changing or extending this app. Read it before editing. Keep it updated when behaviour changes.

## 1. What this is

A **mobile-first PWA** (Android + iOS browsers, installable) that acts as a **virtual remote for TVs and air conditioners**. A physical **IR device** (ESP32/ESP8266 running the **IRremoteESP8266** library) captures and transmits infrared codes. Many users can share one IR device; each user owns their own "controls" (a TV or an AC) attached to a device.

- Languages: **Spanish (default) and English**.
- Auth: email + password (name, email, password only). **No email verification. Password reset: yes** (SMTP email).
- Hosting target: **shared hosting, PHP 8.2, MySQL, HTTPS**. No long-running processes, no Composer.
- Design: clean, simple, modern, light/dark following the OS.

## 2. Repo layout

```
backend/                PHP API (deploys to public_html/api/)
  index.php             front controller (JSON in/out, error handling)
  .htaccess             blocks src/ storage/ tools/ config.php; passes Authorization header; routes to index.php
  config.sample.php     copy to config.php (git-ignored)
  schema.sql            full MySQL schema (utf8mb4, all timestamps UTC)
  src/
    bootstrap.php       PSR-4-ish autoloader (App\ -> src/), loads config.php
    routes.php          ALL routes live here
    Config, Db, Util, Http, Request, Router, ApiException, Jwt
    Auth.php            access tokens, rotating refresh-token sessions, cookie handling
    Mailer.php          dependency-free SMTP client (ssl/tls + AUTH LOGIN) + reset-password email (ES/EN)
    Mqtt.php            publishes commands to the device (drivers: log | emqx)
    Actions.php         action catalog, AC protocol allow-list, AC state machine
    Controllers/        AuthController, ControlController, DeviceController
  tools/provision-device.php   CLI: registers a physical IR device and prints its API key
frontend/               React 18 + TypeScript + Vite (PWA)
  index.html, vite.config.ts (dev proxy /api -> :8080, strips /api), tsconfig.json
  public/               manifest.webmanifest, sw.js, icons (svg + png), .htaccess (SPA fallback)
  src/
    main.tsx, App.tsx   bootstrap, routing, last-route resume, route guards
    styles.css          the only stylesheet (CSS variables, dark mode)
    api/client.ts       fetch wrapper, in-memory access token, single-flight refresh
    api/types.ts        shared TS types + TV_ACTIONS / AC_ACTIONS lists
    i18n/               index.ts, es.json, en.json
    auth/AuthContext.tsx   user state + silent session restore
    status/StatusContext.tsx   polls /status (device online/offline)
    components/         TopBar, Icon, ui (Button, Field, ErrorText, Card, Spinner, LangToggle), InstallPrompt, LearnPanel
    pages/              AuthPages (Welcome, SignIn, SignUp, Forgot, Reset), Home, AddDevice, Setup, Remote, EditControl, Settings
tools/
  device-simulator.mjs  fake IR device for dev (tails backend/storage/mqtt.log)
  make-icons.mjs        generates icon-192/512 + apple-touch-icon PNGs (pure Node)
README.md               user-facing setup/deploy notes   |   CLAUDE.md  this file
```

## 3. Architecture

```
Phone (PWA) --HTTPS--> PHP API --HTTPS REST--> MQTT broker (EMQX Cloud free) --MQTT--> IR device
                          ^   \-- broker rule webhook (status / LWT) <--/                 |
                          +------------- POST /device/learn (captured code) --------------+
```

- **Commands to the device** (learn, send) go PHP -> broker's **HTTPS REST publish API** -> topic `irdev/{ID}/cmd`. Shared hosting can't keep an MQTT socket open, so PHP never subscribes.
- **Availability** uses MQTT **Last Will & Testament**: device connects with client id = device ID, LWT `offline` (retained, QoS1) on `irdev/{ID}/status`, then publishes retained `online`. A broker rule/webhook forwards every message on `irdev/+/status` to `POST /internal/device-status` (header `X-Webhook-Secret`), which updates `ir_devices.is_online` / `last_seen_at`. The app polls `GET /status` every **6 s** (and on focus/visibility/`online` event). *Unverified assumption: EMQX free tier offers webhooks; if not, add a cron-based subscriber.*
- **Learned codes come back over plain HTTP**: device POSTs `{ir_device_id, action_name, protocol, length, rawData}` with `X-Device-Key` to `/device/learn`.
- The device has no idea who the user is; the backend resolves it through the active **learn job** for that device.

## 4. Key flows

### 4.1 Persistent login (requirement: user rarely re-logs in)
- Access token: JWT HS256, **15 min**, kept **in memory only**.
- Refresh token: random 32 bytes, **90 days sliding**, `HttpOnly; Secure(if https); SameSite=Lax` cookie `rt`, path = `cookie_path` (`/api/auth`). Only its SHA-256 is stored (`refresh_tokens`).
- **Rotation** on every refresh (same `family_id`). Reusing an already-rotated token after a **15 s grace** (two tabs racing) revokes the whole family. Logout revokes the family. Password reset/change revokes all of the user's tokens and starts a new session.
- Frontend: on app load `AuthProvider` calls `/auth/refresh` (silent restore) then `/me`. Any 401 triggers one single-flight refresh + retry; failure -> `onSessionLost` -> login screen. Also re-checks `/me` on `visibilitychange`.
- **Resume where left off**: `App.tsx` saves the last pathname (only if it matches `RESUMABLE` regex) to `localStorage.lastPath`; `/` redirects to it. Wizard progress is **server-side** (each learned action is saved immediately; control stays `status='draft'` until Finish), `Setup` resumes at the first unlearned step.
- iOS: Safari purges site data after ~7 days of non-use unless installed to Home Screen -> `InstallPrompt` nudges install (Android `beforeinstallprompt`, iOS instructions). Installed PWA has its own cookie jar: log in inside it.

### 4.2 Add device + learn wizard
1. `AddDevice` (3 steps): device ID -> `GET /ir-devices/{code}` (404 `device_not_found` if not provisioned) -> type (tv/ac) -> name -> `POST /controls` (creates **draft**) -> navigate to `/controls/:id/setup`.
2. `Setup` + `LearnPanel` per action: user taps **Start capture** -> `POST /controls/{id}/learn {action_name,label?}`:
   - device must be online (`409 device_offline`);
   - **one pending learn job per physical device** (shared device) else `409 device_busy` (own pending jobs are cancelled/replaced); expired jobs cleaned lazily; job TTL `learn_timeout` = 45 s;
   - publishes `{"cmd":"learn","action_name","job_id","timeout"}` to `irdev/{ID}/cmd`.
3. Device captures, POSTs `/device/learn`; backend finds the pending job, requires `action_name` to match the job (`409 action_mismatch`), upserts `control_actions`, marks job `done`, sets device online.
4. App polls `GET /controls/{id}/learn/{jobId}` every 1.5 s until `done` (returns refreshed control) / `expired` / error.
5. Summary screen -> `POST /controls/{id}/finish` (needs >=1 action) -> `status='ready'` -> `/controls/:id`.

### 4.3 AC strategy (important)
ACs transmit full state in every frame, so "Temp+" has no standalone code. Therefore:
- **State mode** (`ac_mode='state'`): when the learned **`power_on`** capture has a `protocol` in `Actions::AC_PROTOCOLS` (protocols IRremoteESP8266's `IRac` can build), `controls.ac_protocol` is set and the wizard needs **only that one capture**. The backend keeps AC state in `controls.state_json` (`power, mode[cool|heat|dry|fan], temp[16-30], fan[auto|low|medium|high], swing`) and each tap publishes `{"cmd":"send_ac","protocol",power,mode,temp,fan,swing}`; the **firmware builds the frame with IRac**.
- **Raw mode** (`ac_mode='raw'`): unknown protocol -> wizard learns every AC button and replays raw codes (`cmd:"send"`). Unreliable for temperature on stateful ACs; it's the fallback.
- `ac_mode` is derived in `ControlController::present()`: null (no power_on yet) / 'state' / 'raw'. Custom buttons are always raw.
- Deleting AC `power_on` clears `ac_protocol` and state.

### 4.4 Sending
`POST /controls/{id}/send {action_name}` -> 409 if device offline. State-mode AC: `Actions::applyAc()` computes new state, saves, publishes `send_ac`, returns `{state}` (UI updates from it). Everything else: loads the raw code and publishes `{"cmd":"send","protocol","length","rawData"}` (`rawData` is returned exactly as the device sent it; stored JSON-encoded in `raw_data`).

### 4.5 Status indicator (requirement: always visible at top)
`TopBar` -> `StatusChip`: on `/controls/:id*` shows that control's device (green "Dispositivo en línea" / red "sin conexión · desde HH:MM" / grey checking); elsewhere an aggregate (all online / N offline / none online). A red banner appears if the phone has no network (`navigator.onLine`). `Remote` disables buttons when the device is offline. Home cards show a badge from the same status.

## 5. Database (backend/schema.sql)

| Table | Purpose / notes |
|---|---|
| `users` | name, email (unique), password_hash, language `es\|en` |
| `refresh_tokens` | user_id, family_id, token_hash (sha256, unique), expires_at, revoked_at, `rotated` flag, user_agent |
| `password_resets` | token_hash, expires_at (1 h), used_at |
| `login_attempts` | rate limit: >=10 in 15 min per email OR ip -> `429 too_many_attempts` |
| `ir_devices` | `device_code` = printed ID (**= `ir_device_id` in device JSON**), `api_key_hash`, `is_online`, `last_seen_at`. **No owner** (shared). Rows created only by `provision-device.php` |
| `controls` | user_id, ir_device_id, type `tv\|ac`, name, status `draft\|ready`, `ac_protocol`, `state_json` |
| `control_actions` | control_id, `action_name`, `label` (custom only), protocol, length, `raw_data` MEDIUMTEXT (JSON), unique (control_id, action_name) |
| `learn_jobs` | ir_device_id, control_id, user_id, action_name, label, status `pending\|done\|expired\|cancelled`, expires_at |

All DATETIMEs are **UTC** written from PHP (`Util::now()`), returned to the client as ISO strings with `Z` (`Util::iso()`). Don't use MySQL `NOW()`.

## 6. API (all JSON, prefix = `base_path`, `/api` in prod)

Errors: `{"error":"<code>","message":"..."}`; codes map to `errors.<code>` in the i18n files (add both languages when adding a code).

| Method & path | Auth | Notes |
|---|---|---|
| POST `/auth/register` | – | name, email, password(>=8), language -> `{access_token,user}` + cookie |
| POST `/auth/login` | – | rate limited |
| POST `/auth/refresh` | cookie | silent restore / rotation |
| POST `/auth/logout` | cookie | revokes family |
| POST `/auth/forgot` | – | always 200; emails link `app_url/reset-password?token=` (ES/EN by user language) |
| POST `/auth/reset` | – | token+password -> new session |
| GET/PATCH `/me`, POST `/me/password` | Bearer | profile, language, change password (revokes all sessions, returns new) |
| GET/POST `/controls`, GET/PATCH/DELETE `/controls/{id}` | Bearer | owner only |
| POST `/controls/{id}/finish` | Bearer | |
| POST `/controls/{id}/learn`, GET `/controls/{id}/learn/{jobId}` | Bearer | see 4.2 |
| DELETE `/controls/{id}/actions/{action}` | Bearer | |
| POST `/controls/{id}/send` | Bearer | see 4.4 |
| GET `/ir-devices/{code}` | Bearer | validates printed ID, returns online |
| GET `/status` | Bearer | `{devices:[{code,online,last_seen_at,control_ids[]}]}` for the user's controls |
| POST `/device/learn` | `X-Device-Key` | device -> backend captured code |
| POST `/internal/device-status` | `X-Webhook-Secret` | broker webhook; body `{"topic":"irdev/<id>/status","payload":"online\|offline"}` (or `{ir_device_id,status}`); unknown devices ignored |

## 7. Action names (contract with firmware, UI and backend)

- TV: `power_on power_off ch_up ch_down vol_up vol_down mute input`
- AC: `power_on power_off mode_cool mode_heat mode_dry mode_fan temp_up temp_down fan_speed swing`
- Custom (both): `custom_<a-z0-9, 1-16>` + a `label`; created from **EditControl**.
Lists exist in **three places** that must stay in sync: `backend/src/Actions.php`, `frontend/src/api/types.ts`, and the i18n `actions.*` keys.

## 8. MQTT / device contract (give this to the firmware)

- Topics: commands `irdev/{ID}/cmd` (backend -> device), status `irdev/{ID}/status` (device/broker). Prefix configurable (`mqtt.topic_prefix`).
- `learn`: `{cmd,action_name,job_id,timeout}` -> capture up to `timeout`s, then `POST /api/device/learn` with `X-Device-Key` and `{ir_device_id,action_name(echoed),protocol(IRremoteESP8266 typeToString name, e.g. DAIKIN),length,rawData}`.
- `send`: `{cmd,protocol,length,rawData}` -> replay.
- `send_ac`: `{cmd,protocol,power,mode,temp,fan,swing}` -> build with `IRac`, send.
- Status: LWT `offline` retained + `online` retained after connect.

## 9. Frontend notes

- Routing/guards in `App.tsx`: `Root` (`/` -> last path or `/welcome`), `PublicOnly`, `Protected` (wraps `StatusProvider` + `TopBar`). `/reset-password` is reachable logged in or out.
- i18n: `react-i18next`; default `es`; language stored in `localStorage.lang` and in `users.language`; `LangToggle` updates both. **Every user-facing string goes in `es.json` AND `en.json`.**
- API client: relative base `/api`; token in memory; never store tokens in localStorage.
- `LearnPanel` is reused by `Setup` (wizard) and `EditControl` (relearn / add custom). It uses a `run` counter ref to discard stale polls and an `alive` ref. **`alive` must be re-armed to true in the effect body** (React StrictMode dev double-mount bug that made the wizard hang on "Esperando la señal…" — fixed).
- `Remote.tsx` defines `Btn`/`Rocker` as inner components (they remount each render; fine, but move them out if focus/animation issues appear).
- Theme tokens are CSS variables in `styles.css`; accent `--primary`. Icons are inline SVG in `components/Icon.tsx` (add a path there for new icons; unknown names fall back to a star).
- PWA: `public/sw.js` registers **only in production builds** (network-first navigation, cache-first static, never `/api`). Bump `CACHE` name to force refresh. After deploying, users may need to reopen the app twice.
- Build: `cd frontend && npm run build` (runs `tsc --noEmit` first). Output `dist/` goes to the app folder on the host together with `public/.htaccess` (SPA fallback excluding `/api/`).
- **Base path (subfolder hosting)**: the app is base-path aware. `VITE_BASE` in `frontend/.env.production` (currently `/irdevice/`; use `/` for a domain root) sets Vite `base`; the code uses `import.meta.env.BASE_URL` for the API base (`<base>api`), the router `basename` and the service-worker URL. `sw.js` derives its scope from its registration; `manifest.webmanifest` and `.htaccess` use relative paths. Never hardcode absolute `/...` URLs in the frontend; dev still runs at `/` with the `/api` proxy.

## 10. Backend notes

- No framework/Composer: add routes in `routes.php` as `[Controller::class,'method']`; controllers return arrays (JSON 200) or throw `ApiException(status, code)`. Use `Db::one/all/exec/insert` with positional `?` params (PDO emulate_prepares is **off**).
- `Auth::user($r)` for Bearer auth; device auth via `X-Device-Key` (hash compared in `DeviceController::device`); webhook via `X-Webhook-Secret`.
- Config keys (config.php): `app_url, base_path, cookie_path, debug, db{}, jwt_secret, access_ttl, refresh_ttl_days, learn_timeout, webhook_secret, mqtt{driver,topic_prefix,emqx{api_url,app_id,app_secret}}, smtp{host,port,secure(ssl|tls),user,pass,from,from_name}`.
- **Dev config**: `base_path ''`, `cookie_path '/api/auth'`, `app_url http://localhost:5173`, `mqtt.driver 'log'`, empty `smtp.host` (mails go to `backend/storage/mail.log`), `debug true` for error messages.
- **Prod config**: `base_path '/api'`, `mqtt.driver 'emqx'` (REST: POST `{api_url}/publish`, basic auth app_id:app_secret, body `{topic,payload,qos:1,retain:false}`), real SMTP, `debug false`.
- Adding an AC brand: check it's in `Actions::AC_PROTOCOLS` (names must equal IRremoteESP8266 `typeToString`).
- Changing AC state rules (ranges, fan cycle, modes): `Actions::applyAc` + constants; keep the UI (`Remote.tsx`) and the firmware's expected values in sync.
- Provision devices: `php backend/tools/provision-device.php <CODE>` (4-64 chars `[A-Za-z0-9_-]`), key shown once.
- Security status: password hashing `password_hash`, prepared statements, hashed refresh/reset/device tokens, login throttling. Device ownership is intentionally open (printed ID = proof of physical access); planned hardening = ID + PIN/secret.

## 11. Device simulator (`tools/device-simulator.mjs`)

Fake firmware for development (no hardware, no broker). With `mqtt.driver='log'` the backend appends every published command to `backend/storage/mqtt.log`; the simulator tails it and:
- on `learn`: waits 3 s, then POSTs a random `rawData` to `/device/learn` with the `protocol` flag;
- on `send`/`send_ac`: just logs "would transmit";
- calls the status webhook on start and every 30 s (this is what turns the app chip green) and `offline` on Ctrl+C.
```
node tools/device-simulator.mjs <DEVICE_CODE> <API_KEY> --secret <webhook_secret> [--api http://localhost:8080] [--protocol DAIKIN|NEC]
```
**Flags use two dashes (`--secret`).** `--protocol DAIKIN` (default) exercises the AC state-mode path; `--protocol NEC` exercises raw mode. Without `--secret` (or with a wrong one) the device stays "sin conexión"; the simulator now prints a clear error for that.

## 12. Run locally (Windows/PowerShell)

1. Create DB `irdevice` and import `backend/schema.sql`.
2. `copy backend\config.sample.php backend\config.php`, edit per section 10 (dev config).
3. `php backend\tools\provision-device.php IR-TEST01` -> copy the API key.
4. API: `php -S localhost:8080 -t backend backend/index.php`
5. App: `cd frontend; npm install; npm run dev` -> open **http://localhost:5173** (not :8080; the Vite proxy makes cookies same-origin). Phone on same Wi-Fi: `npm run dev -- --host`.
6. Device: simulator command above.
PHP needs `pdo_mysql`, `mbstring`, `curl`, `openssl`.

## 13. Deploy (shared hosting)

Import `schema.sql`; upload `backend/*` to `public_html/api/` (keep `.htaccess`) + production `config.php`; upload `frontend/dist/*` and `frontend/public/.htaccess` to `public_html/`; create the EMQX deployment, API key, device credentials, and the rule `SELECT topic, payload FROM "irdev/+/status"` -> webhook `POST https://DOMAIN/api/internal/device-status` with header `X-Webhook-Secret` and body `{"topic":"${topic}","payload":"${payload}"}`; provision each physical device and flash its printed ID + API key.

**Subfolder variant (current target, `https://mydomain.com/irdevice/`)**: frontend `dist/*` (incl. `.htaccess`) -> `public_html/irdevice/`; `backend/*` -> `public_html/irdevice/api/`. Don't upload `frontend/` source or the root `tools/`. `config.php`: `app_url 'https://mydomain.com/irdevice'`, `base_path '/irdevice/api'`, `cookie_path '/irdevice/api/auth'`. Webhook URL: `https://mydomain.com/irdevice/api/internal/device-status`; device `/device/learn` URL: `https://mydomain.com/irdevice/api/device/learn`. EMQX HTTP Server: method/body are set on the rule *action*, not the connector (an empty body sends the selected fields as JSON, which the backend accepts).

## 14. Status, history, known gaps

- Frontend typechecks and builds. Backend was written without PHP available; it has since been run by the user on a machine with PHP/MySQL: sign-up, device online indicator and device add work; learn flow was being debugged (the `alive` StrictMode bug above was the cause of the stuck "Esperando la señal" screen). **Re-test remaining flows end-to-end** (AC state mode, raw mode, send, custom buttons, password reset, 90-day session).
- Not built: QR scan of device ID; push updates (MQTT over WebSocket) instead of 6 s polling; device PIN/ownership hardening; account deletion; rate limiting beyond login; automated tests; macros/schedules/rooms/sharing ideas.
- Git: repo initialised in this folder, `origin` = `https://github.com/tomasgtz/irdevice.git`. A push from the CLI returned 403 (GitHub account `angeltgutierrez` lacked write access). The user commits/pushes via **SourceTree** (force-push to overwrite the remote was their stated intent). Don't run git push from here unless asked.
- Decisions already made (don't re-ask): React+TS+Vite, PHP+MySQL, ES default, 90-day sliding sessions, EMQX free tier, shared devices with open ID entry, state-based AC (option A), all extra actions (mute, input, fan speed, swing, custom) included, email verification not needed, password reset required.

## 15. Quick recipes

- **New button/action**: add to `Actions.php` (+ `applyAc` if AC state), `types.ts` lists, `es.json`/`en.json` `actions.*`, an icon in `Icon.tsx`/`actionIcon()` (LearnPanel), and render it in `Remote.tsx`; tell the firmware if it needs new behaviour.
- **New API error code**: throw `ApiException(status,'code')`; add `errors.code` in both i18n files.
- **New screen**: page in `pages/`, route in `App.tsx` (inside `Protected` if authenticated), add to `RESUMABLE` regex if it should be restored on reopen, strings in both languages.
- **Change polling cadence**: `POLL_MS` in `StatusContext.tsx`; learn polling is 1500 ms in `LearnPanel.tsx`; learn TTL is `learn_timeout` in config.
- **Change session length**: `refresh_ttl_days`, `access_ttl`; refresh grace window is the `15` in `Auth::refresh`.
- **Change colours/spacing**: CSS variables at the top of `styles.css`.
