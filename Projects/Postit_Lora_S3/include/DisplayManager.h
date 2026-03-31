#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include "fontello20pt7b.h"

// Pins T-Energy S3
#define EPD_CS    10
#define EPD_DC    11
#define EPD_RST   12
#define EPD_BUSY  13

class DisplayManager {
public:
    // Constructeur sans argument
    DisplayManager(); 
    void begin();
    void showMessage(int iconChar, const char* title, const char* body, int batPct);

private:
    GxEPD2_BW<GxEPD2_370_TC1, GxEPD2_370_TC1::HEIGHT> _display;
    void drawBatteryIcon(int x, int y, int percentage);
};

#endif