/* "Menu", the kitchen page (cuisine.html, js/cuisine.js) in three languages: German by default, French and English
   on the switch. English is the key, like everywhere else; a text another file already translates keeps that
   translation. Dish and resident names are the kitchen's content and are never translated. ES5. */
(function () {
  'use strict';
  function addNew(l, table) {
    var have = I18N.dict[l] || {}, out = {};
    Object.keys(table).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = table[k]; });
    I18N.add(l, out);
  }
  addNew('de', {
    /* the page, the access */
    'Kitchen': 'Küche', 'Back': 'Zurück', 'Menu plan': 'Speiseplan', 'Orders': 'Bestellungen', 'Language': 'Sprache', 'One moment…': 'Einen Moment…',
    'Code of the care team': 'Code des Pflegeteams', 'Open': 'Öffnen',
    'The 6-character code shown on the robot, the same as for adding a game.': 'Der 6-stellige Code, den der Roboter zeigt, derselbe wie für „Spiel hinzufügen“.',
    'Type the 6-character code.': 'Bitte den 6-stelligen Code eingeben.', 'This code is not right.': 'Dieser Code stimmt nicht.',
    'Too many tries. Try again in 10 minutes.': 'Zu viele Versuche. Versuchen Sie es in 10 Minuten erneut.',
    'The server does not answer.': 'Der Server antwortet nicht.', 'Try again': 'Erneut versuchen',
    /* the day */
    'Previous day': 'Vorheriger Tag', 'Next day': 'Nächster Tag', 'Day': 'Tag', 'Today': 'Heute', 'Tomorrow': 'Morgen',
    'today': 'heute', 'tomorrow': 'morgen', 'yesterday': 'gestern', 'No menu yet': 'Noch kein Speiseplan',
    'Choice open until {t}': 'Wahl offen bis {t}', 'Choice closed since {t}': 'Wahl geschlossen seit {t}',
    'The deadline has passed: residents can no longer choose on the tablet.': 'Der Bestellschluss ist vorbei: Die Bewohner können am Tablet nicht mehr wählen.',
    'Change the deadline to open it again.': 'Zum erneuten Öffnen den Bestellschluss ändern.',
    'Unsaved changes will be lost. Continue?': 'Nicht gespeicherte Änderungen gehen verloren. Weiter?',
    /* the menu */
    'Lunch': 'Mittagessen', 'Dinner': 'Abendessen', 'Starter': 'Vorspeise', 'Main course': 'Hauptgang', 'Dessert': 'Nachspeise',
    'vegetarian': 'vegetarisch', 'with pork': 'mit Schwein', 'soft food': 'weiche Kost', 'for diabetics': 'für Diabetiker',
    'Order deadline': 'Bestellschluss', 'Copy the menu of…': 'Speiseplan übernehmen von…', 'Copy': 'Übernehmen', 'Empty the day': 'Tag leeren',
    '1 dish': '1 Gericht', '{n} dishes': '{n} Gerichte', 'Save': 'Speichern', 'Saving…': 'Wird gespeichert…', 'Not saved': 'Nicht gespeichert',
    'Saved at {t}': 'Gespeichert um {t}', 'Saved: no menu for this day.': 'Gespeichert: kein Speiseplan für diesen Tag.',
    'Not saved: please try again.': 'Nicht gespeichert: bitte erneut versuchen.', 'Every dish needs a name.': 'Jedes Gericht braucht einen Namen.',
    'Dish name': 'Name des Gerichts', 'Short description': 'Kurze Beschreibung', 'Allergens, separated by commas': 'Allergene, mit Komma getrennt',
    'Add a photo': 'Foto hinzufügen', 'Remove the photo': 'Foto entfernen', 'Uploading…': 'Wird hochgeladen…',
    'The photo is too big.': 'Das Foto ist zu groß.', 'This picture cannot be used.': 'Dieses Bild kann nicht verwendet werden.',
    'Remove': 'Entfernen', 'Remove “{name}”?': '„{name}“ entfernen?', 'Not offered': 'Nicht angeboten', 'Add a dish': 'Gericht hinzufügen',
    'Replace the menu of this day with the one of {day}?': 'Den Speiseplan dieses Tages durch den vom {day} ersetzen?',
    'This day has no menu.': 'Dieser Tag hat keinen Speiseplan.', 'Copied from {day} and saved.': 'Vom {day} übernommen und gespeichert.',
    'Remove all dishes of this day?': 'Alle Gerichte dieses Tages entfernen?',
    'One resident has already answered. Change dishes rather than removing them.': 'Ein Bewohner hat schon geantwortet. Gerichte lieber ändern als entfernen.',
    '{n} residents have already answered. Change dishes rather than removing them.': '{n} Bewohner haben schon geantwortet. Gerichte lieber ändern als entfernen.',
    /* the orders */
    'Print': 'Drucken', 'Quantities': 'Mengen', 'Trays by room': 'Tabletts nach Zimmer', 'Updated {t}': 'Stand {t}',
    'Chosen': 'Gewählt', 'No choice, ask the team': 'Keine Wahl, Team fragen', 'Not chosen yet': 'Noch keine Wahl', 'Residents': 'Bewohner',
    'No menu for this day.': 'Kein Speiseplan für diesen Tag.', 'Make the menu': 'Speiseplan erstellen',
    '1 portion': '1 Portion', '{n} portions': '{n} Portionen', 'of which 1 small': 'davon 1 klein', 'of which {n} small': 'davon {n} klein', 'no choice / ask the team': 'keine Wahl / Team fragen',
    'No resident list yet: the robot sends it.': 'Noch keine Bewohnerliste: Der Roboter schickt sie.',
    'Room': 'Zimmer', 'Name': 'Name', 'Notes': 'Hinweise', 'Portion': 'Portion', 'Delivered': 'Geliefert', 'small': 'klein', 'normal': 'normal',
    'not chosen yet': 'noch keine Wahl', 'no choice, please ask the team': 'keine Wahl, bitte Team fragen',
    'no pork': 'kein Schwein', 'diabetic': 'Diabetiker', 'Allergies:': 'Allergien:',
    'Orders for {day}': 'Bestellungen für {day}', '{a} of {n} residents have answered': '{a} von {n} Bewohnern haben geantwortet', 'Printed {t}': 'Gedruckt {t}',
    /* the menu card */
    'Menu card': 'Speisekarte', 'menu card': 'Speisekarte', 'Starters': 'Vorspeisen', 'Main dishes': 'Hauptgerichte', 'Desserts': 'Desserts', 'Drinks': 'Getränke', 'Drink': 'Getränk',
    'Offered for': 'Gilt für', 'Orders close the day before at': 'Bestellschluss am Vortag um', 'Restore the default card': 'Standardkarte wiederherstellen',
    'The menu card is always there: on a day without a menu plan the residents choose from it; with a menu plan it is offered next to today’s special.':
      'Die Speisekarte ist immer da: An Tagen ohne Speiseplan wählen die Bewohner daraus, sonst wird sie zusätzlich zur Tagesempfehlung angeboten.',
    'Names for French and English residents': 'Namen für französisch- und englischsprachige Bewohner', 'Add French and English names': 'Französische und englische Namen hinzufügen',
    'Name (French)': 'Name (Französisch)', 'Description (French)': 'Beschreibung (Französisch)', 'Name (English)': 'Name (Englisch)', 'Description (English)': 'Beschreibung (Englisch)',
    'This is the default card.': 'Das ist die Standardkarte.', 'The menu card needs at least one dish.': 'Die Speisekarte braucht mindestens ein Gericht.',
    'The default card is back.': 'Die Standardkarte ist wieder da.', 'Replace the menu card with the default card?': 'Die Speisekarte durch die Standardkarte ersetzen?',
    'No menu plan: the menu card applies': 'Kein Speiseplan: Es gilt die Speisekarte',
    'No menu plan for this day: the residents choose from the menu card. Only the dishes ordered are listed.': 'Kein Speiseplan für diesen Tag: Die Bewohner wählen aus der Speisekarte. Aufgeführt sind nur bestellte Gerichte.'
  });
  addNew('fr', {
    /* the page, the access */
    'Kitchen': 'Cuisine', 'Back': 'Retour', 'Menu plan': 'Menu', 'Orders': 'Commandes', 'Language': 'Langue', 'One moment…': 'Un instant…',
    'Code of the care team': 'Code de l’équipe soignante', 'Open': 'Ouvrir',
    'The 6-character code shown on the robot, the same as for adding a game.': 'Le code à 6 caractères affiché sur le robot, le même que pour « Ajouter un jeu ».',
    'Type the 6-character code.': 'Tapez le code à 6 caractères.', 'This code is not right.': 'Ce code ne convient pas.',
    'Too many tries. Try again in 10 minutes.': 'Trop d’essais. Réessayez dans 10 minutes.',
    'The server does not answer.': 'Le serveur ne répond pas.', 'Try again': 'Réessayer',
    /* the day */
    'Previous day': 'Jour précédent', 'Next day': 'Jour suivant', 'Day': 'Jour', 'Today': 'Aujourd’hui', 'Tomorrow': 'Demain',
    'today': 'aujourd’hui', 'tomorrow': 'demain', 'yesterday': 'hier', 'No menu yet': 'Pas encore de menu',
    'Choice open until {t}': 'Choix ouvert jusqu’au {t}', 'Choice closed since {t}': 'Choix clos depuis le {t}',
    'The deadline has passed: residents can no longer choose on the tablet.': 'L’heure limite est passée : les résidents ne peuvent plus choisir sur la tablette.',
    'Change the deadline to open it again.': 'Changez l’heure limite pour rouvrir le choix.',
    'Unsaved changes will be lost. Continue?': 'Les modifications non enregistrées seront perdues. Continuer ?',
    /* the menu */
    'Lunch': 'Déjeuner', 'Dinner': 'Dîner', 'Starter': 'Entrée', 'Main course': 'Plat principal', 'Dessert': 'Dessert',
    'vegetarian': 'végétarien', 'with pork': 'avec porc', 'soft food': 'texture tendre', 'for diabetics': 'pour diabétiques',
    'Order deadline': 'Heure limite', 'Copy the menu of…': 'Copier le menu du…', 'Copy': 'Copier', 'Empty the day': 'Vider le jour',
    '1 dish': '1 plat', '{n} dishes': '{n} plats', 'Save': 'Enregistrer', 'Saving…': 'Enregistrement…', 'Not saved': 'Non enregistré',
    'Saved at {t}': 'Enregistré à {t}', 'Saved: no menu for this day.': 'Enregistré : pas de menu pour ce jour.',
    'Not saved: please try again.': 'Non enregistré : veuillez réessayer.', 'Every dish needs a name.': 'Chaque plat a besoin d’un nom.',
    'Dish name': 'Nom du plat', 'Short description': 'Courte description', 'Allergens, separated by commas': 'Allergènes, séparés par des virgules',
    'Add a photo': 'Ajouter une photo', 'Remove the photo': 'Retirer la photo', 'Uploading…': 'Envoi…',
    'The photo is too big.': 'La photo est trop grande.', 'This picture cannot be used.': 'Cette image ne peut pas être utilisée.',
    'Remove': 'Retirer', 'Remove “{name}”?': 'Retirer « {name} » ?', 'Not offered': 'Pas proposé', 'Add a dish': 'Ajouter un plat',
    'Replace the menu of this day with the one of {day}?': 'Remplacer le menu de ce jour par celui du {day} ?',
    'This day has no menu.': 'Ce jour n’a pas de menu.', 'Copied from {day} and saved.': 'Copié du {day} et enregistré.',
    'Remove all dishes of this day?': 'Retirer tous les plats de ce jour ?',
    'One resident has already answered. Change dishes rather than removing them.': 'Un résident a déjà répondu. Modifiez les plats plutôt que de les retirer.',
    '{n} residents have already answered. Change dishes rather than removing them.': '{n} résidents ont déjà répondu. Modifiez les plats plutôt que de les retirer.',
    /* the orders */
    'Print': 'Imprimer', 'Quantities': 'Quantités', 'Trays by room': 'Plateaux par chambre', 'Updated {t}': 'Mis à jour à {t}',
    'Chosen': 'Choisi', 'No choice, ask the team': 'Pas de choix, demander à l’équipe', 'Not chosen yet': 'Pas encore choisi', 'Residents': 'Résidents',
    'No menu for this day.': 'Pas de menu pour ce jour.', 'Make the menu': 'Créer le menu',
    '1 portion': '1 portion', '{n} portions': '{n} portions', 'of which 1 small': 'dont 1 petite', 'of which {n} small': 'dont {n} petites', 'no choice / ask the team': 'pas de choix / demander à l’équipe',
    'No resident list yet: the robot sends it.': 'Pas encore de liste des résidents : le robot l’envoie.',
    'Room': 'Chambre', 'Name': 'Nom', 'Notes': 'Remarques', 'Portion': 'Portion', 'Delivered': 'Servi', 'small': 'petite', 'normal': 'normale',
    'not chosen yet': 'pas encore choisi', 'no choice, please ask the team': 'pas de choix, demander à l’équipe',
    'no pork': 'sans porc', 'diabetic': 'diabétique', 'Allergies:': 'Allergies :',
    'Orders for {day}': 'Commandes pour le {day}', '{a} of {n} residents have answered': '{a} résidents sur {n} ont répondu', 'Printed {t}': 'Imprimé le {t}',
    /* the menu card */
    'Menu card': 'Carte', 'menu card': 'carte', 'Starters': 'Entrées', 'Main dishes': 'Plats', 'Desserts': 'Desserts', 'Drinks': 'Boissons', 'Drink': 'Boisson',
    'Offered for': 'Proposée pour', 'Orders close the day before at': 'Commandes jusqu’à la veille à', 'Restore the default card': 'Rétablir la carte par défaut',
    'The menu card is always there: on a day without a menu plan the residents choose from it; with a menu plan it is offered next to today’s special.':
      'La carte est toujours là : les jours sans menu, les résidents y choisissent leur repas ; sinon elle est proposée en plus de la suggestion du jour.',
    'Names for French and English residents': 'Noms pour les résidents francophones et anglophones', 'Add French and English names': 'Ajouter les noms en français et en anglais',
    'Name (French)': 'Nom (français)', 'Description (French)': 'Description (français)', 'Name (English)': 'Nom (anglais)', 'Description (English)': 'Description (anglais)',
    'This is the default card.': 'C’est la carte par défaut.', 'The menu card needs at least one dish.': 'La carte a besoin d’au moins un plat.',
    'The default card is back.': 'La carte par défaut est rétablie.', 'Replace the menu card with the default card?': 'Remplacer la carte par la carte par défaut ?',
    'No menu plan: the menu card applies': 'Pas de menu : la carte s’applique',
    'No menu plan for this day: the residents choose from the menu card. Only the dishes ordered are listed.': 'Pas de menu ce jour : les résidents choisissent à la carte. Seuls les plats commandés sont listés.'
  });
})();
