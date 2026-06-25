/**
 * WattGuard ESP32 — PZEM-004T telemetry with WiFi provisioning (flash once).
 *
 * First boot (or hold BOOT button while resetting):
 *   1. ESP32 opens hotspot "WattGuard-Setup"
 *   2. Connect phone/laptop → captive portal opens (or go to http://192.168.4.1)
 *   3. Enter: WiFi password, server IP, port, device token (from WattGuard → Devices)
 *
 * Libraries (Arduino Library Manager):
 *   - WiFiManager by tzapu
 *   - PZEM004Tv30 by mandulaj
 *
 * Server: python manage.py runserver 0.0.0.0:8000
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <PZEM004Tv30.h>

// PZEM UART: TX→ESP32 GPIO16 (RX2), RX→ESP32 GPIO17 (TX2) — use level shifter if needed
PZEM004Tv30 pzem(Serial2, 16, 17);

Preferences prefs;
static const char *PREFS_NS = "wattguard";

// Hold BOOT (GPIO0) low while resetting to reopen setup portal
static const int CONFIG_BUTTON_PIN = 0;
static const unsigned long CONFIG_HOLD_MS = 2500;

static const unsigned long POST_INTERVAL_MS = 15000;
static const unsigned long STATE_POLL_MS = 10000;

// Set to a GPIO pin if you add a relay; -1 = disabled
static const int RELAY_PIN = -1;

String deviceToken;
String serverHost;
uint16_t serverPort = 8000;

unsigned long lastPost = 0;
unsigned long lastStatePoll = 0;
bool relayOn = true;

WiFiManagerParameter paramToken("token", "Device token (Devices page)", "", 64);
WiFiManagerParameter paramHost("host", "Server IP / hostname", "192.168.1.50", 40);
WiFiManagerParameter paramPort("port", "Server port", "8000", 6);

void loadSavedConfig() {
  prefs.begin(PREFS_NS, true);
  deviceToken = prefs.getString("token", "");
  serverHost = prefs.getString("host", "");
  serverPort = (uint16_t)prefs.getUInt("port", 8000);
  prefs.end();
}

void saveConfigFromPortal() {
  deviceToken = String(paramToken.getValue());
  deviceToken.trim();
  serverHost = String(paramHost.getValue());
  serverHost.trim();
  serverPort = (uint16_t)atoi(paramPort.getValue());
  if (serverPort == 0) {
    serverPort = 8000;
  }

  prefs.begin(PREFS_NS, false);
  prefs.putString("token", deviceToken);
  prefs.putString("host", serverHost);
  prefs.putUInt("port", serverPort);
  prefs.end();

  Serial.println("Saved WattGuard config to flash.");
}

bool bootButtonHeld() {
  pinMode(CONFIG_BUTTON_PIN, INPUT_PULLUP);
  if (digitalRead(CONFIG_BUTTON_PIN) != LOW) {
    return false;
  }
  Serial.println("BOOT held — waiting to open setup portal...");
  unsigned long start = millis();
  while (millis() - start < CONFIG_HOLD_MS) {
    if (digitalRead(CONFIG_BUTTON_PIN) != LOW) {
      return false;
    }
    delay(50);
  }
  return true;
}

void prefillPortalFields() {
  if (deviceToken.length() > 0) {
    paramToken.setValue(deviceToken.c_str(), deviceToken.length());
  }
  if (serverHost.length() > 0) {
    paramHost.setValue(serverHost.c_str(), serverHost.length());
  }
  char portBuf[8];
  snprintf(portBuf, sizeof(portBuf), "%u", serverPort);
  paramPort.setValue(portBuf, strlen(portBuf));
}

bool runProvisioningPortal(bool portalOnly) {
  WiFiManager wm;
  wm.setTitle("WattGuard");
  wm.setConfigPortalBlocking(true);
  wm.setConnectTimeout(20);
  wm.setConfigPortalTimeout(0);

  prefillPortalFields();
  wm.addParameter(&paramToken);
  wm.addParameter(&paramHost);
  wm.addParameter(&paramPort);

  wm.setSaveParamsCallback([]() { saveConfigFromPortal(); });

  Serial.println("Opening setup portal: connect to WiFi \"WattGuard-Setup\"");
  Serial.println("Configure WiFi + server IP + device token in the browser.");

  bool ok = portalOnly ? wm.startConfigPortal("WattGuard-Setup")
                       : wm.autoConnect("WattGuard-Setup");
  if (!ok) {
    Serial.println("Setup failed — retrying in 3s...");
    delay(3000);
    return false;
  }

  saveConfigFromPortal();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());
  return deviceToken.length() > 0 && serverHost.length() > 0;
}

bool ensureConfigured() {
  loadSavedConfig();
  bool forcePortal = bootButtonHeld();

  for (;;) {
    bool needPortal =
        forcePortal || deviceToken.length() == 0 || serverHost.length() == 0;

    if (!runProvisioningPortal(needPortal)) {
      forcePortal = false;
      continue;
    }

    loadSavedConfig();
    if (deviceToken.length() > 0 && serverHost.length() > 0) {
      break;
    }
    forcePortal = false;
  }
  return true;
}

bool readPzem(float &voltage, float &current, float &power, float &energy) {
  voltage = pzem.voltage();
  current = pzem.current();
  power = pzem.power();
  energy = pzem.energy();

  if (isnan(voltage) || isnan(current) || isnan(power) || isnan(energy)) {
    return false;
  }
  return true;
}

bool postTelemetry(float voltage, float current, float power, float energy) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  char url[160];
  snprintf(
      url, sizeof(url), "http://%s:%u/api/telemetry/upload/",
      serverHost.c_str(), serverPort);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-DEVICE-TOKEN", deviceToken);

  char body[192];
  snprintf(
      body, sizeof(body),
      "{\"voltage\":%.2f,\"current\":%.3f,\"power\":%.2f,\"energy_kwh\":%.4f}",
      voltage, current, power, energy);

  int code = http.POST(body);
  bool ok = code > 0 && code < 300;
  if (ok) {
    Serial.printf("Telemetry sent (HTTP %d)\n", code);
  } else {
    Serial.printf("Telemetry failed (HTTP %d)\n", code);
  }
  http.end();
  return ok;
}

void pollDeviceState() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  char url[160];
  snprintf(
      url, sizeof(url), "http://%s:%u/api/devices/state-by-token/",
      serverHost.c_str(), serverPort);

  http.begin(url);
  http.addHeader("X-DEVICE-TOKEN", deviceToken);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    bool newRelay = payload.indexOf("\"relay_on\":true") >= 0;
    if (newRelay != relayOn) {
      relayOn = newRelay;
      Serial.printf("Relay state from server: %s\n", relayOn ? "ON" : "OFF");
      if (RELAY_PIN >= 0) {
        digitalWrite(RELAY_PIN, relayOn ? HIGH : LOW);
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- WattGuard ESP32 (PZEM) ---");

  if (RELAY_PIN >= 0) {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, HIGH);
  }

  ensureConfigured();

  Serial.print("Token configured (last 6 chars): ...");
  if (deviceToken.length() > 6) {
    Serial.println(deviceToken.substring(deviceToken.length() - 6));
  } else {
    Serial.println("(short)");
  }
  Serial.printf("Server: http://%s:%u\n", serverHost.c_str(), serverPort);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost — reconnecting...");
    WiFi.reconnect();
    delay(2000);
    if (WiFi.status() != WL_CONNECTED) {
      ensureConfigured();
    }
    return;
  }

  unsigned long now = millis();

  if (now - lastStatePoll >= STATE_POLL_MS) {
    lastStatePoll = now;
    pollDeviceState();
  }

  if (now - lastPost < POST_INTERVAL_MS) {
    delay(50);
    return;
  }
  lastPost = now;

  float v, i, p, e;
  if (!readPzem(v, i, p, e)) {
    Serial.println("PZEM read failed — check wiring and AC supply.");
    return;
  }

  Serial.printf("Read: %.1fV %.2fA %.1fW %.3fkWh\n", v, i, p, e);
  postTelemetry(v, i, p, e);
}
