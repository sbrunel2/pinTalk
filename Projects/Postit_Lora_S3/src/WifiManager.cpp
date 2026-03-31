#include "WifiManager.h"

void WifiManager::begin(const char* ssid, const char* password) {
    Serial.print("Connexion au Wi-Fi...");
    WiFi.begin(ssid, password);
    
    // On n'attend pas forcément ici pour ne pas bloquer le LoRa
}

bool WifiManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void WifiManager::sendToCloud(String message) {
    if (isConnected()) {
        Serial.println("Envoi vers le Cloud : " + message);
        // Ici on pourra ajouter un appel HTTP POST ou un message MQTT
    }
}
