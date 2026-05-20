async function uploadFile(input) {
    if (!input.files[0] || !currentUser) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);

    const pid = document.getElementById('sel-pos').value; // On récupère l'ID du pintalk actuel

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/upload', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        const data = await res.json();

        // 1. Envoi du message avec l'image
        socket.emit('send-message', {
            groupId: document.getElementById('sel-group').value,
            deviceId: document.getElementById('sel-dev').value,
            postitId: pid,
            content: data.url,
            senderName: currentUser.name,
            type: 'image'
        });

        // 2. MISE À JOUR AUTOMATIQUE DU STATUT
        // On informe le serveur que ce pintalk passe en "En caisse"
        socket.emit('update-postit-status', { 
            postitId: pid, 
            status: "En caisse", 
            comment: "" // Pas de commentaire nécessaire pour cette action auto
        });

    } catch (err) { 
        console.error("Erreur upload ou statut:", err); 
    }
}



// Fonction de gestion du changement via Select
function toggleUploadMenu() {
    document.getElementById('upload-menu').classList.toggle('hidden');
}

function triggerUpload(type) {
    document.getElementById('up-' + type).click();
    toggleUploadMenu();
}

// Fonction utilitaire pour filtrer selon l'état du bouton 💾€
// ── Messages vocaux ──────────────────────────────────────────────────────────
let _speechRecognition = null;

// ── Enregistrement vocal ──────────────────────────────────────────────────────
// Comportement :
//   1er appui → active la reconnaissance vocale, écrit dans msg-input en temps réel
//   Bouton Envoyer → envoie le texte ET arrête la reconnaissance
//   2e appui sur micro → annule sans envoyer

function _stopSpeechRecognition() {
    if (_speechRecognition) {
        try { _speechRecognition.stop(); } catch(e) {}
        _speechRecognition = null;
    }
    _isRecording = false;
    const btn = document.getElementById('btn-mic');
    const dot = document.getElementById('mic-dot');
    if (btn) { btn.classList.remove('recording'); btn.title = 'Dicter un message'; }
    if (dot) dot.style.display = 'none';
}

function toggleRecording() {
    if (_isRecording) {
        // 2e appui → annuler sans envoyer
        _stopSpeechRecognition();
        _vibrate([20, 50, 20]);
        return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        alert('Dictée vocale non supportée. Utilisez Chrome ou Safari.');
        return;
    }

    const input = document.getElementById('msg-input');
    const btn   = document.getElementById('btn-mic');
    const dot   = document.getElementById('mic-dot');

    _speechRecognition = new SpeechRec();
    _speechRecognition.continuous     = true;
    _speechRecognition.interimResults = true;  // résultats partiels en temps réel
    const langMap = { fr:'fr-FR', en:'en-US', es:'es-ES', de:'de-DE', it:'it-IT' };
    _speechRecognition.lang = langMap[localStorage.getItem('lang') || 'fr'] || 'fr-FR';

    let _finalTranscript = '';

    _speechRecognition.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                _finalTranscript += e.results[i][0].transcript + ' ';
            } else {
                interim += e.results[i][0].transcript;
            }
        }
        // Afficher dans la zone de message en temps réel
        if (input) {
            input.value = _finalTranscript + interim;
            autoResizeInput(input);
        }
        // Réarmer le timer de pause (2.5s de silence → virgule)
        if (_pauseTimer) clearTimeout(_pauseTimer);
        if (_isRecording && _finalTranscript.trim()) {
            _pauseTimer = setTimeout(_insertPauseSep, 2500);
        }
    };

    _speechRecognition.onerror = e => {
        console.warn('Speech error:', e.error);
        if (e.error === 'not-allowed') {
            alert('Accès micro refusé. Autorisez-le dans les réglages du navigateur.');
        }
        _stopSpeechRecognition();
    };

    // Détection de pause : timer qui insère une virgule si silence > 2s
    let _pauseTimer = null;
    const _insertPauseSep = () => {
        if (!_isRecording || !input) return;
        const cur = input.value.trimEnd();
        if (cur.length > 0 && !cur.endsWith(',') && !cur.endsWith('.') && !cur.endsWith(';')) {
            input.value = cur + ', ';
            autoResizeInput(input);
        }
    };

    _speechRecognition.onend = () => {
        if (!_isRecording) return;
        // Insérer séparateur puis redémarrer
        _insertPauseSep();
        try { _speechRecognition?.start(); } catch(e) {}
    };

    try {
        _speechRecognition.start();
        _isRecording = true;
        if (btn) { btn.classList.add('recording'); btn.title = 'Dictée active — Appuyez sur Envoyer ou ici pour annuler'; }
        if (dot) dot.style.display = 'block';
        if (input) { input.focus(); input.placeholder = '🎙️ Parlez…'; }
        _vibrate(20);
    } catch(e) {
        alert('Impossible de démarrer la dictée : ' + e.message);
        _stopSpeechRecognition();
    }
}

async function _uploadAudio() {
    if (!_audioChunks.length) return;
    const blob = new Blob(_audioChunks, { type: 'audio/webm' });

    // Proposer : envoyer en audio OU transcrire via Web Speech API
    const useTranscribe = _speechTranscript && _speechTranscript.trim().length > 2;

    if (useTranscribe) {
        const transcribed = _speechTranscript.trim();
        _speechTranscript = '';
        _audioChunks = [];
        // Vider la zone de saisie après envoi vocal
        const inputEl = document.getElementById('msg-input');
        if (inputEl) { inputEl.value = ''; autoResizeInput(inputEl); }
        _sendTextMessage(transcribed);
        return;
    }

    // Sinon : upload audio sur Cloudinary
    const formData = new FormData();
    formData.append('file', blob, `voice_${Date.now()}.webm`);

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const audioUrl = data.url;

        const gid = currentGroupId;
        const did = document.getElementById('sel-dev')?.value || '';
        const pid = currentPostitId || document.getElementById('sel-pos')?.value;
        if (gid && pid) {
            socket.emit('send-message', {
                groupId: gid, deviceId: did, postitId: pid,
                content: audioUrl,
                senderName: currentUser?.name || '',
                type: 'audio'
            });
        }
    } catch(e) {
        console.error('Upload audio:', e);
        alert('Erreur upload audio : ' + e.message);
    }
    _audioChunks = [];
}

function _sendTextMessage(text) {
    const gid = currentGroupId;
    const did = document.getElementById('sel-dev')?.value || '';
    const pid = currentPostitId || document.getElementById('sel-pos')?.value;
    if (gid && pid && text) {
        socket.emit('send-message', {
            groupId: gid, deviceId: did, postitId: pid,
            content: text,
            senderName: currentUser?.name || '',
            type: 'text'
        });
    }
}

// ── IA : extraire un item d'une bulle et l'ajouter au pintalk ───────────────
// Analyse IA automatique après envoi de message
// Extrait PLUSIEURS items et les ajoute ligne par ligne dans le pintalk
// Supprimer les notes IA liées à un message source (avant ré-analyse)
