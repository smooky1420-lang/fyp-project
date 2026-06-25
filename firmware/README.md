# WattGuard ESP32 firmware

Flash **once**. After that, WiFi + server + device token are set through a setup portal — no code edits when you add a new device in the app.

## Hardware

- **ESP32** dev board  
- **PZEM-004T** on UART2 (RX=GPIO16, TX=GPIO17) — use a level shifter if your module is 5 V TTL  
- One PZEM = **one** device in WattGuard (other circuits can use `demo_sender.py`)

## Arduino IDE setup

1. Board: **ESP32 Dev Module** (or your exact board)  
2. Install libraries (**Sketch → Include Library → Manage Libraries**):
   - **WiFiManager** by tzapu  
   - **PZEM004Tv30** by mandulaj  
3. Open `wattguard_esp32/wattguard_esp32.ino` and **Upload**

## First-time provisioning

1. On your laptop: `python manage.py runserver 0.0.0.0:8000`  
2. Note your PC’s **LAN IP** (e.g. `192.168.1.50`) — `ipconfig` on Windows  
3. In WattGuard: sign in → **Devices** → add a meter → **copy device token**  
4. Power the ESP32 (or press **RESET** while holding **BOOT** to force setup mode)  
5. On phone/laptop WiFi, connect to **`WattGuard-Setup`**  
6. Captive portal opens (or browse to **http://192.168.4.1**)  
7. Fill in:
   - Your home/lab **WiFi** name and password  
   - **Server IP** = laptop IP  
   - **Port** = `8000`  
   - **Device token** = paste from Devices page  
8. Save — ESP reboots, joins WiFi, starts posting every **15 s**

## Change device or demo account later

**No reflash.** Hold **BOOT**, press **RESET**, hold BOOT ~3 s until setup portal opens. Enter the **new token** and server IP if needed.

## Serial monitor

115200 baud — you should see WiFi IP, PZEM readings, and `Telemetry sent (HTTP 201)`.

## API used

| Call | Purpose |
|------|---------|
| `POST /api/telemetry/upload/` | Send V, I, P, kWh (`X-DEVICE-TOKEN`) |
| `GET /api/devices/state-by-token/` | Relay / limits (optional; set `RELAY_PIN` in sketch) |

## Old sketch

`sketch_mar31a/` was a hardcoded prototype. Use **`wattguard_esp32`** for demos and the FYP viva.
