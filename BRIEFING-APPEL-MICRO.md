# Briefing : le micro du robot et l'appel famille dans les deux sens

**Date :** 9 novembre 2026. **Pour :** l'agent qui termine la fonction « Appel famille » de Bellatrix.
**Robot :** LuckiBot Pro « Bellatrix » (Orionstar), `192.168.69.157:5555`, Bellatrix **1.13.0** installé.

---

## 1. L'essentiel

- **Le micro du robot n'est PAS bloqué.** Bellatrix 1.13.0 entend la voix dans sa WebView, avec **exactement** l'appel `getUserMedia` de `js/familycall.js`. C'est mesuré, avec la voix de l'utilisatrice devant le robot.
- L'ancienne idée « l'assistant Orionstar garde le micro, il faut des AirPods, un micro USB ou un réglage » est **fausse**. Elle venait d'un test du 5 novembre fait avec l'ancienne app (Care Lab 1.3.1).
- **Il ne faut pas** : acheter un micro, utiliser le kit Orionstar (SkillApi), toucher aux réglages vocaux du robot, ni ajouter un pont audio natif.
- **Ce qui manque pour un appel complet :** un vrai test d'appel avec un deuxième appareil, la vérification du son et de l'écho côté robot, puis HTTPS + STUN/TURN + un serveur hébergé pour appeler depuis l'extérieur. Le plan exact est en **partie 6**.

---

## 2. Le robot (faits mesurés)

| Élément | Valeur |
|---|---|
| Modèle / système | OS-R-DR02, Android 9 (SDK 28), build user, ROM V10.5.2025012015.PROBUO |
| Écran de tête | 1920x1080, densité 280 (les apps tierces démarrent d'abord à 560, puis passent à 280) |
| WebView | `com.android.webview` **95.0.4638.74** (Chrome 95) |
| adb | `C:\Users\GIGABYTE\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe -s 192.168.69.157:5555` (sous Git Bash : `export MSYS_NO_PATHCONV=1`) |
| Bellatrix | `de.labland.bellatrix` (Care Team, `.StaffActivity`) et `de.labland.bellatrix.patient`, version 1.13.0. Permissions accordées : RECORD_AUDIO, CAMERA, MODIFY_AUDIO_SETTINGS |
| Qui enregistre le micro en permanence | `com.ainirobot.home` (uid 1000, service vocal Orionstar `com.ainirobot.speechasrservice:asr`), source MIC 16 kHz, depuis le démarrage. **Ça n'empêche pas** une autre app d'enregistrer aussi (voir 4.4 et 4.6). |
| Volumes | STREAM_MUSIC (haut-parleur) : 6/15. **STREAM_VOICE_CALL : 4/5.** Mode audio : NORMAL |
| Bluetooth | jamais allumé (puce « QCOM-BTD »). Inutile pour l'appel. |
| Extinction automatique | chaque nuit à 00:30 (`robot_setting_shutdown_time`) |

---

## 3. Ce qu'on croyait, et pourquoi c'était faux

Le 5 novembre, un test `getUserMedia` dans **Care Lab 1.3.1** a donné 4 secondes de silence numérique pur (que des zéros). On en a conclu que l'assistant Orionstar gardait le micro. Cette conclusion est notée dans `DEMO-APPEL-FAMILLE.md` (ligne 47) et dans `TEST-ROBOT-1.12.md` (partie 2, « À savoir »). **Ces deux phrases sont maintenant fausses et sont à corriger.**

La version actuelle a tout ce qu'il faut : RECORD_AUDIO et MODIFY_AUDIO_SETTINGS dans le manifeste et accordées, `onPermissionRequest` qui accorde caméra et micro à `app.bellatrix` (`WebActivity.java:117-119`), et `setMediaPlaybackRequiresUserGesture(false)` (`WebActivity.java:77`). La cause exacte du silence de 1.3.1 n'a pas été recherchée, car le chemin actuel marche.

---

## 4. Les tests du 9 novembre et leurs résultats

### 4.1 Les réglages du robot
- Settings → **Voice Settings** contient seulement **Speech Recognition >**, **VAD Time-Delay** (300) et **Speech Rate**. « Speech Recognition » ouvre « Detection Range » (Center 0 / Angle 80) : c'est la direction d'écoute, **pas** un interrupteur.
- Il n'y a **aucun** interrupteur on/off visible pour la reconnaissance vocale. L'option existe dans le code de l'app Réglages (clé `robot_enable_asr_switch`), mais elle est cachée sur cette ROM.

### 4.2 Le kit Orionstar dans le robot (pour info : ne pas l'utiliser)
- `CoreService.apk` contient `com.ainirobot.coreservice.client.speech.SkillApi` (AIDL `com.ainirobot.coreservice.ISkill`). Pour s'y connecter, une app fait `bindService` vers `com.ainirobot.speechasrservice/.SpeechService`, avec une Intent dont l'action est le nom de son propre paquet.
- Codes de transaction (`ISkill$Stub$Proxy`) : `setASREnabled` = 7 (oneway), `setRecognizable` = 8 (oneway), `isRecognizable` = 50, `onCreate`/`onForeground`/`onBackground`/`onDestroy` = 30 à 33.
- **Les journaux du robot montrent que ça ne sert à rien :**
  - `SkillServer: setASREnabled ... this api has deprecated` : cet appel est ignoré.
  - `SpeechStatus: setRecognizable Settings ASR Switch :0 ,real isRecognizable=false` : `robot_enable_asr_switch` vaut **0 par défaut**. Cette clé n'est pas dans `settings list global` et personne ne l'a jamais écrite. La reconnaissance vocale d'Orionstar est donc déjà éteinte par le réglage d'usine, et `setRecognizable(true)` ne peut pas la rallumer.
- Quand une app tierce s'ouvre, `ModuleManager` en fait le `mActiveAppModule`, et elle le reste après sa fermeture. C'est le comportement normal du robot.

### 4.3 La mesure native : l'app de test « Test son »
Une petite app séparée (`de.labland.testson`, **désinstallée depuis**) enregistrait 3,5 s avec `AudioRecord` (16 kHz mono) pour chaque source Android. Pendant ce temps, l'assistant du robot enregistrait aussi.

| Source AudioRecord | Essai 1 (bruit de la pièce) | Essai 2 (l'utilisatrice parle) | Essai 3 (l'utilisatrice parle) |
|---|---|---|---|
| MIC | 68 % | 68 % | 60 % |
| VOICE_COMMUNICATION | 15 % | 68 % | 47 % |
| VOICE_RECOGNITION | 0 % (signal réel, non nul) | 56 % | 70 % |
| CAMCORDER | 1 % (réel) | 69 % | 67 % |
| UNPROCESSED | 1 % (réel) | 33 % | 68 % |
| DEFAULT | 30 % | 43 % | 70 % |

Les pourcentages sont des pics par rapport au maximum (32767). Dans tous les essais, 80 à 99 % des échantillons étaient non nuls : c'est du vrai son, pas du silence numérique.

**Conclusion :** Android et le matériel laissent une app tierce enregistrer en même temps que l'assistant.

### 4.4 Le test décisif : le micro dans Bellatrix 1.13.0 (WebView)
**Méthode :**
- Bellatrix a été ouvert sur `.StaffActivity`, la page `https://app.bellatrix/staff.html?robot=1`.
- Le débogage WebView est actif (`WebActivity.java:70`). Depuis le PC : `adb forward tcp:9339 localabstract:webview_devtools_remote_<pid>`, puis `Runtime.evaluate` avec `userGesture: true`, via Python `websocket-client`.
- Un écran temporaire (overlay) demandait de parler devant le robot. Les niveaux mesurés (47 à 85 %) sont des niveaux de voix ; l'utilisatrice était devant le robot.

| Test | Contraintes | Résultat |
|---|---|---|
| 1. Comme l'appel | `audio: {echoCancellation, noiseSuppression, autoGainControl: true}` + `video: {facingMode:'user', 640x480}` (identique à `familycall.js:135-136`) | piste `live`, non muette, 16 kHz mono, AEC/NS/AGC actifs. **Pic 47 %**, 96 % d'échantillons non nuls. AudioContext `running`. |
| 2. Audio seul | mêmes contraintes audio, `video: false` | **Pic 85 %**, 96 % non nuls |
| 3. Mini-appel dans le robot | deux `RTCPeerConnection` en local, ICE vide | `connected`, **`media-source` audioLevel côté envoi : 83 %**, 411 paquets audio reçus (environ 50/s, des trames Opus de 20 ms). Le niveau à la réception valait 0, parce que la piste reçue n'était jouée nulle part : c'est un artefact connu de Chrome, pas un problème. |

**Conclusion :** la voix entre bien dans le pipeline WebRTC de Bellatrix. Le code actuel de l'appel n'a **pas besoin d'être modifié pour le micro**.

### 4.5 Ce qui n'est PAS encore prouvé
- Que l'autre appareil **entende** vraiment la voix du robot au cours d'un vrai appel (le test 3 prouve l'envoi, pas l'écoute).
- Que le robot **joue** le son de la famille assez fort, et sur le bon haut-parleur. Pendant un appel WebRTC, Chrome passe Android en `MODE_IN_COMMUNICATION` : le son sort alors sur **STREAM_VOICE_CALL**, réglé à 4/5, et non sur STREAM_MUSIC.
- L'**écho** : le haut-parleur et le micro sont tout proches dans la tête du robot.
- Un appel depuis un **téléphone** et depuis l'**extérieur** du réseau du bureau.

---

## 5. Pour refaire la mesure du micro dans Bellatrix (une minute)

```bash
export MSYS_NO_PATHCONV=1
ADB=".../platform-tools/adb.exe"; S="-s 192.168.69.157:5555"
"$ADB" $S shell am start -n de.labland.bellatrix/.StaffActivity
PID=$("$ADB" $S shell pidof de.labland.bellatrix | tr -d '\r')
"$ADB" $S forward tcp:9339 localabstract:webview_devtools_remote_$PID
# http://127.0.0.1:9339/json -> webSocketDebuggerUrl de la page app.bellatrix,
# puis Runtime.evaluate {expression, awaitPromise:true, userGesture:true, returnByValue:true}
"$ADB" $S forward --remove tcp:9339
```

Le JavaScript à évaluer (version courte) :

```js
(async () => {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext(); await ctx.resume();
  const an = ctx.createAnalyser(); ctx.createMediaStreamSource(s).connect(an);
  const b = new Float32Array(2048); let peak = 0; const end = Date.now() + 5000;
  while (Date.now() < end) { await new Promise(r => setTimeout(r, 50)); an.getFloatTimeDomainData(b); for (const v of b) peak = Math.max(peak, Math.abs(v)); }
  s.getTracks().forEach(t => t.stop()); ctx.close();
  return 'peak ' + Math.round(peak * 100) + ' %';   // > 10 % en parlant : le micro marche
})()
```

On peut aussi utiliser `chrome://inspect` dans le Chrome du PC, qui voit la WebView du robot à travers adb.

---

## 6. Ce qu'il faut faire, exactement, pour que l'appel marche dans les deux sens

### Étape A : un vrai appel au bureau, sur le même Wi-Fi, le PC joue la famille (aucun changement de code)
1. Sur le PC, lance **`Start robot test server.bat`** (`node labland/store-server.mjs 8765 --lan`). Autorise Node.js sur le réseau privé, puis note l'adresse affichée (par exemple `http://192.168.69.167:8765`).
2. Sur le robot : Care Team → **Family** → **Call server**. Entre cette adresse, puis **Save**. Ajoute un contact (Maria / « votre fille » / « Maman » / la langue) et coche **Accept calls now**.
3. Sur le PC, ouvre le lien famille affiché par le serveur, `http://localhost:8765/famille.html#t=…`, dans Chrome. `localhost` compte comme une adresse sécurisée, donc caméra et micro sont autorisés.
   - **Important :** le PC doit être dans **une autre pièce**, ou utiliser **un casque**. Sinon, le haut-parleur du PC et celui du robot, dans la même pièce, créent de l'écho et un larsen qui ne viennent pas du robot.
4. Sur le robot, ouvre l'écran patient (**Bellatrix Patient**) et laisse-le en attente. Sur le PC, clique **Appeler Maman**. Le robot sonne : réponds avec **Répondre**.
5. **Vérifie, une ligne à la fois :**
   - [ ] La personne au PC **entend** la personne devant le robot (dans `chrome://webrtc-internals` sur le PC : `inbound-rtp` audio, `audioLevel` > 0 quand on parle au robot).
   - [ ] La personne devant le robot **entend** le PC, assez fort. **Plus fort** monte le volume de l'élément vidéo, jusqu'à 1.0.
   - [ ] Pas d'écho : la personne au PC ne s'entend pas revenir.
   - [ ] La vidéo passe dans les deux sens.
   - [ ] On peut raccrocher des deux côtés, et l'appel apparaît dans **Results**.
6. Pendant l'appel, regarde le côté robot : `"$ADB" $S shell dumpsys audio | grep -i "mode\|STREAM_VOICE_CALL" -A3` (le mode attendu est IN_COMMUNICATION), et la WebView via DevTools (partie 5).

### Étape B : corriger le son côté robot, seulement si l'étape A montre un problème
- **Le son de la famille est trop faible, ou sort au mauvais endroit, sur le robot :** c'est le flux STREAM_VOICE_CALL (4/5) qui sert pendant un appel WebRTC. Dans `WebActivity.java`, ajoute au pont JS deux fonctions, `callAudio(true/false)`, appelées par `familycall.js` quand l'appel est connecté, puis quand il se termine :
  - **Au début :** `AudioManager.setMode(MODE_IN_COMMUNICATION)`, `setSpeakerphoneOn(true)`, `setStreamVolume(STREAM_VOICE_CALL, getStreamMaxVolume(STREAM_VOICE_CALL), 0)` et `setVolumeControlStream(STREAM_VOICE_CALL)`. Garde les valeurs d'avant.
  - **À la fin :** remets les valeurs d'avant, `setSpeakerphoneOn(false)` et `MODE_NORMAL`.
  - Puis refais l'étape A.
- **Il y a de l'écho chez la famille :** garde `echoCancellation: true` (c'est déjà le cas, et l'AEC est active d'après `getSettings()`). Essaie un volume du robot un peu plus bas. S'il reste de l'écho, compare avec le test 3 de la partie 4.4 en jouant la piste reçue. **N'enlève pas** `noiseSuppression` ni `autoGainControl`.
- Ne touche pas au repli `needTap` de `familycall.js:455-474` : il rattrape un éventuel blocage de la lecture automatique.

### Étape C : la famille sur un vrai téléphone, depuis n'importe quel réseau
1. **HTTPS pour la page famille.** `famille.js:288` refuse la caméra et le micro si `!window.isSecureContext`, ce qui est voulu. Un téléphone qui ouvre `http://192.168.x.x:8765` sera donc bloqué.
   - **Pour un test :** un tunnel HTTPS vers `localhost:8765`, par exemple `cloudflared tunnel --url http://localhost:8765`, qui donne une adresse `https://….trycloudflare.com`. ⚠️ Installer cloudflared sur le PC demande **l'accord de l'utilisatrice** : elle avait mis ce point de côté.
   - **Sur le robot :** dans **Call server**, mets la même adresse `https://…`. Le robot y accède sans problème : mixed content et cleartext sont autorisés (`WebActivity.java:85`, `usesCleartextTraffic`), et le serveur envoie `Access-Control-Allow-Origin: *`.
2. **STUN + TURN.** Aujourd'hui, `var ICE = []` dans **`familycall.js:22`** et dans **`famille.js:11`** : seules les adresses locales sont échangées, donc ça ne marche que sur le même réseau.
   - Ajoute un STUN et un **TURN**, par exemple coturn sur le serveur LabLand, avec des identifiants à durée limitée. Pour un test seulement, on peut utiliser un service TURN gratuit ou payant.
   - Le mieux : `call-relay.mjs` sert la liste ICE (par exemple `GET call/api/ice`), et les deux pages la lisent, au lieu d'écrire les adresses en dur à deux endroits.
3. **Le délai de collecte ICE.** La signalisation est *non-trickle* : la description complète part une seule fois, après au plus **2 s** de collecte (`familycall.js:119`, et la même logique côté famille). Avec un TURN, les candidats relais arrivent souvent après 2 s. Monte ce délai à environ 5 s, ou passe au trickle ICE.
4. Teste : téléphone en **4G** (Wi-Fi coupé) ↔ robot au bureau. Puis un téléphone sur une autre box.

### Étape D : la production (décision du boss, après le 14 novembre)
- Un serveur LabLand en UE (Hetzner, OVH ou IONOS, environ 5 à 20 €/mois) avec `store-server.mjs` + `call-relay.mjs`, **HTTPS** avec un domaine fixe (par exemple `appel.labland.ai`), **coturn** et une authentification pour le personnel.
- Le robot est préconfiguré avec l'adresse du serveur à l'installation : la maison de soins n'a rien à régler.
- Corrige les docs : `DEMO-APPEL-FAMILLE.md` (ligne 47, « le micro est gardé par l'assistant ») et `TEST-ROBOT-1.12.md` (partie 2, « À savoir »). Le micro marche.

---

## 7. À ne pas faire
- Ne pas appeler `SkillApi` / `ISkill`, ne pas faire `settings put … robot_enable_asr_switch`, et ne pas forcer l'arrêt des services `com.ainirobot.*` : c'est inutile (partie 4.2) et ça peut perturber le robot.
- Ne pas acheter de micro Bluetooth ou USB, ni de haut-parleur de conférence, avant que l'étape A montre un vrai problème.
- Ne pas remplacer `getUserMedia` par un pont audio natif : ce n'est pas nécessaire.
- Rappel de l'utilisatrice : l'appel devait être repris **après le 14 novembre 2026**. Le projet Care Lab doit être prêt pour cette date. Vérifie avec elle avant de commencer l'étape C (cloudflared, services externes).

## 8. L'état laissé sur le robot
- L'app « Test son » (`de.labland.testson`) est **désinstallée**.
- Aucun réglage du robot n'a été modifié. Le robot est sur son écran d'accueil.
- La redirection `adb forward tcp:9339` est retirée. Une autre redirection, `tcp:9229 → webview_devtools_remote_17502`, existait déjà : elle ne vient pas de ce travail et a été laissée telle quelle.
