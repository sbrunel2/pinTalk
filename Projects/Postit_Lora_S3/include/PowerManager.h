#ifndef POWER_MANAGER_H
#define POWER_MANAGER_H

#include <Arduino.h>
#include "esp_sleep.h"

class PowerManager {
public:
    void begin();
    float getBatteryVoltage();      // Nouvelle méthode pour la tension (ex: 3.95V)
    int getBatteryPercentage();     // Pour l'affichage (ex: 85%)
    void goToSleep();
    bool isCritical() ;
};

#endif