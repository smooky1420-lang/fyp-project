# ESP32 → SHEMS dummy telemetry

Sends **fake** voltage/current/power/`energy_kwh` to your Django API so you can verify Wi‑Fi + backend **before** wiring the PZEM.

## 1. Backend

1. Create a **Device** in the web app (Devices page) and copy the **device token**.
2. Run Django on your PC: from `shems-backend`:
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```
   Using **`0.0.0.0`** lets other devices on your LAN reach the server (not only `localhost`).

3. Find your PC’s **LAN IP** (e.g. `192.168.1.50`). The ESP32 cannot use `127.0.0.1` for your PC.

## 2. Upload URL

Default in sketch:

`http://<YOUR_PC_LAN_IP>:8000/api/telemetry/upload/`

## 3. Arduino IDE

1. Install **ESP32** board support (Boards Manager: esp32 by Espressif).
2. Select your board (e.g. **ESP32 Dev Module**).
3. Open `esp32_dummy_telemetry.ino`.
4. Edit **`WIFI_SSID`**, **`WIFI_PASSWORD`**, **`DEVICE_TOKEN`**, **`SERVER_HOST`**, **`SERVER_PORT`**.
5. Upload and open Serial Monitor at **115200** baud.

## 4. Check the app

- **Monitoring** → choose this device → short time range.
- **Today summary** should show increasing usage if `energy_kwh` is climbing.

## 5. Troubleshooting

| Problem | What to try |
|--------|-------------|
| `Connection refused` | PC firewall: allow Python / port **8000**. Django must listen on **`0.0.0.0:8000`**, not only `127.0.0.1`. |
| `HTTP 401` | Wrong **`DEVICE_TOKEN`** (copy again from Devices page, no spaces). |
| ESP32 can’t reach PC | Same Wi‑Fi band/router; **`SERVER_HOST`** = PC’s LAN IP (`ipconfig` / `hostname -I`). |

## 6. Later: real PZEM

Replace the dummy numbers with UART reads from the PZEM; keep the same JSON fields and `X-DEVICE-TOKEN` header.
