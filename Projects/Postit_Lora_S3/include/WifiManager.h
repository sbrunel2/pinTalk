#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>

class WifiManager {
public:
    void begin(const char* ssid, const char* password);
    bool isConnected();
    void sendToCloud(String message); // Pour simuler l'envoi (HTTP ou MQTT)
};

#endif