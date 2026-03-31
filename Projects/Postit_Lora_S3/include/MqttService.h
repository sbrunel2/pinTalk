#ifndef MQTT_SERVICE_H
#define MQTT_SERVICE_H

#include <WiFi.h>
#include <PubSubClient.h>

class MqttService {
private:
    WiFiClient espClient;
    PubSubClient client;
    const char* _mqttServer;

public:
    MqttService() : client(espClient) {}

    void init(const char* ssid, const char* password, const char* mqttServer) {
        _mqttServer = mqttServer;
        WiFi.begin(ssid, password);
        client.setServer(_mqttServer, 1883);
    }

    void connect() {
        if (WiFi.status() != WL_CONNECTED) return; 

        while (!client.connected()) {
            Serial.print("Connexion MQTT...");
            if (client.connect("Gateway_ESP32_Pro")) {
                Serial.println("Connecté ✅");
            } else {
                Serial.print("Erreur "); Serial.print(client.state());
                Serial.println(" - Retente dans 5s");
                delay(5000);
            }
        }
    }

    void loop() {
        if (!client.connected()) connect();
        client.loop();
    }

    // Envoi au format JSON pour MongoDB
    void relayLoraMessage(String message, int rssi) {
        String payload = "{\"gatewayId\":\"G01\", \"text\":\"" + message + "\", \"rssi\":" + String(rssi) + "}";
        client.publish("gateways/G01/rx", payload.c_str());
        Serial.println("Relais MQTT envoyé !");
    }
};

#endif