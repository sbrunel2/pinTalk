#include "LoraManager.h"

LoraManager::LoraManager() {
    _mod = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);
    _radio = new SX1262(_mod);
}

bool LoraManager::begin() {
    Serial.print(F("[LoRa] Initialisation... "));
    
    // Fréquence 868.0 MHz
    int state = _radio->begin(868.0);
    
    if (state == RADIOLIB_ERR_NONE) {
        // Configuration pour SX1262
        _radio->setSpreadingFactor(9);
        _radio->setBandwidth(125.0);      // CORRIGÉ : au lieu de setSignalBandwidth
        _radio->setCodingRate(7);
        _radio->setSyncWord(0x12);
        
        Serial.println(F("Succès !"));
        return true;
    } else {
        Serial.print(F("Échec, code : "));
        Serial.println(state);
        return false;
    }
}

bool LoraManager::receive(String &payload) {
    // RadioLib gère la réception directement dans la String
    int state = _radio->receive(payload);

    if (state == RADIOLIB_ERR_NONE) {
        return true;
    }
    return false;
}

void LoraManager::setWakeUp() {
    // Configuration de la pin de réveil pour l'ESP32
    esp_sleep_enable_ext0_wakeup((gpio_num_t)LORA_DIO1, 1);
}