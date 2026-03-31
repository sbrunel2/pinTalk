#ifndef LORA_SERVICE_H
#define LORA_SERVICE_H

#include <SPI.h>
#include <LoRa.h>

class LoraService {
public:
    // Initialisation avec les pins (à remplir plus tard)
    bool begin(int ss, int rst, int dio0, long frequency) {
        LoRa.setPins(ss, rst, dio0);
        if (!LoRa.begin(frequency)) {
            Serial.println("Erreur LoRa : matériel non détecté.");
            return false;
        }
        Serial.println("LoRa initialisé avec succès.");
        return true;
    }

    // Vérifie si un message est arrivé et le retourne
    String getIncomingMessage() {
        int packetSize = LoRa.parsePacket();
        if (packetSize) {
            String incoming = "";
            while (LoRa.available()) {
                incoming += (char)LoRa.read();
            }
            return incoming;
        }
        return "";
    }

    int getRSSI() {
        return LoRa.packetRssi();
    }
};

#endif