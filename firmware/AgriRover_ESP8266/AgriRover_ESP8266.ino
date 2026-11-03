/*
  =============================================================================
  AgriRover — Fertilizer Rover Controller (NodeMCU ESP8266 ESP-12E / ESP-12F)
  =============================================================================

  Firmware Features:
    - Stable Wi-Fi STA connection with Modem-Sleep disabled (no dropouts)
    - Persistent WebSocket Server on ws://<ESP8266_IP>/ws (Port 80)
    - Fertilizer / Water Spray Pump relay control (GPIO16 / D0)
    - Dual H-Bridge Motor Control (L298N) with PWM speed control
    - Keep-Alive Ping/Pong heartbeat support
    - Multi-client aware safe-stop: motors & pump cut only when ALL clients disconnect
    - Timed mission drive: {"task":"drive_move","direction":"forward","duration":1000}

  WebSocket Command Protocol:
    1. Movement:
       {"command":"forward"}
       {"command":"backward"}
       {"command":"left"}
       {"command":"right"}
       {"command":"stop"}
    2. Pump Relay:
       {"pump":"on"}   or {"pump":true}   -> Relay ENERGIZED, Pump ON
       {"pump":"off"}  or {"pump":false}  -> Relay DISARMED, Pump OFF
    3. Heartbeat:
       {"ping":1}                         -> Responds with {"pong":1,"pump":"on|off"}

  Hardware Pinout (NodeMCU labels):
    - Left Motor IN1:  D1 (GPIO5)
    - Left Motor IN2:  D2 (GPIO4)
    - Left Motor EN:   D7 (GPIO13, PWM)
    - Right Motor IN1: D5 (GPIO14)
    - Right Motor IN2: D6 (GPIO12)
    - Right Motor EN:  D8 (GPIO15, PWM - Must stay LOW during boot)
    - Pump Relay IN:   D0 (GPIO16 - Active LOW)
  =============================================================================
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Arduino_JSON.h>

// ---------- Wi-Fi Credentials ----------
const char* WIFI_SSID     = "Onyx";
const char* WIFI_PASSWORD = "love162005";

// ---------- Motor Driver Pins (NodeMCU Labels) ----------
const uint8_t MOTOR_LEFT_IN1  = D1; // GPIO5
const uint8_t MOTOR_LEFT_IN2  = D2; // GPIO4
const uint8_t MOTOR_LEFT_EN   = D7; // GPIO13 (PWM)

const uint8_t MOTOR_RIGHT_IN1 = D5; // GPIO14
const uint8_t MOTOR_RIGHT_IN2 = D6; // GPIO12
const uint8_t MOTOR_RIGHT_EN  = D8; // GPIO15 (PWM; boot pin - ensure ENB does not pull high at boot)

// ---------- Pump Relay ----------
// D0 = GPIO16. Controls the fertilizer spray pump relay.
// Active-LOW relay modules: LOW = ON (Energized), HIGH = OFF (Disarmed).
const uint8_t PUMP_RELAY_PIN  = D0; // GPIO16
const bool RELAY_ACTIVE_LOW   = true;
bool pumpIsOn                 = false;

// PWM Configuration
const uint16_t PWM_FREQUENCY  = 1000;
uint8_t motorSpeed            = 200; // 0..255 default speed

// ---------- Web Server & WebSocket ----------
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ---------- Drive State Machine ----------
enum Direction : uint8_t { DIR_STOP, DIR_FORWARD, DIR_BACKWARD, DIR_LEFT, DIR_RIGHT };
enum DriveMode : uint8_t { MODE_MANUAL, MODE_TIMED_DRIVE };

volatile Direction manualDirection = DIR_STOP;
DriveMode driveMode                = MODE_MANUAL;
Direction timedDirection           = DIR_STOP;
unsigned long taskStartTime        = 0;
unsigned long taskDuration         = 0;

// ---------- Pump Relay Helper ----------
void setPump(bool on) {
  pumpIsOn = on;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PUMP_RELAY_PIN, on ? LOW : HIGH);
  } else {
    digitalWrite(PUMP_RELAY_PIN, on ? HIGH : LOW);
  }
  Serial.print("[PUMP] State changed to: ");
  Serial.println(on ? "ON" : "OFF");
}

// ---------- Motor Helpers ----------
void stopMotors() {
  analogWrite(MOTOR_LEFT_EN, 0);
  analogWrite(MOTOR_RIGHT_EN, 0);
  digitalWrite(MOTOR_LEFT_IN1, LOW);
  digitalWrite(MOTOR_LEFT_IN2, LOW);
  digitalWrite(MOTOR_RIGHT_IN1, LOW);
  digitalWrite(MOTOR_RIGHT_IN2, LOW);
}

void driveForward() {
  digitalWrite(MOTOR_LEFT_IN1, HIGH);
  digitalWrite(MOTOR_LEFT_IN2, LOW);
  digitalWrite(MOTOR_RIGHT_IN1, LOW);
  digitalWrite(MOTOR_RIGHT_IN2, HIGH);
  analogWrite(MOTOR_LEFT_EN, motorSpeed);
  analogWrite(MOTOR_RIGHT_EN, motorSpeed);
}

void driveBackward() {
  digitalWrite(MOTOR_LEFT_IN1, LOW);
  digitalWrite(MOTOR_LEFT_IN2, HIGH);
  digitalWrite(MOTOR_RIGHT_IN1, HIGH);
  digitalWrite(MOTOR_RIGHT_IN2, LOW);
  analogWrite(MOTOR_LEFT_EN, motorSpeed);
  analogWrite(MOTOR_RIGHT_EN, motorSpeed);
}

void turnLeft() {
  // Pivot turn: left backward, right forward
  digitalWrite(MOTOR_LEFT_IN1, LOW);
  digitalWrite(MOTOR_LEFT_IN2, HIGH);
  digitalWrite(MOTOR_RIGHT_IN1, LOW);
  digitalWrite(MOTOR_RIGHT_IN2, HIGH);
  analogWrite(MOTOR_LEFT_EN, motorSpeed);
  analogWrite(MOTOR_RIGHT_EN, motorSpeed);
}

void turnRight() {
  // Pivot turn: left forward, right backward
  digitalWrite(MOTOR_LEFT_IN1, HIGH);
  digitalWrite(MOTOR_LEFT_IN2, LOW);
  digitalWrite(MOTOR_RIGHT_IN1, HIGH);
  digitalWrite(MOTOR_RIGHT_IN2, LOW);
  analogWrite(MOTOR_LEFT_EN, motorSpeed);
  analogWrite(MOTOR_RIGHT_EN, motorSpeed);
}

void executeDirection(Direction direction) {
  switch (direction) {
    case DIR_FORWARD:  driveForward();  break;
    case DIR_BACKWARD: driveBackward(); break;
    case DIR_LEFT:     turnLeft();      break;
    case DIR_RIGHT:    turnRight();     break;
    case DIR_STOP:
    default:           stopMotors();    break;
  }
}

Direction parseDirection(const String& value) {
  if (value == "forward")  return DIR_FORWARD;
  if (value == "backward") return DIR_BACKWARD;
  if (value == "left")     return DIR_LEFT;
  if (value == "right")    return DIR_RIGHT;
  return DIR_STOP;
}

// ---------- WebSocket Message Handler ----------
void handleWebSocketMessage(AsyncWebSocketClient* client, const String& message) {
  JSONVar json = JSON.parse(message);
  if (JSON.typeof(json) == "undefined" || JSON.typeof(json) != "object") {
    Serial.println("[WS] Ignored invalid JSON");
    return;
  }

  // 1. Heartbeat Ping from Dashboard (Keeps connection alive & verifies status)
  if (json.hasOwnProperty("ping")) {
    client->text("{\"pong\":1,\"pump\":" + String(pumpIsOn ? "\"on\"" : "\"off\"") + "}");
    return;
  }

  // 2. Pump Control (Independent of drive)
  // Accepts: {"pump":"on"}, {"pump":"off"}, {"pump":true}, {"pump":false}
  if (json.hasOwnProperty("pump")) {
    JSONVar pumpValue = json["pump"];
    if (JSON.typeof(pumpValue) == "boolean") {
      setPump((bool)pumpValue);
    } else {
      String cmd = (const char*)pumpValue;
      cmd.toLowerCase();
      if (cmd == "on" || cmd == "true" || cmd == "1") {
        setPump(true);
      } else if (cmd == "off" || cmd == "false" || cmd == "0") {
        setPump(false);
      }
    }
    // Acknowledge back to client
    client->text("{\"pump\":" + String(pumpIsOn ? "\"on\"" : "\"off\"") + "}");
    return;
  }

  // 3. Motor speed control. Accepts {"speed":0..255}.
  if (json.hasOwnProperty("speed")) {
    long requestedSpeed = (long)json["speed"];
    if (requestedSpeed < 0) requestedSpeed = 0;
    if (requestedSpeed > 255) requestedSpeed = 255;
    motorSpeed = (uint8_t)requestedSpeed;
    if (driveMode == MODE_MANUAL) {
      executeDirection(manualDirection);
    } else {
      executeDirection(timedDirection);
    }
    Serial.printf("[DRIVE] Motor speed: %u/255\n", motorSpeed);
    return;
  }

  // 4. Manual Movement Command
  if (json.hasOwnProperty("command")) {
    String command = (const char*)json["command"];
    command.toLowerCase();

    if (command == "pump_on")  { setPump(true); return; }
    if (command == "pump_off") { setPump(false); return; }

    driveMode = MODE_MANUAL;
    manualDirection = parseDirection(command);
    executeDirection(manualDirection);
    Serial.print("[DRIVE] Manual command: ");
    Serial.println(command);
    return;
  }

  // 5. Timed Autonomous Drive Mission
  if (json.hasOwnProperty("task")) {
    String task = (const char*)json["task"];
    if (task == "drive_move" && json.hasOwnProperty("direction") && json.hasOwnProperty("duration")) {
      timedDirection = parseDirection((const char*)json["direction"]);
      long reqDuration = (long)json["duration"];
      if (reqDuration < 0) reqDuration = 0;
      if (reqDuration > 60000) reqDuration = 60000; // 60s max safety limit

      taskDuration = (unsigned long)reqDuration;
      taskStartTime = millis();
      driveMode = MODE_TIMED_DRIVE;

      if (taskDuration == 0 || timedDirection == DIR_STOP) {
        driveMode = MODE_MANUAL;
        manualDirection = DIR_STOP;
        stopMotors();
      } else {
        executeDirection(timedDirection);
      }

      Serial.printf("[DRIVE] Timed drive: %s for %lu ms\n", (const char*)json["direction"], taskDuration);
    }
  }
}

// ---------- WebSocket Event Callback ----------
void onWebSocketEvent(AsyncWebSocket* serverPtr,
                      AsyncWebSocketClient* client,
                      AwsEventType type,
                      void* arg,
                      uint8_t* data,
                      size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WS] Client #%u connected from %s (Total active: %u)\n",
                  client->id(),
                  client->remoteIP().toString().c_str(),
                  (unsigned int)serverPtr->count());

    // Immediately synchronize the current pump state with the newly connected dashboard
    client->text("{\"status\":\"connected\",\"pump\":" + String(pumpIsOn ? "\"on\"" : "\"off\"") + "}");
    return;
  }

  if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WS] Client #%u disconnected\n", client->id());

    // CRITICAL FIX: Only trigger fail-safe stop if NO other active clients remain.
    // If a tab reloads or reconnects, the remaining client keeps control seamlessly.
    if (serverPtr->count() == 0) {
      Serial.println("[SAFETY] All clients disconnected! Stopping motors & cutting pump power.");
      driveMode = MODE_MANUAL;
      manualDirection = DIR_STOP;
      stopMotors();
      setPump(false);
    } else {
      Serial.printf("[WS] %u client(s) still connected. Vehicle remains active.\n",
                    (unsigned int)serverPtr->count());
    }
    return;
  }

  if (type != WS_EVT_DATA) return;

  AwsFrameInfo* info = (AwsFrameInfo*)arg;
  if (!info || !info->final || info->index != 0 || info->len != len || info->opcode != WS_TEXT) {
    return;
  }

  String message;
  message.reserve(len);
  for (size_t i = 0; i < len; ++i) {
    message += (char)data[i];
  }
  handleWebSocketMessage(client, message);
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("==================================================");
  Serial.println("   AgriRover — ESP8266 Fertilizer Rover Controller ");
  Serial.println("==================================================");

  // Initialize Motor Pins
  pinMode(MOTOR_LEFT_IN1, OUTPUT);
  pinMode(MOTOR_LEFT_IN2, OUTPUT);
  pinMode(MOTOR_RIGHT_IN1, OUTPUT);
  pinMode(MOTOR_RIGHT_IN2, OUTPUT);
  pinMode(MOTOR_LEFT_EN, OUTPUT);
  pinMode(MOTOR_RIGHT_EN, OUTPUT);

  // Initialize Pump Relay Pin (Active-LOW fail-safe: HIGH = OFF)
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  setPump(false);

  analogWriteRange(255);
  analogWriteFreq(PWM_FREQUENCY);
  stopMotors();

  // CRITICAL FIX FOR CONNECTION DROPOUTS:
  // Disable ESP8266 Wi-Fi modem sleep so the radio never turns off or causes socket timeouts
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 25000UL) {
    delay(250);
    Serial.print('.');
    yield();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println(">>> Wi-Fi Connected Successfully!");
    Serial.print(">>> IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print(">>> WebSocket URL: ws://");
    Serial.print(WiFi.localIP());
    Serial.println("/ws");
  } else {
    Serial.println();
    Serial.println("[ERROR] Wi-Fi connection timed out. Check SSID/Password and 2.4 GHz network.");
  }

  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();

  Serial.println(">>> HTTP & WebSocket server started on port 80");
  Serial.println("==================================================");
}

// ---------- Main Loop ----------
void loop() {
  // Handle timed drive missions
  if (driveMode == MODE_TIMED_DRIVE) {
    if (millis() - taskStartTime >= taskDuration) {
      driveMode = MODE_MANUAL;
      manualDirection = DIR_STOP;
      stopMotors();
      Serial.println("[DRIVE] Timed mission finished; stopped.");
    }
  }

  // Periodic client cleanup
  ws.cleanupClients();
  yield();
  delay(1);
}
