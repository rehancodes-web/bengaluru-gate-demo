// Attended, clean-water bench checkout. USB serial at 115200 baud.
// UNO R4 WiFi + Arduino Servo library. Keep the 6 V disconnect within reach.
// After reset the signal is detached. Calibrate command endpoints unpinned.
#include <Servo.h>
#include <stdlib.h>
#include <string.h>

Servo drive;
const byte signalPin = 9;
char line[32];
byte used = 0;
bool discard = false;
unsigned long lastSample = 0;
unsigned long lastMove = 0;
bool hasMoved = false;

void command(char *s) {
  if (strcmp(s,"OFF")==0) {
    drive.detach();
    pinMode(signalPin, OUTPUT);
    digitalWrite(signalPin, LOW);
    Serial.println("Signal off. Use the DC disconnect to isolate motor power.");
    return;
  }
  if (strncmp(s,"PULSE ",6)!=0) {
    Serial.println("Use PULSE 1500 or OFF. Range 1000..2000 us.");
    return;
  }
  char *end;
  const long pulse = strtol(s+6,&end,10);
  if (end==s+6 || *end || pulse<1000 || pulse>2000) {
    Serial.println("Invalid pulse.");
    return;
  }
  if (hasMoved && millis()-lastMove<60000UL) {
    Serial.println("Bench cooldown. Wait 60 s between moves.");
    return;
  }
  if (!drive.attached()) {
    drive.writeMicroseconds(pulse);
    drive.attach(signalPin,1000,2000);
  }
  drive.writeMicroseconds(pulse);
  lastMove=millis();
  hasMoved=true;
  Serial.print("Requested pulse (us),"); Serial.println(pulse);
}

void setup() {
  pinMode(signalPin,OUTPUT);
  digitalWrite(signalPin,LOW);
  analogReadResolution(12);
  Serial.begin(115200);
}
void loop() {
  while (Serial.available()) {
    const char c=Serial.read();
    if (c=='\r') continue;
    if (c=='\n') {
      line[used]='\0';
      if (!discard && used) command(line);
      used=0; discard=false;
    } else if (used<sizeof(line)-1 && !discard) line[used++]=c;
    else discard=true;
  }
  if (millis()-lastSample>=500UL) {
    lastSample=millis();
    Serial.print(lastSample); Serial.print(',');
    Serial.print(analogRead(A0)); Serial.print(',');
    Serial.println(analogRead(A1));
  }
}
