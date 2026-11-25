# IR Remote

Mobile-first PWA that works as a virtual remote for TVs and air conditioners, on top of a shared physical IR device.

```
backend/    PHP 8.2, no Composer, MySQL      -> deploy to  public_html/api/
frontend/   React + TypeScript + Vite (PWA)  -> deploy dist/ to public_html/
tools/      device simulator, icon generator
```

## Architecture

```
Phone (PWA) --HTTPS--> PHP API --HTTPS REST--> MQTT broker (EMQX free tier) --MQTT--> IR device
                          ^   \--- webhook (status/LWT) <--------/                       |
                          +--------------- POST /device/learn (captured code) ------------+
```

- **Commands** (learn / send) go PHP -> broker REST API -> device (`irdev/{id}/cmd`). Shared hosting can't keep an MQTT connection open, so we use the broker's HTTPS API.
- **Availability**: the device publishes retained `online` on `irdev/{id}/status` when it connects and sets an LWT of `offline` on the same topic. A broker rule forwards every message on `irdev/+/status` to `POST /internal/device-status`. The app polls `GET /status` every 6 s (and on focus) and shows it in the top bar.
- **Learning**: the device POSTs `{ir_device_id, action_name, protocol, length, rawData}` to `/device/learn` with header `X-Device-Key`. The backend matches it to the active learn session for that device (one at a time, since devices are shared).
- **Session**: 15-min access token (memory) + 90-day sliding, rotating refresh token in an HttpOnly cookie. On launch the app silently refreshes, then returns to the last screen (`localStorage.lastPath`). Wizard progress is saved on the server per captured button.
- **AC**: if the protocol of the captured frame is one IRremoteESP8266's `IRac` supports (list in `backend/src/Actions.php`), the app stores one capture and keeps the AC *state*; each tap sends `send_ac` with the full state. Otherwise every button is learned and replayed raw.

## Device contract (firmware)

Subscribe to `irdev/{ID}/cmd`; JSON payloads:

| cmd | payload | what to do |
|---|---|---|
| `learn` | `{cmd, action_name, job_id, timeout}` | enter capture mode up to `timeout` s; on capture `POST /api/device/learn` `{ir_device_id, action_name, protocol, length, rawData}` with `X-Device-Key` |
| `send` | `{cmd, protocol, length, rawData}` | replay the raw code (`rawData` is returned exactly as you sent it) |
| `send_ac` | `{cmd, protocol, power, mode, temp, fan, swing}` | build the frame with `IRac` and send. `mode`: `cool` `heat` `dry` `fan`; `fan`: `auto` `low` `medium` `high`; `temp` 16-30 °C; `power`/`swing` booleans |

Status: connect with client id = device ID, LWT topic `irdev/{ID}/status` payload `offline` (retained, QoS 1); after connecting publish `online` (retained, QoS 1) to the same topic.

`action_name` values: TV `power_on power_off ch_up ch_down vol_up vol_down mute input`; AC `power_on power_off mode_cool mode_heat mode_dry mode_fan temp_up temp_down fan_speed swing`; custom buttons `custom_<id>`.

## Local development (no hardware, no broker)

1. MySQL: create a DB and import `backend/schema.sql`.
2. `cp backend/config.sample.php backend/config.php` -> set `db`, `jwt_secret`, `webhook_secret`; set `base_path` to `''` and `cookie_path` to `/api/auth`; keep `mqtt.driver = 'log'`.
3. Provision a device: `php backend/tools/provision-device.php IR-TEST01` (prints its API key).
4. API: `php -S localhost:8080 -t backend backend/index.php`
5. App: `cd frontend && npm install && npm run dev` (proxy forwards `/api` to :8080)
6. Fake device: `node tools/device-simulator.mjs IR-TEST01 <API_KEY> --secret <webhook_secret>`
   (`--protocol NEC` to test the per-button AC path; default `DAIKIN` tests the state-based path)

Password-reset emails are written to `backend/storage/mail.log` while `smtp.host` is empty.

## Production (shared hosting, HTTPS)

1. Import `schema.sql`. Copy `backend/` contents into `public_html/api/` (keep `.htaccess`; it blocks `src/`, `config.php`, `storage/`, `tools/`). Create `config.php` with `app_url`, `base_path '/api'`, SMTP, and `mqtt.driver 'emqx'`.
2. `cd frontend && npm run build`, upload `dist/*` plus `frontend/public/.htaccess` to `public_html/`.
3. **EMQX Cloud Serverless (free)**: create a deployment; create an API key (Management -> API keys) and put `api_url`/`app_id`/`app_secret` in config; create a device auth user for the firmware; add a Data Integration rule `SELECT topic, payload FROM "irdev/+/status"` -> Webhook `POST https://YOUR-DOMAIN/api/internal/device-status`, header `X-Webhook-Secret: <webhook_secret>`, body `{"topic":"${topic}","payload":"${payload}"}`. *(Confirm webhooks are available on your plan; if not, tell me and I'll add a cron-based poller.)*
4. Provision each physical device with `php tools/provision-device.php <PRINTED_ID>` (needs SSH/CLI; otherwise insert the row with a SHA-256 of its key) and flash the printed ID + API key into the firmware.

## Status

- Frontend: typechecks and builds.
- Backend: written but **not executed yet** (no PHP in the dev environment). First run against MySQL is the real test.
- Not built yet: QR scan of the device ID, live push via MQTT-over-WebSocket (polling for now), device-ownership hardening.
