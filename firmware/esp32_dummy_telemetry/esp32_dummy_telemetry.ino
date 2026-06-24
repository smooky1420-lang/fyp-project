/**

 * WattGuard — ESP32 telemetry + device state sync

 *

 * POST  /api/telemetry/upload/          (X-DEVICE-TOKEN)

 * GET   /api/devices/state-by-token/    (relay, limits, schedule)

 *

 * Set WIFI_*, DEVICE_TOKEN, SERVER_HOST below.

 * Run server: python manage.py runserver 0.0.0.0:8000

 *

 * PZEM-004T (optional):

 *   1. Install library: PZEM004Tv30 by mandulaj (Arduino Library Manager)

 *   2. Set USE_PZEM true and wire UART (RX=16, TX=17 typical)

 *   3. Without PZEM, dummy readings are used automatically

 */



#include <WiFi.h>

#include <HTTPClient.h>

#include <Preferences.h>



// ---- EDIT THESE ----

const char *WIFI_SSID = "YOUR_WIFI_SSID";

const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";



const char *DEVICE_TOKEN = "paste-device-token-here";

const char *SERVER_HOST = "192.168.1.50";

const uint16_t SERVER_PORT = 8000;



const int RELAY_PIN = 26;  // -1 to disable GPIO relay



const unsigned long POST_INTERVAL_MS = 15000;

const unsigned long STATE_POLL_MS = 10000;



const float BASE_VOLTAGE = 230.0f;



// Set true when PZEM004Tv30 is wired; false = dummy meter for bench demo

#define USE_PZEM false

#if USE_PZEM

#include <PZEM004Tv30.h>

#define PZEM_RX_PIN 16

#define PZEM_TX_PIN 17

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);

#endif

// ---- END EDIT ----



Preferences prefs;

static const char *NS = "shems";

static const char *KEY_KWH = "energy_kwh";



float energyKwh = 0.0f;

unsigned long lastPost = 0;

unsigned long lastStatePoll = 0;



bool relayOn = true;

bool scheduleEnabled = false;

float powerLimitW = 0.0f;

float dailyEnergyLimitKwh = 0.0f;



struct MeterReading {

  float voltage;

  float current;

  float power;

  bool fromPzem;

};



bool jsonBool(const String &body, const char *key) {

  String needle = String("\"") + key + "\":true";

  String spaced = String("\"") + key + "\": true";

  return body.indexOf(needle) >= 0 || body.indexOf(spaced) >= 0;

}



float jsonNumber(const String &body, const char *key) {

  String needle = String("\"") + key + "\":";

  int idx = body.indexOf(needle);

  if (idx < 0) return 0.0f;

  idx += needle.length();

  while (idx < (int)body.length() && body[idx] == ' ') idx++;

  if (idx < (int)body.length() && body.charAt(idx) == '"') return 0.0f;

  return body.substring(idx).toFloat();

}



void applyRelay(bool on) {

  relayOn = on;

  if (RELAY_PIN >= 0) {

    pinMode(RELAY_PIN, OUTPUT);

    digitalWrite(RELAY_PIN, on ? HIGH : LOW);

  }

}



bool fetchDeviceState() {

  if (WiFi.status() != WL_CONNECTED) return false;



  char url[128];

  snprintf(url, sizeof(url), "http://%s:%u/api/devices/state-by-token/", SERVER_HOST, SERVER_PORT);



  HTTPClient http;

  http.begin(url);

  http.addHeader("X-DEVICE-TOKEN", DEVICE_TOKEN);

  http.setTimeout(8000);



  int code = http.GET();

  String body = http.getString();

  http.end();



  if (code < 200 || code >= 300) {

    Serial.printf("State poll HTTP %d — %s\n", code, body.c_str());

    return false;

  }



  applyRelay(jsonBool(body, "relay_on"));

  scheduleEnabled = jsonBool(body, "schedule_enabled");

  powerLimitW = jsonNumber(body, "power_limit_w");

  dailyEnergyLimitKwh = jsonNumber(body, "daily_energy_limit_kwh");



  Serial.printf(

      "State: relay=%s limit=%.0fW daily=%.2fkWh schedule=%s\n",

      relayOn ? "ON" : "OFF",

      powerLimitW,

      dailyEnergyLimitKwh,

      scheduleEnabled ? "on" : "off");



  return true;

}



float dummyCurrent() {

  if (!relayOn) return 0.0f;

  return (float)random(400, 1101) / 1000.0f;

}



MeterReading readMeter() {

  MeterReading r = {BASE_VOLTAGE, 0.0f, 0.0f, false};



  if (!relayOn) return r;



#if USE_PZEM

  float v = pzem.voltage();

  float c = pzem.current();

  float p = pzem.power();

  float e = pzem.energy();

  if (!isnan(v) && v > 50.0f) {

    r.voltage = v;

    r.current = isnan(c) ? 0.0f : c;

    r.power = isnan(p) ? v * r.current : p;

    r.fromPzem = true;

    if (!isnan(e) && e >= 0.0f) {

      energyKwh = e;

    }

    return r;

  }

  Serial.println("PZEM read failed — using dummy fallback");

#endif



  r.current = dummyCurrent();

  r.power = BASE_VOLTAGE * r.current;

  return r;

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

  http.setTimeout(8000);



  int code = http.POST(body);

  String resp = http.getString();

  http.end();



  Serial.printf("Telemetry HTTP %d — %s\n", code, resp.c_str());

  return code >= 200 && code < 300;

}



void setup() {

  Serial.begin(115200);

  delay(500);

  randomSeed(micros());



#if USE_PZEM

  Serial2.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);

#endif



  if (RELAY_PIN >= 0) {

    pinMode(RELAY_PIN, OUTPUT);

    digitalWrite(RELAY_PIN, LOW);

  }



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

    fetchDeviceState();

  } else {

    Serial.println("WiFi failed — fix SSID/password and reboot.");

  }



  lastPost = 0;

  lastStatePoll = millis();

}



void loop() {

  unsigned long now = millis();



  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("Reconnecting WiFi...");

    WiFi.reconnect();

    delay(3000);

    return;

  }



  if (now - lastStatePoll >= STATE_POLL_MS) {

    lastStatePoll = now;

    fetchDeviceState();

  }



  if (now - lastPost < POST_INTERVAL_MS) {

    delay(200);

    return;

  }

  lastPost = now;



  MeterReading m = readMeter();

  float voltage = m.voltage;

  float current = m.current;

  float power = m.power;



  if (powerLimitW > 0.0f && power > powerLimitW) {

    power = powerLimitW;

    current = power / voltage;

  }



  if (!m.fromPzem) {

    float hours = (float)POST_INTERVAL_MS / 3600000.0f;

    energyKwh += (power / 1000.0f) * hours;

    prefs.putFloat(KEY_KWH, energyKwh);

  } else {

    prefs.putFloat(KEY_KWH, energyKwh);

  }



  Serial.printf(

      "Sending: %s relay=%s V=%.1f I=%.3f P=%.1f kWh=%.5f\n",

      m.fromPzem ? "PZEM" : "dummy",

      relayOn ? "ON" : "OFF",

      voltage,

      current,

      power,

      energyKwh);



  if (postTelemetry(voltage, current, power, energyKwh)) {

    Serial.println("OK");

  } else {

    Serial.println("POST failed — check token, SERVER_HOST, runserver 0.0.0.0:8000");

  }

}


