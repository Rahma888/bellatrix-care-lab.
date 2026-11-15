# Installation au bureau (préparée le 14/11/2026 au soir)

Rien n'a été installé sur le robot ni sur la tablette depuis 14 h 51.
Les 32 suites de tests passent. Les APK sont dans `android\` :

| Fichier | Pour | Taille |
|---|---|---|
| `Bellatrix.apk` | la tête du robot (Care Team + serveur complet : Node + Cloudflare) | 70 Mo |
| `BellatrixTablet.apk` | la grande tablette | 33 Mo |

Version : toujours 1.16.0. Installer avec `install -r` (mise à jour) : **ne jamais désinstaller**,
sinon la tablette perd ses réglages du pointage validés le 14/11
(`bellatrix-hands-rot` = 270, `bellatrix-cam-rot` = 270, `bellatrix-cam-flipx` = 0).

## 1. La tête (192.168.69.103)

```bash
adb -s 192.168.69.103:5555 install -r android/Bellatrix.apk
```

Ouvrir Care Team sur la tête, puis regarder le journal :

```bash
adb -s 192.168.69.103:5555 logcat -s Bellatrix
```

On doit voir dans l'ordre : « server files ready », « Node answers on 8765 »,
« cloudflared starts », « public address https://… ».

Puis sur la tête : Famille → Appels → Réglages → bloc « Serveur du robot » : « En marche », QR code et adresse.
Depuis le PC : `curl http://192.168.69.103:8765/head/api/info` doit répondre `{"node":"running","tunnel":"https://…"}`.

Si Node ne démarre pas, la liaison tête ↔ tablette continue comme avant (LinkServer).

## 2. La tablette (192.168.69.186, débogage sans fil : nouveau port à chaque fois)

```bash
adb -s 192.168.69.186:<port> install -r android/BellatrixTablet.apk
```

## 3. À vérifier sur place

1. Pointage avec la Logitech : un bouton tout en haut et un tout en bas.
2. Un téléphone sur le **même Wi-Fi** scanne le QR code de la tête, ouvre le portail dans Safari ou Chrome (pas Messenger).
3. Créer un compte avec un code d'invitation → le valider sur la tête.
4. Envoyer un message → la tête affiche « 1 message pour Anna » → « Aller voir Anna » → choisir le lieu une fois → le robot y va → le message s'affiche sur la tablette → les coches deviennent bleues sur le téléphone.
5. Demander un appel depuis le téléphone → « Aller voir Anna » → sur la tablette « Appeler Sophie » → l'appel se connecte.
6. « Ajouter un jeu » sur la tête → QR code → coller un lien GitHub public d'un petit jeu HTML → le jeu apparaît dans « Jeux de l'équipe ».
7. Redémarrer l'app Care Team : l'adresse publique change, les comptes restent.

## Limites connues

- Téléphone en 4G/5G et robot sur le Wi-Fi de la clinique : la vidéo ne passe pas sans serveur relais (payant).
- L'adresse publique change à chaque démarrage de l'app de la tête : les familles rescannent le QR code.
- Un appel direct de la famille ne sonne sur la tablette qu'après une première visite « Aller voir … ».
- L'OBSBOT Meet SE ne fonctionne pas sur ces tablettes MediaTek : garder la Logitech.
