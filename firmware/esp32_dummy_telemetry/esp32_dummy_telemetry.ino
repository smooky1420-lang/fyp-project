/**
 * SHEMS — dummy telemetry from ESP32 (no PZEM yet)
 *
 * POST JSON to Django: /api/telemetry/upload/
 * Header: X-DEVICE-TOKEN: <token from Devices page>
 *
 * Set WIFI_*, DEVICE_TOKEN, SERVER_HOST below.
 * Run server: python manage.py runserver 0.0.0.0:8000
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>

// ---- EDIT THESE ----
const char* ssid = "RIXA";
const char* password = "123456789";

// Paste from SHEMS web app → Devices → device token
const char *DEVICE_TOKEN = "e7a6e7f58f8d4d1c8d5f48c295394478";

// PC running Django (not 127.0.0.1 — use LAN IP, e.g. 192.168.1.50)
const char *SERVER_HOST = "192.168.1.50";
const uint16_t SERVER_PORT = 8000;

// How often to send a reading (ms)
const unsigned long POST_INTERVAL_MS = 15000;

// Dummy electrical baseline (~230 V Pakistan)
const float BASE_VOLTAGE = 230.0f;
// ---- END EDIT ----

Preferences prefs;
static const char *NS = "shems";
static const char *KEY_KWH = "energy_kwh";

float energyKwh = 0.0f;
unsigned long lastPost = 0;

float dummyCurrent() {
  // Slight variation ~0.4 .. 1.1 A (random max is exclusive)
  return (float)random(400, 1101) / 1000.0f;
}

bool postTelemetry(float voltage, float current, float power, float energy_kwh) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }

  char url[96];
  snprintf(url, sizeof(url), "http://%s:%u/api/telemetry/upload/", SERVER_HOST, SERVER_PORT);

  char body[192];
  snprintf(
      body,
      sizeof(body),
      "{\"voltage\":%.2f,\"current\":%.3f,\"power\":%.2f,\"energy_kwh\":%.5f}",
      voltage,
      current,
      power,
      energy_kwh);

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-DEVICE-TOKEN", DEVICE_TOKEN);

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.printf("HTTP %d — %s\n", code, resp.c_str());

  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  randomSeed(micros());

  prefs.begin(NS, false);
  energyKwh = prefs.getFloat(KEY_KWH, 0.0f);
  Serial.printf("Stored cumulative energy_kwh: %.5f\n", energyKwh);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed — fix SSID/password and reboot.");
  }

  lastPost = 0;
}

void loop() {
  unsigned long now = millis();
  if (now - lastPost < POST_INTERVAL_MS) {
    delay(200);
    return;
  }
  lastPost = now;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconnecting WiFi...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  float current = dummyCurrent();
  float power = BASE_VOLTAGE * current;  // W (resistive-ish dummy)
  // Add energy for elapsed window (approximate constant power over POST_INTERVAL_MS)
  float hours = (float)POST_INTERVAL_MS / 3600000.0f;
  float kwhStep = (power / 1000.0f) * hours;
  energyKwh += kwhStep;

  prefs.putFloat(KEY_KWH, energyKwh);

  Serial.printf("Sending: V=%.1f I=%.3f P=%.1f kWh=%.5f\n", BASE_VOLTAGE, current, power, energyKwh);

  if (postTelemetry(BASE_VOLTAGE, current, power, energyKwh)) {
    Serial.println("OK");
  } else {
    Serial.println("POST failed — check token, SERVER_HOST, and runserver 0.0.0.0:8000");
  }
}
