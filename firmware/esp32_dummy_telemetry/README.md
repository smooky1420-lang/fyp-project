# ESP32 → WattGuard telemetry + relay sync

Sends voltage/current/power/`energy_kwh` to Django and **polls device state** (relay, power limit) from the API.

## 1. Backend

1. Create a **Device** in the web app (Devices page) and copy the **device token**.
2. Run Django on your PC: from `shems-backend`:
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```
   Using **`0.0.0.0`** lets other devices on your LAN reach the server (not only `localhost`).

3. Find your PC’s **LAN IP** (e.g. `192.168.1.50`). The ESP32 cannot use `127.0.0.1` for your PC.

## 2. API endpoints used

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `http://<PC_IP>:8000/api/telemetry/upload/` | Upload readings (`X-DEVICE-TOKEN`) |
| GET | `http://<PC_IP>:8000/api/devices/state-by-token/` | Read relay / limits from dashboard |

## 3. Arduino IDE

1. Install **ESP32** board support (Boards Manager: esp32 by Espressif).
2. Select your board (e.g. **ESP32 Dev Module**).
3. Open `esp32_dummy_telemetry.ino`.
4. Edit **`WIFI_SSID`**, **`WIFI_PASSWORD`**, **`DEVICE_TOKEN`**, **`SERVER_HOST`**, **`RELAY_PIN`** (GPIO 26 default, or `-1` to disable).
5. Upload and open Serial Monitor at **115200** baud.

## 4. Live demo tip

Toggle **Relay ON/OFF** on the Devices page — within ~10 seconds the ESP32 polls state and turns dummy current off when relay is off.

## 5. Check the app

- **Monitoring** → choose this device → short time range.
- **Today summary** should show increasing usage if `energy_kwh` is climbing.

## 6. Real PZEM-004T (optional)

1. Install **PZEM004Tv30** library in Arduino IDE (Library Manager).
2. In the sketch set `#define USE_PZEM true`.
3. Wire PZEM UART to ESP32 (default **RX=GPIO16**, **TX=GPIO17**) with level shifting if needed.
4. Re-upload. Serial Monitor shows `PZEM` vs `dummy` on each line.

If PZEM read fails, the sketch **falls back to dummy** readings automatically.

## 7. Troubleshooting

| Problem | What to try |
|--------|-------------|
| `Connection refused` | PC firewall: allow Python / port **8000**. Django must listen on **`0.0.0.0:8000`**, not only `127.0.0.1`. |
| `HTTP 401` | Wrong **`DEVICE_TOKEN`** (copy again from Devices page, no spaces). |
| ESP32 can’t reach PC | Same Wi‑Fi band/router; **`SERVER_HOST`** = PC’s LAN IP (`ipconfig` / `hostname -I`). |

## 6. Later: real PZEM

Replace the dummy numbers with UART reads from the PZEM; keep the same JSON fields and `X-DEVICE-TOKEN` header.
