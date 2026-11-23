// Attended, clean-water BENCH checkout only. Not a field controller.
// UNO R4 WiFi + Arduino Servo library. USB serial at 115200 baud. Keep the 6 V disconnect within reach.
// Linked mode: the browser simulator sends "POS <0-100>" each step over Web Serial.
// Commands:  ARM            allow movement (signal stays detached until armed)
//            POS <0..100>   gate opening target in percent
//            PULSE <1000..2000>  direct pulse for endpoint calibration (armed only)
//            CAL <closed_us> <open_us>  set pulse endpoints (default 1000 2000)
//            OFF            detach signal and disarm
// Safety: speed limited to 2 %/s, holds position if no command arrives for 3 s,
// reports "FB,<ms>,<position_pct>,<A1>" every 500 ms. Wire a position potentiometer to A0.
#include <Servo.h>
#include <stdlib.h>
#include <string.h>

Servo drive;
const byte signalPin = 9;
char line[32];
byte used = 0;
bool discard = false, armed = false, watchdogHeld = false;
float target = 0, current = 0;               // percent open
int closedUs = 1000, openUs = 2000;
unsigned long lastCmd = 0, lastStep = 0, lastSample = 0;

int pulseFor(float pct) { return closedUs + (int)((openUs - closedUs) * pct / 100.0); }

void disarm(const char *why) {
  armed = false; drive.detach();
  pinMode(signalPin, OUTPUT); digitalWrite(signalPin, LOW);
  Serial.println(why);
}

void command(char *s) {
  lastCmd = millis();
  if (watchdogHeld) { watchdogHeld = false; Serial.println("Link restored."); }
  if (strcmp(s, "OFF") == 0) { disarm("Signal off. Use the DC disconnect to isolate motor power."); return; }
  if (strcmp(s, "ARM") == 0) {
    armed = true; target = current;
    drive.writeMicroseconds(pulseFor(current)); drive.attach(signalPin, 1000, 2000);
    Serial.println("Armed. Movement limited to 2 %/s."); return;
  }
  char *end;
  if (strncmp(s, "POS ", 4) == 0) {
    const float p = strtod(s + 4, &end);
    if (end == s + 4 || p < 0 || p > 100) { Serial.println("POS must be 0..100."); return; }
    target = p; if (!armed) Serial.println("Not armed: send ARM to allow movement.");
    return;
  }
  if (strncmp(s, "CAL ", 4) == 0) {
    const long a = strtol(s + 4, &end, 10), b = strtol(end, &end, 10);
    if (a < 1000 || b > 2000 || a >= b) { Serial.println("CAL needs 1000 <= closed < open <= 2000."); return; }
    closedUs = a; openUs = b; Serial.println("Endpoints updated."); return;
  }
  if (strncmp(s, "PULSE ", 6) == 0) {
    const long p = strtol(s + 6, &end, 10);
    if (!armed || end == s + 6 || *end || p < 1000 || p > 2000) { Serial.println("PULSE needs ARM first and 1000..2000 us."); return; }
    drive.writeMicroseconds(p); Serial.print("Calibration pulse (us),"); Serial.println(p); return;
  }
  Serial.println("Commands: ARM, POS 0..100, CAL closed open, PULSE us, OFF");
}

void setup() {
  pinMode(signalPin, OUTPUT); digitalWrite(signalPin, LOW);
  analogReadResolution(12);
  Serial.begin(115200);
}

void loop() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { line[used] = '\0'; if (!discard && used) command(line); used = 0; discard = false; }
    else if (used < sizeof(line) - 1 && !discard) line[used++] = c;
    else discard = true;
  }
  const unsigned long now = millis();
  if (armed && !watchdogHeld && now - lastCmd > 3000UL) { watchdogHeld = true; target = current; Serial.println("WATCHDOG: no command for 3 s, holding position."); }
  if (armed && now - lastStep >= 100UL) {        // 2 %/s = 0.2 % per 100 ms
    lastStep = now;
    const float step = 0.2;
    if (target > current) current = min(target, current + step);
    else if (target < current) current = max(target, current - step);
    drive.writeMicroseconds(pulseFor(current));
  }
  if (now - lastSample >= 500UL) {
    lastSample = now;
    const float measured = analogRead(A0) * 100.0 / 4095.0;  // position pot, 0..100 %
    Serial.print("FB,"); Serial.print(now); Serial.print(','); Serial.print(measured, 1); Serial.print(','); Serial.println(analogRead(A1));
  }
}
