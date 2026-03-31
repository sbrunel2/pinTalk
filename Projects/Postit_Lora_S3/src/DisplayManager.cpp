#include "DisplayManager.h"

// Initialisation de la liste d'initialisation du constructeur
DisplayManager::DisplayManager() : 
    _display(GxEPD2_370_TC1(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)) 
{
    // Rien à mettre dans le corps du constructeur
}

void DisplayManager::begin() {
    _display.init(115200);
    _display.setRotation(1);
}

/**
 * Affiche un message structuré sur l'écran e-Paper.
 * @param iconChar Le caractère (ex: 'a', 'b') correspondant à l'icône dans fontello20pt7b.h
 * @param title Le titre du message
 * @param body Le contenu du message
 * @param batPct Le pourcentage de batterie (0-100)
 */
void DisplayManager::showMessage(int iconChar, const char* title, const char* body, int batPct) {
    
    // On définit les limites de rafraîchissement (Full Window pour un message complet)
    _display.setFullWindow();
    
    // Début de la boucle de rendu par pages (optimisation RAM de l'ESP32)
    _display.firstPage();
    do {
        // 1. Fond blanc
        _display.fillScreen(GxEPD_WHITE);
        _display.setTextColor(GxEPD_BLACK);

        // 2. DESSIN DE L'ICÔNE BATTERIE (En haut à droite)
        // On appelle la petite méthode helper créée précédemment
        this->drawBatteryIcon(_display.width() - 45, 10, batPct);

        // 3. DESSIN DE L'ICÔNE PRINCIPALE (Fontello)
        _display.setFont(&fontello20pt7b);
        _display.setCursor(15, 45); // Position X, Y
        _display.write((uint8_t)iconChar);

        // 4. DESSIN DU TITRE (Police Sans Serif)
        // On décale le titre à droite de l'icône (X=70)
        _display.setFont(&FreeSansBold12pt7b);
        _display.setCursor(75, 40); 
        _display.print(title);

        // 5. LIGNE DE SÉPARATION ÉLÉGANTE
        _display.drawFastHLine(0, 55, _display.width(), GxEPD_BLACK);

        // 6. CORPS DU MESSAGE
        // On repasse sur la police par défaut (ou une autre police GFX plus petite)
        _display.setFont(NULL); 
        _display.setTextSize(2); // On double la taille pour la lisibilité sur 3.7"
        _display.setCursor(20, 85);
        _display.print(body);

    } while (_display.nextPage()); // Fin de la boucle de rendu
}

void DisplayManager::drawBatteryIcon(int x, int y, int percentage) {
    int w = 30, h = 15;
    _display.drawRect(x, y, w, h, GxEPD_BLACK); // Corps
    _display.fillRect(x + w, y + (h/4), 3, h/2, GxEPD_BLACK); // Téton
    
    if (percentage > 5) {
        int fillW = (w - 4) * min(percentage, 100) / 100;
        _display.fillRect(x + 2, y + 2, fillW, h - 4, GxEPD_BLACK);
    }
}