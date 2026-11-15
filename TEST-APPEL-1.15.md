# Tester l'appel vidéo famille avec le robot (version 1.15)

Le micro du robot marche dans Bellatrix (mesuré le 9 novembre). Il reste à faire **un vrai appel** avec un deuxième appareil, et à vérifier le son et l'écho côté robot. Compte 20 minutes.

> **1.16 :** pour le test complet avec un vrai téléphone (portail famille, messages, album, Premium, écoute ensemble et appels), suis **`TEST-TELEPHONE-1.16.md`**. Ce document-ci reste la référence pour le son du robot, l'écho et le TURN. Dans la Care Team 1.16, les réglages d'appel sont dans **Famille → Appels → Réglages**.

**Nouveau en 1.15**
- **Deux sens d'appel.** La famille appelle le robot avec son lien personnel (comme avant). Et l'équipe peut maintenant appeler la famille : Care Team → **Famille** → un contact → **Appeler Maria**. Le robot attend sur l'écran patient (« On appelle Maria… »). L'équipe envoie le lien (QR code, **Copier le lien**, **WhatsApp**, **SMS**), Maria touche **Rejoindre**, et l'appel démarre tout seul. Le lien sert une fois et dure 30 minutes.
- **Le son du robot pendant l'appel.** Quand l'appel est connecté, Bellatrix passe en mode appel, sur le haut-parleur, avec le volume d'appel au maximum. À la fin, tout revient comme avant. Ce réglage est dans **Famille → Appels → Réglages → Son de l'appel au maximum** (activé par défaut).
- **STUN/TURN depuis le serveur.** Les deux pages demandent la liste au serveur. Par défaut, c'est un STUN public. Un TURN s'ajoute plus tard dans `labland/data/ice.json`, sans changer le code.
- **L'onglet Famille est plus simple**, et il est en français, en allemand ou en anglais, comme le reste de la Care Team.

---

## Étape A : un appel au bureau, le PC joue la famille

1. **Sur le PC :** lance **`Start robot test server.bat`**. Autorise Node.js sur le réseau privé, puis note l'adresse affichée, par exemple `http://192.168.69.167:8765`.
2. **Sur le robot :** ouvre Care Team → **Famille** → **Appels** → **Réglages**. Dans **Adresse du serveur d'appel**, entre l'adresse du PC, puis touche **Enregistrer**.
3. Toujours sur le robot, ajoute un contact (par exemple Maria, « votre fille », la famille l'appelle « Maman ») et coche **Accepter les appels maintenant**.
4. **Sur le robot :** ouvre l'écran patient (**Bellatrix Patient**) et laisse-le en attente.
5. **Sur le PC :** la fenêtre du serveur affiche le lien famille `http://localhost:8765/famille.html#t=…`. Ouvre-le dans Chrome.
   - ⚠️ Le PC doit être **dans une autre pièce**, ou utiliser **un casque**. Sinon, les deux haut-parleurs dans la même pièce font de l'écho ou un larsen, et ce n'est pas la faute du robot.
6. Sur le PC, clique **Appeler Maman**. Le robot sonne : réponds avec **Répondre**.

**Vérifie, une ligne à la fois :**
- [ ] Au PC, on **entend** la personne devant le robot.
- [ ] Devant le robot, on **entend** le PC, assez fort. Si c'est trop bas, appuie sur **Plus fort** (il monte jusqu'au maximum).
- [ ] **Pas d'écho :** la personne au PC ne s'entend pas revenir.
- [ ] La **vidéo** passe dans les deux sens.
- [ ] On peut **raccrocher des deux côtés** : une fois depuis le robot, une fois depuis le PC.
- [ ] L'appel apparaît dans **Résultats**, et aussi sous **Famille → Derniers appels**.

**Pendant l'appel, vérifie le mode audio du robot :**

```bash
export MSYS_NO_PATHCONV=1
ADB="C:/Users/GIGABYTE/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe"
"$ADB" -s 192.168.69.157:5555 shell dumpsys audio | grep -i -E "mode|STREAM_VOICE_CALL" -A3
```

Pendant l'appel, on doit voir **`MODE_IN_COMMUNICATION`**, et le volume de STREAM_VOICE_CALL au maximum (5/5). Après l'appel, on doit revoir **`MODE_NORMAL`**, avec le volume d'avant (4/5). Dans les journaux, la ligne `Call sound: IN_COMMUNICATION, speaker on…` (tag `Bellatrix`) le confirme aussi.

**Puis dans l'autre sens :** sur le robot, Care Team → **Famille** → **Appeler Maria**. Le robot affiche « On appelle Maria… ». Sur le PC, ouvre le lien affiché (bouton **Ouvrir**, ou le lien `#j=` dans la fenêtre du serveur), puis clique **Rejoindre**. Refais la même liste de vérification.

S'il y a un problème :
- **Le son du robot est trop faible :** vérifie que **Son de l'appel au maximum** est coché, puis refais `dumpsys audio`.
- **Il y a de l'écho chez la famille :** décoche **Son de l'appel au maximum**, puis compare. Ne retire pas l'annulation d'écho : elle est active.

---

## Étape C : la famille sur un vrai téléphone, en 4G (avec le tunnel HTTPS)

Un téléphone n'accepte la caméra et le micro que sur une adresse **https**. Pour un test, on ouvre un tunnel HTTPS temporaire vers le PC avec **cloudflared**, déjà dans `tools\cloudflared\`.

1. Sur le PC, lance **`Start phone test.bat`**. Il démarre le serveur d'appel s'il ne tourne pas déjà, puis le tunnel. Au bout de quelques secondes, il affiche en grand une adresse comme `https://mots-au-hasard.trycloudflare.com`.
2. **Sur le robot :** Care Team → **Famille** → **Appels** → **Réglages** → **Adresse du serveur d'appel**. Entre cette adresse `https://…`, puis touche **Enregistrer**.
3. Les liens famille commencent maintenant par cette adresse. Envoie à un téléphone **en 4G, Wi-Fi coupé**, soit le lien personnel (**Copier son lien**), soit un appel de l'équipe (**Appeler Maria** → WhatsApp, SMS ou le QR code). Depuis la 1.16, la famille peut aussi appeler depuis son portail (`https://…/portail.html`, bouton **Appel vidéo avec …**), quand l'équipe a choisi son lien dans **Famille → Comptes → Lien d'appel vidéo**.
4. Fais la même liste de vérification que pour l'étape A.
5. Pour arrêter, ferme la fenêtre du tunnel. **L'adresse change à chaque fois** : il faut la remettre sur le robot au test suivant.

À savoir :
- L'adresse du tunnel est publique tant qu'il tourne : ne laisse pas tourner le tunnel. La page d'administration LabLand reste fermée à travers le tunnel.
- `Start phone test.bat --check` montre seulement quel cloudflared sera utilisé, avec sa version, sans rien démarrer.
- La fenêtre de `Start phone test.bat` affiche aussi l'adresse du **portail famille** (`…/portail.html`).
- Si le téléphone appelle mais que la vidéo ne passe pas en 4G, il manque un **TURN**. Sans TURN, fais l'appel en Wi-Fi. Un STUN seul ne suffit pas sur certains réseaux mobiles. Le TURN se met dans `labland/data/ice.json`, par exemple :

```json
{ "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }],
  "turn": { "urls": ["turn:turn.exemple.fr:3478?transport=udp", "turns:turn.exemple.fr:5349"], "secret": "le static-auth-secret de coturn", "ttl": 21600 } }
```

Le serveur donne alors à chaque appel des identifiants TURN valables 6 heures. On peut aussi passer `ICE_SERVERS`, `TURN_SECRET` et `TURN_URLS` en variables d'environnement.

---

## Ce qu'il ne faut pas faire
- Ne touche pas aux réglages vocaux du robot, ni au kit Orionstar (SkillApi). Ne force pas l'arrêt des services `com.ainirobot.*`.
- N'achète pas de micro ni de haut-parleur avant que l'étape A montre un vrai problème.
