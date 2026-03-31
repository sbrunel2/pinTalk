#include "PowerManager.h"

#define BAT_ADC_PIN 1 // GPIO typique pour la batterie sur S3 T-Energy

void PowerManager::begin() {
    pinMode(BAT_ADC_PIN, INPUT);
}

float PowerManager::getBatteryVoltage() {
    // Lecture de l'ADC (0-4095)
    int raw = analogRead(BAT_ADC_PIN);
    
    // Conversion en Tension (V)
    // Le pont diviseur sur LilyGo est souvent de 1/2. 
    // Formule : (Lecture / 4095) * 3.3V * 2 (facteur diviseur)
    float voltage = (raw / 4095.0) * 3.3 * 2.0;
    
    // Correction si nécessaire selon les tests réels
    return voltage; 
}

void PowerManager::goToSleep() {
    Serial.println("Mise en veille...");
    Serial.flush();
    esp_deep_sleep_start();
}

int PowerManager::getBatteryPercentage() {
    float v = getBatteryVoltage();
    // Map simple : 4.2V = 100%, 3.3V = 0%
    float p = (v - 3.3) * 100.0 / (4.2 - 3.3);
    if (p > 100) return 100;
    if (p < 0) return 0;
    return (int)p;
}

bool PowerManager::isCritical() {
    return getBatteryVoltage() < 3.3; 
}