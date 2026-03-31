#ifndef DISPLAY_SERVICE_H
#define DISPLAY_SERVICE_H

#include <GxEPD2_BW.h> // Bibliothèque de référence pour e-Ink

class DisplayService {
public:
    // On initialise l'écran (les pins dépendront de ton câblage)
    void init() {
        // Initialisation de l'écran ici
        Serial.println("Écran e-Ink initialisé.");
    }

    void showMessage(String msg) {
        Serial.print("Affichage sur écran : ");
        Serial.println(msg);
        // Ici le code spécifique pour dessiner le texte sur l'e-Ink
    }

    void showStatus(bool mqttOk, bool loraOk) {
        // Petite icône ou texte de statut en haut de l'écran
    }
};

#endif