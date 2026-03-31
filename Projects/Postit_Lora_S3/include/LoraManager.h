#ifndef LORA_MANAGER_H
#define LORA_MANAGER_H

#include <RadioLib.h>
#include "esp_sleep.h"

#define LORA_CS    7
#define LORA_DIO1  34
#define LORA_RST   5
#define LORA_BUSY  4

class LoraManager {
public:
    LoraManager();
    bool begin();
    bool receive(String &payload); // Ton nom de fonction
    void setWakeUp();             // Ton nom de fonction
private:
    SX1262* _radio;
    Module* _mod;
};

#endif