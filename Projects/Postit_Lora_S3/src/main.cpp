#include <Arduino.h>
#include "LoraService.h"
#include "MqttService.h"
#include "DisplayService.h"

// --- CONFIGURATION ---
const char* WIFI_SSID = "komoto";
const char* WIFI_PASS = "maclaud6";
const char* MQTT_IP   = "192.168.68.55"; 

// --- INSTANCES ---
LoraService    lora;
MqttService    mqtt;
DisplayService display;

void setup() {
    Serial.begin(115200);
    
    // 1. Initialisation de l'affichage (prioritaire pour voir ce qui se passe)
    display.init();
    display.showMessage("Démarrage...");

    // 2. Initialisation du réseau
    mqtt.init(WIFI_SSID, WIFI_PASS, MQTT_IP);
    
    // 3. Initialisation LoRa
    // On passe les pins (ex: 5, 14, 2) et la fréquence
    if (lora.begin(5, 14, 2, 868E6)) {
        display.showMessage("Système Prêt !");
    } else {
        display.showMessage("Erreur LoRa !");
        while(1); 
    }
}

void loop() {
    // Maintenance du lien MQTT (reconnexion auto)
    mqtt.loop();

    // Écoute des messages LoRa venant des Post-its
    String incoming = lora.getIncomingMessage();
    
    if (incoming != "") {
        // Action 1 : On l'affiche sur l'écran local de la Gateway
        display.showMessage("Reçu: " + incoming);

        // Action 2 : On l'envoie vers ton PC (MongoDB)
        mqtt.relayLoraMessage(incoming, lora.getRSSI());
    }
}