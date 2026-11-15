/* Bellatrix 1.16 (workstream H): the books of the reading app, all public domain, with their licence rows.
   Reading is a books-only app since 1.16: the Today screen (day, time, Open-Meteo weather), the light
   horoscope and "50 years ago" were removed with their data (BRIEF-1.16, H).
   - stories: public-domain texts copied as they are from Wikisource or Project Gutenberg (no notes,
     prefaces or modern editions). The 1697 Perrault and 1857 Grimm spellings are kept on screen;
     only the voice reads a few old spellings the modern way (spoken, below).
     premium: true = a "Livres Premium" book (crown): open only when THIS resident has the separate
     Premium product 'books' (js/premium.js v3, Premium.isOn(code, 'books')). Play Premium never opens it.
   - licences: one row per story (same rows as data/reading-licences.json). js/reading.js shows a
     story only when its row is complete (Reading.licenceOk).
   Open decision (BRIEF-1.16 H): "Le Petit Chaperon rouge" (fr-chaperon) stays until Rahma decides. */
var READING_DATA = {
  stories: [
    {
    "id": "fr-corbeau",
    "lang": "fr",
    "premium": false,
    "title": "Le Corbeau et le Renard",
    "author": "Jean de La Fontaine",
    "translator": null,
    "paragraphs": [
    "Maître corbeau, sur un arbre perché,\nTenait en son bec un fromage.\nMaître renard, par l’odeur alléché,\nLui tint à peu près ce langage :\nHé ! bonjour, monsieur du corbeau.\nQue vous êtes joli ! que vous me semblez beau !\nSans mentir, si votre ramage\nSe rapporte à votre plumage,\nVous êtes le phénix des hôtes de ces bois.\nÀ ces mots le corbeau ne se sent pas de joie ;\nEt, pour montrer sa belle voix,\nIl ouvre un large bec, laisse tomber sa proie.\nLe renard s’en saisit, et dit : Mon bon monsieur,\nApprenez que tout flatteur\nVit aux dépens de celui qui l’écoute :\nCette leçon vaut bien un fromage, sans doute.\nLe corbeau, honteux et confus,\nJura, mais un peu tard, qu’on ne l’y prendrait plus."
    ]
    },
    {
    "id": "fr-cigale",
    "lang": "fr",
    "premium": false,
    "title": "La Cigale et la Fourmi",
    "author": "Jean de La Fontaine",
    "translator": null,
    "paragraphs": [
    "La cigale, ayant chanté\nTout l’été,\nSe trouva fort dépourvue\nQuand la bise fut venue :\nPas un seul petit morceau\nDe mouche ou de vermisseau.",
    "Elle alla crier famine\nChez la fourmi, sa voisine,\nLa priant de lui prêter\nQuelque grain pour subsister\nJusqu’à la saison nouvelle.\nJe vous paierai, lui dit-elle,\nAvant l’oût, foi d’animal,\nIntérêt et principal.\nLa fourmi n’est pas prêteuse :\nC’est là son moindre défaut.\nQue faisiez-vous au temps chaud ?\nDit-elle à cette emprunteuse. —\nNuit et jour à tout venant\nJe chantais, ne vous déplaise. —\nVous chantiez, j’en suis fort aise !\nEh bien ! dansez maintenant."
    ]
    },
    {
    "id": "fr-chaperon",
    "lang": "fr",
    "premium": false,
    "title": "Le Petit Chaperon rouge",
    "author": "Charles Perrault",
    "translator": null,
    "paragraphs": [
    "Il estoit une fois une petite fille de Vilage, la plus jolie qu’on eut sçû voir ; sa mere en estoit folle, & sa mere grand plus folle encore. Cette bonne femme luy fit faire un petit chaperon rouge, qui lui seïoit si bien, que par tout on l’appelloit le Petit chaperon rouge.",
    "Un jour sa mere ayant cui & fait des galetes, luy dit, va voir comme se porte ta mere-grand, car on m’a dit qu’elle estoit malade, portes luy une galette & ce petit pot de beurre. Le petit chaperon rouge partit aussi-tost pour aller chez sa mere-grand, qui demeuroit dans un autre Village. En passant dans un bois elle rencontra compere le Loup, qui eut bien envie de la manger, mais il n’osa, à cause de quelques bucherons qui estoient dans la Forest. Il luy demanda où elle alloit ; la pauvre enfant qui ne sçavoit pas qu’il est dangereux de s’arrester à écouter un Loup, luy dit, je vais voir ma Mere-grand, & luy porter une galette avec un petit pot de beurre que ma Mere luy envoye. Demeure-t-elle bien loin, lui dit le Loup ? Oh ouy, dit le petit chaperon rouge, c’est par de-là le Moulin que vous voyez tout là-bas, là-bas, à la premiere maison du Village. Et bien, dit le Loup, je veux l’aller voir aussi ; je m’y en vais par ce chemin icy, & toy par ce chemin-là, & nous verrons à qui plutost y sera. Le Loup se mit à courir de toute sa force par le chemin qui estoit le plus court, & la petite fille s’en alla par le chemin le plus long, s’amusant à cueïllir des noisettes, à courir aprés des papillons, & à faire des bouquets des petites fleurs qu’elle rencontroit. Le Loup ne fut pas long-temps à arriver à la maison de la Mere-grand, il heurte : Toc, toc, qui est là ? C’est votre fille le petit chaperon rouge, dit le Loup, en contrefaisant sa voix, qui vous apporte une galete, & un petit pot de beurre que ma Mere vous envoye. La bonne Mere-grand qui estoit dans son lit à cause qu’elle se trouvoit un peu mal, luy cria, tire la chevillette, la bobinette chera, le Loup tira la chevillette, & la porte s’ouvrit. Il se jetta sur la bonne femme, & la devora en moins de rien ; car il y avoit plus de trois jours qu’il n’avoit mangé. Ensuite il ferma la porte, & s’alla coucher dans le lit de la Mere-grand, en attendant le petit chaperon rouge, qui quelque temps aprés vint heurter à la porte. Toc, toc, qui est là ? Le petit chaperon rouge, qui entendit la grosse voix du Loup, eut peur d’abord, mais croyant que sa mere-grand estoit enrhumée, répondit, c’est vostre fille le petit chaperon rouge, qui vous apporte une galette & un petit pot de beurre que ma Mere vous envoye. Le Loup luy cria, en adoucissant un peu sa voix ; tire la chevillette, la bobinette chera. Le petit chaperon rouge tira la chevillette, & la porte s’ouvrit. Le Loup la voyant entrer, luy dit en se cachant dans le lit sous la couverture : mets la galette & le petit pot de beurre sur la huche, & viens te coucher avec moy. Le petit chaperon rouge se deshabille, & va se mettre dans le lit, où elle fut bien estonnée de voir comment sa Mere-grand estoit faite en son deshabillé, elle luy dit ; ma mere-grand que vous avez de grands bras ! c’est pour mieux t’embrasser, ma fille : ma mere-grand, que vous avez de grandes jambes ! c’est pour mieux courir mon enfant : ma mere-grand que vous avez de grandes oreilles ! c’est pour mieux écouter, mon enfant. Ma mere-grand que vous avez de grands yeux ! c’est pour mieux voir, mon enfant. Ma mere-grand, que vous avez de grandes dens ! c’est pour te manger. Et, en disant ces mots, ce méchant loup se jetta sur le petit chaperon rouge, & la mangea.",
    "MORALITÉ.",
    "ON voit icy que de jeunes enfans,\nSur tout de jeunes filles,\nBelles, bien faites & gentilles,\nFont tres-mal d’écouter toute sorte de gens,\nEt que ce n’est pas chose estrange,\nS’il en est tant que le loup mange.\nIe dis le loup, car tous les loups ;\nNe sont pas de la mesme sorte ;\nIl en est d’une humeur accorte,\nSans bruit, sans fiel & sans courroux,\nQui privez, complaisans & doux\nSuivent les jeunes Demoiselles\nIusque dans les maisons, jusque dans les ruelles ;\nMais, hélas ! qui ne sçait que ces loups doucereux,\nDe tous les loups sont les plus dangereux."
    ]
    },
    {
    "id": "fr-chat",
    "lang": "fr",
    "premium": true,
    "title": "Le Maître Chat ou le Chat botté",
    "author": "Charles Perrault",
    "translator": null,
    "paragraphs": [
    "Vn Meusnier ne laissa pour tout biens à trois enfans qu’il avoit, que son Moulin, son Asne, & son Chat. Les partages furent bien tôt faits, ny le Notaire, ny le Procureur n’y furent point appellés. Ils auroient eu bien-tost mangé tout le pauvre patrimoine. L’aisné eut le Moulin, le second eut l’Asne, & le plus jeune n’eut que le Chat. Ce dernier ne pouvoit se consoler d’avoir un si pauvre lot : Mes freres, disoit-il, pourront gagner leur vie honnestement en se mettant ensemble ; pour moi, lors que j’aurai mangé mon chat, & que je me seray fait un manchon de sa peau, il faudra que je meure de faim. Le Chat qui entendoit ce discours, mais qui n’en fit pas semblant, luy dit d’un air posé & serieux, ne vous affligés point, mon maistre, vous n’avez qu’à me donner un Sac, & me faire faire une paire de Bottes pour aller dans les brousailles, & vous verez que vous n’êtes pas si mal partagé que vous croyez. Quoique le maistre du chat ne fit pas grand fond là-dessus, il lui avoit veu faire tant de tours de souplesse, pour prendre des Rats & des Souris ; comme quand il se pendoit par les pieds, ou qu’il se cachoit dans la farine pour faire le mort, qu’il ne desespera pas d’en estre secouru dans sa misere. Lors que le chat eut ce qu’il avoit demandé, il se botta bravement ; & mettant son sac à son cou, il en prit les cordons avec ses deux pattes de devant, & s’en alla dans une garenne où il y avoit grand nombre de lapins. Il mit du son & des lasserons dans son sac, & s’estendant comme s’il eut esté mort, il attendit que quelque jeune lapin, peu instruit encore des ruses de ce monde, vint se fourer dans son sac pour manger ce qu’il y avoit mis. À peine fut-il couché, qu’il eut contentement ; un jeune étourdi de lapin entra dans son sac, & le maistre chat tirant aussitost les cordons le prit & le tua sans misericorde. Tout glorieux de sa proye, il s’en alla chez le Roy & demanda à luy parler. On le fit monter à l’Appartement de sa Majesté, où estant entré il fit une grande reverence au Roy, & luy dit, voylà, Sire, un Lapin de Garenne que Monsieur le Marquis de Carabas (c’estoit le nom qu’il lui prit en gré de donner à son Maistre,) m’a chargé de vous presenter de sa part. Dis, à ton Maistre, répondit le Roy, que je le remercie, & qu’il me fait plaisir. Une autre fois il alla se cacher dans un blé tenant toûjours son sac ouvert, & lors que deux Perdrix y furent entrées, il tira les cordons, & les prit toutes deux. Il alla ensuite les presenter au Roy, comme il avoit fait le Lapin de garenne. Le Roy receut encore avec plaisir les deux Perdrix, & luy fit donner pour boire. Le chat continua ainsi pendant deux ou trois moi à porter de temps-en-temps au Roy du Gibier de la chasse de son Maistre. Un jour qu’il sçeut que le Roy devoit aller à la promenade sur le bord de la riviere avec sa fille ; la plus belle Princesse du monde, il dit à son Maistre, si vous voulez suivre mon conseil, vostre fortune est faite : vous n’avez qu’à vous baigner dans la riviere à l’endroit que je vous montreray, & ensuite me laisser faire. Le Marquis de Carabas fit ce que son chat luy conseilloit, sans sçavoir à quoy cela seroit bon. Dans le temps qu’il se baignoit, le Roy vint à passer, & le Chat se mit à crier de toute sa force : au secours, au secours, voilà Monsieur le Marquis de Carabas qui se noye. À ce cry le Roy mit la teste à la portiere, & reconnoissant le Chat qui luy avoit apporté tant de fois du Gibier, il ordonna à ses Gardes qu’on allast viste au secours de Monsieur le Marquis de Carabas. Pendant qu’on retiroit le pauvre Marquis de la riviere, le Chat s’approcha du Carosse, & dit au Roy que dans le temps que son Maistre se baignoit, il estoit venu des Voleurs qui avoient emporté ses habits, quoyqu’il eût crié au voleur de toute sa force ; le drosle les avoit cachez sous une grosse pierre. Le Roy ordonna aussi-tost aux Officiers de sa Garde robe d’aller querir un de ses plus beaux habits pour Monsieur le Marquis de Carabas. Le Roy luy fit mille caresses, & comme les beaux habits qu’on venoit de luy donner relevoient sa bonne mine (car il estoit beau, & bien fait de sa personne) la fille du Roy le trouva fort à son gré, & le Comte de Carabas ne luy eut pas jetté deux ou trois regards fort respectueux, & un peu tendres, qu’elle en devint amoureuse à la folie. Le Roi voulut qu’il montast dans son Carosse & qu’il fust de la promenade : Le Chat ravi de voir que son dessein commençoit à réussir, prit les devants, & ayant rencontré des Paysans qui fauchoient un Pré, il leur dit, bonnes gens qui fauchez, si vous ne dites au Roy que le pré que vous fauchez appartient à Monsieur le Marquis de Carabas, vous serez tous hachez menu comme chair à pasté. Le Roy ne manqua pas à demander aux Faucheux à qui estoit ce Pré qu’ils fauchoient. C’est à Monsieur le Marquis de Carabas, dirent-ils tous ensemble, car la menace du Chat leur avoit fait peur. Vous avez là un bel heritage, dit le Roy, au Marquis de Carabas. Vous voyez, Sire, repondit le Marquis, c’est un pré qui ne manque point de rapporter abondament toutes les années. Le maistre Chat qui alloit toûjours devant, rencontra des Moissonneurs, & leur dit, Bonnes gens qui moissonnez, si vous ne dites que tous ces blez appartiennent à Monsieur le Marquis de Carabas, vous serez tous hachez menu comme chair à pasté. Le Roy qui passa un moment aprés, voulut sçavoir à qui appartenoient tous les blés qu’il voyoit. C’est à Monsieur le Marquis de Carabas, répondirent les Moissonneurs, & le Roy s’en réjoüit encore avec le Marquis. Le Chat qui alloit devant le Carosse, disoit toûjours la même chose à tous ceux qu’il rencontroit ; & le Roy estoit estonné des grands biens de Monsieur le Marquis de Carabas. Le maistre Chat arriva enfin dans un beau Château dont le Maistre estoit un Ogre, le plus riche qu’on ait jamais veu, car toutes les terres par où le Roy avoit passé estoient de la dépendance de ce Chasteau : le Chat qui eut soin de s’informer qui estoit cet Ogre, & ce qu’il sçavoit faire, demanda à luy parler, disant qu’il n’avoit pas voulu passer si prés de son Chasteau, sans avoir l’honneur de luy faire la réverence. L’Ogre le receut aussi civilement que le peut un Ogre, & le fit reposer. On m’a assuré, dit le Chat, que vous aviez le don de vous changer en toute sorte d’Animaux, que vous pouviez par exemple vous transformer en Lyon, en Elephant ; cela est vray, répondit l’Ogre brusquement, & pour vous le montrer, vous m’alez voir devenir Lyon. Le Chat fut si éfrayé de voir un Lyon devant luy, qu’il gagna aussi-tost les goûtieres, non sans peine & sans peril, à cause de ses bottes qui ne valoient rien pour marcher sur les tuiles. Quelque temps aprés le Chat ayant veu que l’Ogre avoit quitté sa premiere forme, descendit, & avoüa qu’il avoit eu bien peur. On m’a assuré encore, dit le Chat, mais je ne sçaurois le croire, que vous aviez aussi le pouvoir de prendre la forme des plus petits Animaux, par exemple, de vous changer en un rat, en une souris ; je vous avoüe que je tiens cela tout à fait impossible. Impossible ? réprit l’Ogre, vous allez voir, & en même temps il se changea en une souris qui se mit à courir sur le plancher. Le chat ne l’eut pas plustost aperçuë, qu’il se jetta dessus, & la mangea. Cependant le Roy qui vit en passant le beau Chasteau de l’Ogre, voulut entrer dedans. Le Chat qui entendit le bruit du Carosse qui passoit sur le pont levis, courut au-devant, & dit au Roy : Vostre Majesté soit la bien venuë dans le Chasteau de Monsieur le Marquis de Carabas. Comment Monsieur le Marquis, s’écria le Roy, ce Chasteau est encore à vous, il ne se peut rien de plus beau que cette cour & que tous ces Bastimens qui l’environent ; voyons les dedans s’il vous plait. Le Marquis donna la main à la jeune Princesse, & suivant le Roy qui montoit le premier, ils entrerent dans une grande Sale où ils trouverent une magnifique colation que l’Ogre avoit fait preparer pour ses amis qui le devoient venir voir ce même jour-là, mais qui n’avoient pas osé entrer, sçachant que le Roy y estoit. Le Roy charmé des bonnes qualitez de Monsieur le Marquis de Carabas, de même que sa fille qui en estoit folle ; & voyant les grands biens qu’il possedoit, luy dit, aprés avoir beu cinq ou six coups, il ne tiendra qu’à vous Monsieur le Marquis que vous ne soyez mon gendre. Le Marquis faisant de grandes réverences accepta l’honneur que luy faisoit le Roy ; & dés le même jour épousa la princesse. Le Chat devint grand Seigneur, & ne courut plus aprés les souris, que pour se divertir.",
    "MORALITÉ.",
    "QVelque grand que soit l’avantage,\nDe jouir d’un riche heritage\nVenant à nous de pere en fils,\nAux jeunes gens pour l’ordinaire,\nL’industrie & le sçavoir faire,\nVallent mieux que des biens acquis.",
    "Autre Moralité.",
    "SI le fils d’un Meûnier tant de vitesse,\nGagne le cœur d’une Princesse\nEt s’en fait regarder avec des yeux mourans,\nC’est que l’habit, la mine & la jeunesse,\nPour inspirer de la tendresse,\nN’en sont pas des moyens toûjours indifferens."
    ]
    },
    {
    "id": "de-sterntaler",
    "lang": "de",
    "premium": false,
    "title": "Die Sterntaler",
    "author": "Jacob und Wilhelm Grimm",
    "translator": null,
    "paragraphs": [
    "Es war einmal ein kleines Mädchen, dem war Vater und Mutter gestorben, und es war so arm, daß es kein Kämmerchen mehr hatte darin zu wohnen und kein Bettchen mehr darin zu schlafen und endlich gar nichts mehr als die Kleider auf dem Leib und ein Stückchen Brot in der Hand, das ihm ein mitleidiges Herz geschenkt hatte. Es war aber gut und fromm. Und weil es so von aller Welt verlassen war, gieng es im Vertrauen auf den lieben Gott hinaus ins Feld. Da begegnete ihm ein armer Mann, der sprach „ach, gib mir etwas zu essen, ich bin so hungerig.“ Es reichte ihm das ganze Stückchen Brot und sagte „Gott segne dirs“ und gieng weiter. Da kam ein Kind das jammerte und sprach „es friert mich so an meinem Kopfe, schenk mir etwas, womit ich ihn bedecken kann.“ Da that es seine Mütze ab und gab sie ihm. Und als es noch eine Weile gegangen war, kam wieder ein Kind und hatte kein Leibchen an und fror: da gab es ihm seins: und noch weiter, da bat eins um ein Röcklein, das gab es auch von sich hin. Endlich gelangte es in einen Wald, und es war schon dunkel geworden, da kam noch eins und bat um ein Hemdlein, und das fromme Mädchen dachte „es ist dunkle Nacht, da sieht dich niemand du kannst wohl dein Hemd weg geben,“ und zog das Hemd ab und gab es auch noch hin. Und wie es so stand und gar nichts mehr hatte, fielen auf einmal die Sterne vom Himmel, und waren lauter harte blanke Thaler: und ob es gleich sein Hemdlein weg gegeben, so hatte es ein neues an und das war vom allerfeinsten Linnen. Da sammelte es sich die Thaler hinein und war reich für sein Lebtag."
    ]
    },
    {
    "id": "de-froschkoenig",
    "lang": "de",
    "premium": false,
    "title": "Der Froschkönig oder der eiserne Heinrich",
    "author": "Jacob und Wilhelm Grimm",
    "translator": null,
    "paragraphs": [
    "In den alten Zeiten, wo das Wünschen noch geholfen hat, lebte ein König, dessen Töchter waren alle schön, aber die jüngste war so schön, daß die Sonne selber, die doch so vieles gesehen hat, sich verwunderte so oft sie ihr ins Gesicht schien. Nahe bei dem Schlosse des Königs lag ein großer dunkler Wald, und in dem Walde unter einer alten Linde war ein Brunnen: wenn nun der Tag recht heiß war, so ging das Königskind hinaus in den Wald und setzte sich an den Rand des kühlen Brunnens: und wenn sie Langeweile hatte, so nahm sie eine goldene Kugel, warf sie in die Höhe und fieng sie wieder; und das war ihr liebstes Spielwerk.",
    "Nun trug es sich einmal zu, daß die goldene Kugel der Königstochter nicht in ihr Händchen fiel, das sie in die Höhe gehalten hatte, sondern vorbei auf die Erde schlug und geradezu ins Wasser hinein rollte. Die Königstochter folgte ihr mit den Augen nach, aber die Kugel verschwand, und der Brunnen war tief, so tief daß man keinen Grund sah. Da fieng sie an zu weinen und weinte immer lauter und konnte sich gar nicht trösten. Und wie sie so klagte, rief ihr jemand zu „was hast du vor, Königstochter, du schreist ja daß sich ein Stein erbarmen möchte.“ Sie sah sich um, woher die Stimme käme, da erblickte sie einen Frosch, der seinen dicken häßlichen Kopf aus dem Wasser streckte. „Ach, du bists, alter Wasserpatscher,“ sagte sie, „ich weine über meine goldene Kugel, die mir in den Brunnen hinab gefallen ist.“ „Sei still und weine nicht“, antwortete der Frosch, „ich kann wohl Rath schaffen, aber was gibst du mir, wenn ich dein Spielwerk wieder heraufhole“? „Was du haben willst, lieber Frosch,“ sagte sie, „meine Kleider, meine Perlen und Edelsteine, auch noch die goldene Krone, die ich trage.“ Der Frosch antwortete „deine Kleider, deine Perlen und Edelsteine, und deine goldene Krone, die mag ich nicht: aber wenn du mich lieb haben willst, und ich soll dein Geselle und Spielkamerad sein, an deinem Tischlein neben dir sitzen, von deinem goldenen Tellerlein essen, aus deinem Becherlein trinken, in deinem Bettlein schlafen: wenn du mir das versprichst, so will ich hinunter steigen und dir die goldene Kugel wieder herauf holen.“ „Ach ja,“ sagte sie, „ich verspreche dir alles, was du willst, wenn du mir nur die Kugel wieder bringst.“ Sie dachte aber „was der einfältige Frosch schwätzt, der sitzt im Wasser bei seines Gleichen und quackt, und kann keines Menschen Geselle sein.“",
    "Der Frosch, als er die Zusage erhalten hatte, tauchte seinen Kopf unter, sank hinab und über ein Weilchen kam er wieder herauf gerudert, hatte die Kugel im Maul und warf sie ins Gras. Die Königstochter war voll Freude, als sie ihr schönes Spielwerk wieder erblickte, hob es auf und sprang damit fort. „Warte, warte,“ rief der Frosch, „nimm mich mit, ich kann nicht so laufen wie du.“ Aber was half ihm daß er ihr sein quack quack so laut nachschrie als er konnte! sie hörte nicht darauf, eilte nach Haus und hatte bald den armen Frosch vergessen, der wieder in seinen Brunnen hinab steigen mußte.",
    "Am andern Tage, als sie mit dem König und allen Hofleuten sich zur Tafel gesetzt hatte und von ihrem goldenen Tellerlein aß, da kam, plitsch platsch, plitsch platsch, etwas die Marmortreppe herauf gekrochen, und als es oben angelangt war, klopfte es an der Thür und rief „Königstochter, jüngste, mach mir auf.“ Sie lief und wollte sehen wer draußen wäre, als sie aber aufmachte, so saß der Frosch davor. Da warf sie die Thür hastig zu, setzte sich wieder an den Tisch, und war ihr ganz angst. Der König sah wohl daß ihr das Herz gewaltig klopfte und sprach „mein Kind, was fürchtest du dich, steht etwa ein Riese vor der Thür und will dich holen?“ „Ach nein,“ antwortete sie, „es ist kein Riese, sondern ein garstiger Frosch.“ „Was will der Frosch von dir?“ „Ach lieber Vater, als ich gestern im Wald bei dem Brunnen saß und spielte, da fiel meine goldene Kugel ins Wasser. Und weil ich so weinte, hat sie der Frosch wieder heraufgeholt, und weil er es durchaus verlangte, so versprach ich ihm er sollte mein Geselle werden, ich dachte aber nimmermehr daß er aus seinem Wasser heraus könnte. Nun ist er draußen und will zu mir herein.“ Indem klopfte es zum zweitenmal und rief",
    "„Königstochter, jüngste,\nmach mir auf,\nweißt du nicht was gestern\ndu zu mir gesagt\nbei dem kühlen Brunnenwasser?\nKönigstochter, jüngste,\nmach mir auf.“",
    "Da sagte der König „was du versprochen hast, das mußt du auch halten; geh nur und mach ihm auf.“ Sie gieng und öffnete die Thüre, da hüpfte der Frosch herein, ihr immer auf dem Fuße nach, bis zu ihrem Stuhl. Da saß er und rief „heb mich herauf zu dir.“ Sie zauderte bis es endlich der König befahl. Als der Frosch erst auf dem Stuhl war, wollte er auf den Tisch, und als er da saß, sprach er „nun schieb mir dein goldenes Tellerlein näher, damit wir zusammen essen.“ Das that sie zwar, aber man sah wohl daß sies nicht gerne that. Der Frosch ließ sichs gut schmecken, aber ihr blieb fast jedes Bißlein im Halse. Endlich sprach er „ich habe mich satt gegessen, und bin müde, nun trag mich in dein Kämmerlein und mach dein seiden Bettlein zurecht, da wollen wir uns schlafen legen.“ Die Königstochter fieng an zu weinen und fürchtete sich vor dem kalten Frosch, den sie nicht anzurühren getraute, und der nun in ihrem schönen reinen Bettlein schlafen sollte. Der König aber ward zornig und sprach „wer dir geholfen hat, als du in der Noth warst, den sollst du hernach nicht verachten.“ Da packte sie ihn mit zwei Fingern, trug ihn hinauf und setzte ihn in eine Ecke. Als sie aber im Bett lag, kam er gekrochen und sprach „ich bin müde, ich will schlafen so gut wie du: heb mich herauf, oder ich sags deinem Vater.“ Da ward sie erst bitterböse, holte ihn herauf und warf ihn aus allen Kräften wider die Wand, „nun wirst du Ruhe haben, du garstiger Frosch.“",
    "Als er aber herab fiel, war er kein Frosch, sondern ein Königssohn mit schönen und freundlichen Augen. Der war nun nach ihres Vaters Willen ihr lieber Geselle und Gemahl. Da erzählte er ihr, er wäre von einer bösen Hexe verwünscht worden, und Niemand hätte ihn aus dem Brunnen erlösen können als sie allein, und morgen wollten sie zusammen in sein Reich gehen. Dann schliefen sie ein, und am andern Morgen, als die Sonne sie aufweckte, kam ein Wagen heran gefahren mit acht weißen Pferden bespannt, die hatten weiße Straußfedern auf dem Kopf, und giengen in goldenen Ketten, und hinten stand der Diener des jungen Königs, das war der treue Heinrich. Der treue Heinrich hatte sich so betrübt, als sein Herr war in einen Frosch verwandelt worden, daß er drei eiserne Bande hatte um sein Herz legen lassen, damit es ihm nicht vor Weh und Traurigkeit zerspränge. Der Wagen aber sollte den jungen König in sein Reich abholen; der treue Heinrich hob beide hinein, stellte sich wieder hinten auf und war voller Freude über die Erlösung. Und als sie ein Stück Wegs gefahren waren, hörte der Königssohn daß es hinter ihm krachte, als wäre etwas zerbrochen. Da drehte er sich um und rief",
    "„Heinrich, der Wagen bricht.“\n„Nein, Herr, der Wagen nicht,\nes ist ein Band von meinem Herzen,\ndas da lag in großen Schmerzen,\nals ihr in dem Brunnen saßt,\nals ihr eine Fretsche (Frosch) wast (wart).“",
    "Noch einmal und noch einmal krachte es auf dem Weg, und der Königssohn meinte immer der Wagen bräche, und es waren doch nur die Bande, die vom Herzen des treuen Heinrich absprangen, weil sein Herr erlöst und glücklich war."
    ]
    },
    {
    "id": "de-bremen",
    "lang": "de",
    "premium": true,
    "title": "Die Bremer Stadtmusikanten",
    "author": "Jacob und Wilhelm Grimm",
    "translator": null,
    "paragraphs": [
    "Es hatte ein Mann einen Esel, der schon lange Jahre die Säcke unverdrossen zur Mühle getragen hatte, dessen Kräfte aber nun zu Ende giengen, so daß er zur Arbeit immer untauglicher ward. Da dachte der Herr daran, ihn aus dem Futter zu schaffen, aber der Esel merkte daß kein guter Wind wehte, lief fort und machte sich auf den Weg nach Bremen: dort, meinte er, könnte er ja Stadtmusikant werden. Als er ein Weilchen fortgegangen war, fand er einen Jagdhund auf dem Wege liegen, der jappte wie einer, der sich müde gelaufen hat. „Nun, was jappst du so, Packan?“ fragte der Esel. „Ach,“ sagte der Hund, „weil ich alt bin und jeden Tag schwächer werde, auch auf der Jagd nicht mehr fort kann, hat mich mein Herr wollen todt schlagen, da hab ich Reißaus genommen; aber womit soll ich nun mein Brot verdienen?“ „Weißt du was,“ sprach der Esel, „ich gehe nach Bremen und werde dort Stadtmusikant, geh mit und laß dich auch bei der Musik annehmen. Ich spiele die Laute, und du schlägst die Pauken.“ Der Hund wars zufrieden, und sie giengen weiter. Es dauerte nicht lange, so saß da eine Katze an dem Weg und machte ein Gesicht wie drei Tage Regenwetter. „Nun, was ist dir in die Quere gekommen, alter Bartputzer?“ sprach der Esel. „Wer kann da lustig sein, wenns einem an den Kragen geht,“ antwortete die Katze, „weil ich nun zu Jahren komme, meine Zähne stumpf werden, und ich lieber hinter dem Ofen sitze und spinne, als nach Mäusen herum jage, hat mich meine Frau ersäufen wollen; ich habe mich zwar noch fortgemacht, aber nun ist guter Rath theuer: wo soll ich hin?“ „Geh mit uns nach Bremen, du verstehst dich doch auf die Nachtmusik, da kannst du ein Stadtmusikant werden.“ Die Katze hielt das für gut und gieng mit. Darauf kamen die drei Landesflüchtigen an einem Hof vorbei, da saß auf dem Thor der Haushahn und schrie aus Leibeskräften. „Du schreist einem durch Mark und Bein,“ sprach der Esel, „was hast du vor?“ „Da hab ich gut Wetter prophezeit,“ sprach der Hahn, „weil unserer lieben Frauen Tag ist, wo sie dem Christkindlein die Hemdchen gewaschen hat und sie trocknen will; aber weil Morgen zum Sonntag Gäste kommen, so hat die Hausfrau doch kein Erbarmen, und hat der Köchin gesagt sie wollte mich Morgen in der Suppe essen, und da soll ich mir heut Abend den Kopf abschneiden lassen. Nun schrei ich aus vollem Hals, so lang ich noch kann.“ „Ei was, du Rothkopf,“ sagte der Esel, „zieh lieber mit uns fort, wir gehen nach Bremen, etwas besseres als den Tod findest du überall; du hast eine gute Stimme, und wenn wir zusammen musicieren, so muß es eine Art haben.“ Der Hahn ließ sich den Vorschlag gefallen, und sie giengen alle viere zusammen fort.",
    "Sie konnten aber die Stadt Bremen in einem Tag nicht erreichen und kamen Abends in einen Wald, wo sie übernachten wollten. Der Esel und der Hund legten sich unter einen großen Baum, die Katze und der Hahn machten sich in die Äste, der Hahn aber flog bis in die Spitze, wo es am sichersten für ihn war. Ehe er einschlief, sah er sich noch einmal nach allen vier Winden um, da däuchte ihn er sähe in der Ferne ein Fünkchen brennen und rief seinen Gesellen zu es müßte nicht gar weit ein Haus sein, denn es scheine ein Licht. Sprach der Esel „so müssen wir uns aufmachen und noch hingehen, denn hier ist die Herberge schlecht.“ Der Hund meinte ein paar Knochen und etwas Fleisch dran, thäten ihm auch gut. Also machten sie sich auf den Weg nach der Gegend, wo das Licht war, und sahen es bald heller schimmern, und es ward immer größer, bis sie vor ein hell erleuchtetes Räuberhaus kamen. Der Esel, als der größte, näherte sich dem Fenster und schaute hinein. „Was siehst du, Grauschimmel?“ fragte der Hahn. „Was ich sehe?“ antwortete der Esel, „einen gedeckten Tisch mit schönem Essen und Trinken, und Räuber sitzen daran und lassens sich wohl sein.“ „Das wäre was für uns“ sprach der Hahn. „Ja, ja, ach, wären wir da!“ sagte der Esel. Da rathschlagten die Thiere wie sie es anfangen müßten, um die Räuber hinaus zu jagen und fanden endlich ein Mittel. Der Esel mußte sich mit den Vorderfüßen auf das Fenster stellen, der Hund auf des Esels Rücken springen, die Katze auf den Hund klettern, und endlich flog der Hahn hinauf, und setzte sich der Katze auf den Kopf. Wie das geschehen war, fiengen sie auf ein Zeichen insgesammt an ihre Musik zu machen: der Esel schrie, der Hund bellte, die Katze miaute und der Hahn krähte; dann stürzten sie durch das Fenster in die Stube hinein daß die Scheiben klirrten. Die Räuber fuhren bei dem entsetzlichen Geschrei in die Höhe, meinten nicht anders als ein Gespenst käme herein und flohen in größter Furcht in den Wald hinaus. Nun setzten sich die vier Gesellen an den Tisch, nahmen mit dem vorlieb, was übrig geblieben war, und aßen als wenn sie vier Wochen hungern sollten.",
    "Wie die vier Spielleute fertig waren, löschten sie das Licht aus und suchten sich eine Schlafstätte, jeder nach seiner Natur und Bequemlichkeit. Der Esel legte sich auf den Mist, der Hund hinter die Thüre, die Katze auf den Herd bei die warme Asche, und der Hahn setzte sich auf den Hahnenbalken: und weil sie müde waren von ihrem langen Weg, schliefen sie auch bald ein. Als Mitternacht vorbei war, und die Räuber von weitem sahen daß kein Licht mehr im Haus brannte, auch alles ruhig schien, sprach der Hauptmann „wir hätten uns doch nicht sollen ins Bockshorn jagen lassen,“ und hieß einen hingehen und das Haus untersuchen. Der Abgeschickte fand alles still, gieng in die Küche, ein Licht anzuzünden, und weil er die glühenden, feurigen Augen der Katze für lebendige Kohlen ansah, hielt er ein Schwefelhölzchen daran, daß es Feuer fangen sollte. Aber die Katze verstand keinen Spaß, sprang ihm ins Gesicht, spie und kratzte. Da erschrack er gewaltig, lief und wollte zur Hinterthüre hinaus, aber der Hund, der da lag, sprang auf und biß ihn ins Bein: und als er über den Hof an dem Miste vorbei rannte, gab ihm der Esel noch einen tüchtigen Schlag mit dem Hinterfuß; der Hahn aber, der vom Lärmen aus dem Schlaf geweckt und munter geworden war, rief vom Balken herab „kikeriki!“ Da lief der Räuber, was er konnte, zu seinem Hauptmann zurück und sprach „ach, in dem Haus sitzt eine gräuliche Hexe, die hat mich angehaucht und mit ihren langen Fingern mir das Gesicht zerkratzt: und vor der Thüre steht ein Mann mit einem Messer, der hat mich ins Bein gestochen: und auf dem Hof liegt ein schwarzes Ungethüm, das hat mit einer Holzkeule auf mich losgeschlagen: und oben auf dem Dache, da sitzt der Richter, der rief bringt mir den Schelm her. Da machte ich daß ich fortkam.“ Von nun an getrauten sich die Räuber nicht weiter in das Haus, den vier Bremer Musikanten gefiels aber so wohl darin, daß sie nicht wieder heraus wollten. Und der das zuletzt erzählt hat, dem ist der Mund noch warm."
    ]
    },
    {
    "id": "en-fox-grapes",
    "lang": "en",
    "premium": false,
    "title": "The Fox and the Grapes",
    "author": "Aesop",
    "translator": "George Fyler Townsend",
    "paragraphs": [
    "A famished Fox saw some clusters of ripe black grapes hanging from a trellised vine. She resorted to all her tricks to get at them, but wearied herself in vain, for she could not reach them. At last she turned away, beguiling herself of her disappointment and saying: \"The Grapes are sour, and not ripe as I thought.\""
    ]
    },
    {
    "id": "en-hare-tortoise",
    "lang": "en",
    "premium": false,
    "title": "The Hare and the Tortoise",
    "author": "Aesop",
    "translator": "George Fyler Townsend",
    "paragraphs": [
    "A Hare one day ridiculed the short feet and slow pace of the Tortoise. The latter, laughing, said: \"Though you be swift as the wind, I will beat you in a race.\" The Hare, deeming her assertion to be simply impossible, assented to the proposal; and they agreed that the Fox should choose the course, and fix the goal. On the day appointed for the race they started together. The Tortoise never for a moment stopped, but went on with a slow but steady pace straight to the end of the course. The Hare, trusting to his native swiftness, cared little about the race, and lying down by the wayside, fell fast asleep. At last waking up, and moving as fast as he could, he saw the Tortoise had reached the goal, and was, comfortably dozing after her fatigue."
    ]
    },
    {
    "id": "en-elves",
    "lang": "en",
    "premium": false,
    "title": "The Elves",
    "author": "Jacob und Wilhelm Grimm",
    "translator": "Lucy Crane",
    "paragraphs": [
    "There was once a shoemaker, who, through no fault of his own, became so poor that at last he had nothing left but just enough leather to make one pair of shoes. He cut out the shoes at night, so as to set to work upon them next morning; and as he had a good conscience, he laid himself quietly down in his bed, committed himself to heaven, and fell asleep. In the morning, after he had said his prayers, and was going to get to work, he found the pair of shoes made and finished, and standing on his table. He was very much astonished, and could not tell what to think, and he took the shoes in his hand to examine them more nearly; and they were so well made that every stitch was in its right place, just as if they had come from the hand of a master-workman.",
    "Soon after a purchaser entered, and as the shoes fitted him very well, he gave more than the usual price for them, so that the shoemaker had enough money to buy leather for two more pairs of shoes. He cut them out at night, and intended to set to work the next morning with fresh spirit; but that was not to be, for when he got up they were already finished, and a customer even was not lacking, who gave him so much money that he was able to buy leather enough for four new pairs. Early next morning he found the four pairs also finished, and so it always happened; whatever he cut out in the evening was worked up by the morning, so that he was soon in the way of making a good living, and in the end became very well to do.",
    "One night, not long before Christmas, when the shoemaker had finished cutting out, and before he went to bed, he said to his wife,",
    "\"How would it be if we were to sit up to-night and see who it is that does us this service?\"",
    "His wife agreed, and set a light to burn. Then they both hid in a corner of the room, behind some coats that were hanging up, and then they began to watch. As soon as it was midnight they saw come in two neatly-formed naked little men, who seated themselves before the shoemaker's table, and took up the work that was already prepared, and began to stitch, to pierce, and to hammer so cleverly and quickly with their little fingers that the shoemaker's eyes could scarcely follow them, so full of wonder was he. And they never left off until everything was finished and was standing ready on the table, and then they jumped up and ran off.",
    "The next morning the shoemaker's wife said to her husband, \"Those little men have made us rich, and we ought to show ourselves grateful. With all their running about, and having nothing to cover them, they must be very cold. I'll tell you what; I will make little shirts, coats, waistcoats, and breeches for them, and knit each of them a pair of stockings, and you shall make each of them a pair of shoes.\"",
    "The husband consented willingly, and at night, when everything was finished, they laid the gifts together on the table, instead of the cut-out work, and placed themselves so that they could observe how the little men would behave. When midnight came, they rushed in, ready to set to work, but when they found, instead of the pieces of prepared leather, the neat little garments put ready for them, they stood a moment in surprise, and then they testified the greatest delight. With the greatest swiftness they took up the pretty garments and slipped them on, singing,",
    "\"What spruce and dandy boys are we!\nNo longer cobblers we will be.\"",
    "Then they hopped and danced about, jumping over the chairs and tables, and at last they danced out at the door.",
    "From that time they were never seen again; but it always went well with the shoemaker as long as he lived, and whatever he took in hand prospered."
    ]
    },
    {
    "id": "en-bremen",
    "lang": "en",
    "premium": true,
    "title": "The Bremen Town Musicians",
    "author": "Jacob und Wilhelm Grimm",
    "translator": "Lucy Crane",
    "paragraphs": [
    "There was once an ass whose master had made him carry sacks to the mill for many a long year, but whose strength began at last to fail, so that each day as it came found him less capable of work. Then his master began to think of turning him out, but the ass, guessing that something was in the wind that boded him no good, ran away, taking the road to Bremen; for there he thought he might get an engagement as town musician. When he had gone a little way he found a hound lying by the side of the road panting, as if he had run a long way.",
    "\"Now, Holdfast, what are you so out of breath about?\" said the ass.",
    "\"Oh dear!\" said the dog, \"now I am old, I get weaker every day, and can do no good in the hunt, so, as my master was going to have me killed, I have made my escape; but now, how am I to gain a living?\"",
    "\"I will tell you what,\" said the ass, \"I am going to Bremen to become town musician. You may as well go with me, and take up music too. I can play the lute, and you can beat the drum.\"",
    "And the dog consented, and they walked on together. It was not long before they came to a cat sitting in the road, looking as dismal as three wet days.",
    "\"Now then, what is the matter with you, old shaver?\" said the ass.",
    "\"I should like to know who would be cheerful when his neck is in danger?\" answered the cat. \"Now that I am old my teeth are getting blunt, and I would rather sit by the oven and purr than run about after mice, and my mistress wanted to drown me; so I took myself off; but good advice is scarce, and I do not know what is to become of me.\"",
    "\"Go with us to Bremen,\" said the ass, \"and become town musician. You understand serenading.\"",
    "The cat thought well of the idea, and went with them accordingly. After that the three travellers passed by a yard, and a cock was perched on the gate crowing with all his might.",
    "\"Your cries are enough to pierce bone and marrow,\" said the ass; \"what is the matter?\"",
    "\"I have foretold good weather for Lady-day, so that all the shirts may be washed and dried; and now on Sunday morning company is coming, and the mistress has told the cook that I must be made into soup, and this evening my neck is to be wrung, so that I am crowing with all my might while I can.\"",
    "\"You had much better go with us, Chanticleer,\" said the ass. \"We are going to Bremen. At any rate that will be better than dying. You have a powerful voice, and when we are all performing together it will have a very good effect.\"",
    "So the cock consented, and they went on all four together.",
    "But Bremen was too far off to be reached in one day, and towards evening they came to a wood, where they determined to pass the night. The ass and the dog lay down under a large tree; the cat got up among the branches, and the cock flew up to the top, as that was the safest place for him. Before he went to sleep he looked all round him to the four points of the compass, and perceived in the distance a little light shining, and he called out to his companions that there must be a house not far off, as he could see a light, so the ass said,",
    "\"We had better get up and go there, for these are uncomfortable quarters.\" The dog began to fancy a few bones, not quite bare, would do him good. And they all set off in the direction of the light, and it grew larger and brighter, until at last it led them to a robber's house, all lighted up. The ass, being the biggest, went up to the window, and looked in.",
    "\"Well, what do you see?\" asked the dog.",
    "\"What do I see?\" answered the ass; \"here is a table set out with splendid eatables and drinkables, and robbers sitting at it and making themselves very comfortable.\"",
    "\"That would just suit us,\" said the cock.",
    "\"Yes, indeed, I wish we were there,\" said the ass. Then they consulted together how it should be managed so as to get the robbers out of the house, and at last they hit on a plan. The ass was to place his forefeet on the window-sill, the dog was to get on the ass's back, the cat on the top of the dog, and lastly the cock was to fly up and perch on the cat's head. When that was done, at a given signal they all began to perform their music. The ass brayed, the dog barked, the cat mewed, and the cock crowed; then they burst through into the room, breaking all the panes of glass. The robbers fled at the dreadful sound; they thought it was some goblin, and fled to the wood in the utmost terror. Then the four companions sat down to table, made free with the remains of the meal, and feasted as if they had been hungry for a month. And when they had finished they put out the lights, and each sought out a sleeping-place to suit his nature and habits. The ass laid himself down outside on the dunghill, the dog behind the door, the cat on the hearth by the warm ashes, and the cock settled himself in the cockloft, and as they were all tired with their long journey they soon fell fast asleep.",
    "When midnight drew near, and the robbers from afar saw that no light was burning, and that everything appeared quiet, their captain said to them that he thought that they had run away without reason, telling one of them to go and reconnoitre. So one of them went, and found everything quite quiet; he went into the kitchen to strike a light, and taking the glowing fiery eyes of the cat for burning coals, he held a match to them in order to kindle it. But the cat, not seeing the joke, flew into his face, spitting and scratching. Then he cried out in terror, and ran to get out at the back door, but the dog, who was lying there, ran at him and bit his leg; and as he was rushing through the yard by the dunghill the ass struck out and gave him a great kick with his hindfoot; and the cock, who had been wakened with the noise, and felt quite brisk, cried out, \"Cock-a-doodle-doo!\"",
    "Then the robber got back as well as he could to his captain, and said, \"Oh dear! in that house there is a grewsome witch, and I felt her breath and her long nails in my face; and by the door there stands a man who stabbed me in the leg with a knife; and in the yard there lies a black spectre, who beat me with his wooden club; and above, upon the roof, there sits the justice, who cried, 'Bring that rogue here!' And so I ran away from the place as fast as I could.\"",
    "From that time forward the robbers never ventured to that house, and the four Bremen town musicians found themselves so well off where they were, that there they stayed. And the person who last related this tale is still living, as you see."
    ]
    }
    ],

  licences: [
    {
    "id": "fr-corbeau",
    "title": "Le Corbeau et le Renard",
    "author": "Jean de La Fontaine",
    "authorDeath": 1695,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://fr.wikisource.org/wiki/Fables_de_La_Fontaine_(%C3%A9d._1874)/Le_Corbeau_et_le_Renard",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "fr-cigale",
    "title": "La Cigale et la Fourmi",
    "author": "Jean de La Fontaine",
    "authorDeath": 1695,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://fr.wikisource.org/wiki/Fables_de_La_Fontaine_(%C3%A9d._1874)/La_Cigale_et_la_Fourmi",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "fr-chaperon",
    "title": "Le Petit Chaperon rouge",
    "author": "Charles Perrault",
    "authorDeath": 1703,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://fr.wikisource.org/wiki/Histoires_ou_Contes_du_temps_pass%C3%A9_(1697)/Original/Le_petit_chaperon_rouge",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "fr-chat",
    "title": "Le Maistre Chat ou le Chat botté",
    "author": "Charles Perrault",
    "authorDeath": 1703,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://fr.wikisource.org/wiki/Histoires_ou_Contes_du_temps_pass%C3%A9_(1697)/Original/Le_Maistre_Chat",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "de-sterntaler",
    "title": "Die Sternthaler",
    "author": "Jacob und Wilhelm Grimm",
    "authorDeath": 1863,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://de.wikisource.org/wiki/Die_Sternthaler_(1857)",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "de-froschkoenig",
    "title": "Der Froschkönig oder der eiserne Heinrich",
    "author": "Jacob und Wilhelm Grimm",
    "authorDeath": 1863,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://de.wikisource.org/wiki/Der_Froschk%C3%B6nig_oder_der_eiserne_Heinrich_(1857)",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "de-bremen",
    "title": "Die Bremer Stadtmusikanten",
    "author": "Jacob und Wilhelm Grimm",
    "authorDeath": 1863,
    "translator": null,
    "translatorDeath": null,
    "sourceUrl": "https://de.wikisource.org/wiki/Die_Bremer_Stadtmusikanten_(1857)",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "en-fox-grapes",
    "title": "The Fox and the Grapes",
    "author": "Aesop",
    "authorDeath": -564,
    "translator": "George Fyler Townsend",
    "translatorDeath": 1900,
    "sourceUrl": "https://en.wikisource.org/wiki/Three_Hundred_%C3%86sop%27s_Fables/The_Fox_and_the_Grapes",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "en-hare-tortoise",
    "title": "The Hare and the Tortoise",
    "author": "Aesop",
    "authorDeath": -564,
    "translator": "George Fyler Townsend",
    "translatorDeath": 1900,
    "sourceUrl": "https://en.wikisource.org/wiki/Three_Hundred_%C3%86sop%27s_Fables/The_Hare_and_the_Tortoise",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "en-elves",
    "title": "The Elves",
    "author": "Jacob und Wilhelm Grimm",
    "authorDeath": 1863,
    "translator": "Lucy Crane",
    "translatorDeath": 1882,
    "sourceUrl": "https://www.gutenberg.org/cache/epub/19068/pg19068-images.html",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    },
    {
    "id": "en-bremen",
    "title": "The Bremen Town Musicians",
    "author": "Jacob und Wilhelm Grimm",
    "authorDeath": 1863,
    "translator": "Lucy Crane",
    "translatorDeath": 1882,
    "sourceUrl": "https://www.gutenberg.org/cache/epub/19068/pg19068-images.html",
    "verifiedOn": "2026-11-09",
    "verifiedBy": "Claude (research, to be confirmed by LabLand)"
    }
    ],

  /* Old spellings read the modern way by the voice only (the screen keeps the original text). */
  spoken: {
    fr: {
      'Asne': 'Âne', 'Bastimens': 'Bâtiments', 'Chasteau': 'Château', 'Forest': 'Forêt', 'Ie': 'Je', 'Iusque': 'Jusque', 'Maistre': 'Maître', 'maistre': 'maître', 'Meusnier': 'Meunier',
      'Roy': 'Roi', 'Vilage': 'Village', 'Vn': 'Un', 'Vne': 'Une', 'Vostre': 'Votre', 'vostre': 'votre', 'aisné': 'aîné', 'allast': 'allât', 'aperçuë': 'aperçue', 'appelloit': 'appelait',
      'aprés': 'après', 'arrester': 'arrêter', 'aussitost': 'aussitôt', 'aussi-tost': 'aussitôt', 'bien-tost': 'bientôt', 'cry': 'cri', 'desespera': 'désespéra', 'estant': 'étant', 'estoit': 'était', 'estoient': 'étaient', 'Estoit': 'Était',
      'estendant': 'étendant', 'estonné': 'étonné', 'estonnée': 'étonnée', 'estrange': 'étrange', 'estre': 'être', 'esté': 'été', 'fust': 'fût', 'honnestement': 'honnêtement', 'icy': 'ici',
      'indifferens': 'indifférents', 'luy': 'lui', 'mesme': 'même', 'montast': 'montât', 'montreray': 'montrerai', 'moy': 'moi', 'ny': 'ni', 'ouy': 'oui', 'pasté': 'pâté', 'plustost': 'plutôt',
      'plutost': 'plutôt', 'quoy': 'quoi', 'seray': 'serai', 'seïoit': 'seyait', 'sçachant': 'sachant', 'sçait': 'sait', 'sçaurois': 'saurais', 'sçavoir': 'savoir', 'sçavoit': 'savait',
      'sçeut': 'sut', 'sçû': 'su', 'teste': 'tête', 'tost': 'tôt', 'toy': 'toi', 'tres': 'très', 'venuë': 'venue', 'verez': 'verrez', 'veu': 'vu', 'viste': 'vite', 'voylà': 'voilà',
      'vray': 'vrai', 'galetes': 'galettes', 'dens': 'dents', 'enfans': 'enfants', 'complaisans': 'complaisants', 'privez': 'privés', 'compere': 'compère', 'mere': 'mère', 'Mere': 'Mère',
      'premiere': 'première', 'bucherons': 'bûcherons', 'deshabille': 'déshabille', 'deshabillé': 'déshabillé', 'devora': 'dévora', 'cueïllir': 'cueillir', 'cui': 'cuit',
      'long-temps': 'longtemps', 'chera': 'cherra', 'envoye': 'envoie', 'serieux': 'sérieux', 'freres': 'frères', 'misere': 'misère', 'possedoit': 'possédait'
    },
    de: {
      'Bißlein': 'Bisslein', 'Hinterthüre': 'Hintertüre', 'Noth': 'Not', 'Rath': 'Rat', 'Rothkopf': 'Rotkopf', 'Thaler': 'Taler', 'Sternthaler': 'Sterntaler', 'Thiere': 'Tiere', 'Thor': 'Tor',
      'Thür': 'Tür', 'Thüre': 'Türe', 'Ungethüm': 'Ungetüm', 'rathschlagten': 'ratschlagten', 'theuer': 'teuer', 'that': 'tat', 'thäten': 'täten', 'fieng': 'fing', 'fiengen': 'fingen',
      'gieng': 'ging', 'giengen': 'gingen'
    }
  }
};
if (typeof window !== 'undefined') window.READING_DATA = READING_DATA;

/* ---------- 1.16: the novels. BellatrixBooks keeps the shelf and loads a book only when it opens ----------
   js/books/index.js (always loaded, right after this file) calls
     BellatrixBooks.index([{ id, lang, title, author, year, free, chapters, words, source, licence }, …])
   with metadata only (the book list). Each novel is js/books/<id>.js, loaded ON DEMAND by get():
     BellatrixBooks.add({ id, lang, title, author, year, free, source, licence, chapters: [{ title, paras: ['…'] }] })
   Paragraphs are plain strings (no HTML). free: false = a "Livres Premium" book. A book with
   sample: true is never offered to residents (format tests only, js/books/sample-*.js).
   At most two books stay in memory (the biggest file is about 1.5 MB). ES5 (Chrome 95 WebView). */
var BellatrixBooks = (function () {
  'use strict';
  var INDEX = [], BOOKS = {}, order = [], waiting = {};
  function str(v) { return String(v == null ? '' : v); }
  function clean(e) {
    if (!e || !e.id) return null;
    return { id: str(e.id), lang: str(e.lang), title: str(e.title), author: str(e.author), year: e.year == null ? null : e.year, free: e.free !== false,
      chapters: typeof e.chapters === 'number' ? e.chapters : (e.chapters && e.chapters.length) || 0, words: e.words || 0,
      source: e.source == null ? '' : e.source, licence: e.licence == null ? '' : e.licence, sample: !!e.sample, color: e.color || '' };
  }
  /* The shelf: replaces the entries with the same id, keeps the others. */
  function index(list) {
    (list || []).forEach(function (e) {
      var c = clean(e);
      if (!c) return;
      INDEX = INDEX.filter(function (x) { return x.id !== c.id; }).concat([c]);
    });
    return INDEX.length;
  }
  function entry(id) { for (var i = 0; i < INDEX.length; i++) if (INDEX[i].id === id) return INDEX[i]; return null; }
  function list(lang) { return INDEX.filter(function (e) { return !lang || e.lang === lang; }); }
  /* A book file registers itself. */
  function add(b) {
    if (!b || !b.id || !b.chapters || !b.chapters.length) return null;
    var c = clean(b);
    c.chapters = b.chapters.map(function (ch) {
      return { title: str(ch.title), paras: (ch.paras || []).map(str).filter(function (p) { return p.replace(/\s+/g, ''); }) };
    });
    BOOKS[c.id] = c;
    order = order.filter(function (x) { return x !== c.id; }).concat([c.id]);
    while (order.length > 2) delete BOOKS[order.shift()];
    if (!entry(c.id)) index([{ id: c.id, lang: c.lang, title: c.title, author: c.author, year: c.year, free: c.free, chapters: c.chapters.length, source: c.source, licence: c.licence, sample: c.sample, color: c.color }]);
    var cbs = waiting[c.id] || [];
    delete waiting[c.id];
    cbs.forEach(function (f) { try { f(null, c); } catch (e) { /* the caller's problem */ } });
    return c;
  }
  function loaded(id) { return BOOKS[id] || null; }
  /* The version of this app, for the book files (same ?v= as js/reading-data.js). */
  function version() {
    try { var s = document.querySelector('script[src*="reading-data.js"]'), m = s && /[?&]v=([^&]+)/.exec(s.getAttribute('src')); return m ? m[1] : ''; } catch (e) { return ''; }
  }
  var loader = function (id, done) {
    if (typeof document === 'undefined') { done(new Error('no page')); return; }
    var el = document.createElement('script'), v = version();
    el.src = 'js/books/' + encodeURIComponent(id) + '.js' + (v ? '?v=' + encodeURIComponent(v) : '');
    el.async = true;
    el.onload = function () { done(null); };
    el.onerror = function () { done(new Error('the book file did not load')); };
    document.head.appendChild(el);
  };
  /* get(id, cb): cb(null, book) when it is here, at once if already loaded; cb(error) otherwise. */
  function get(id, cb) {
    cb = cb || function () {};
    if (BOOKS[id]) { cb(null, BOOKS[id]); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(str(id))) { cb(new Error('bad book id')); return; }
    var first = !waiting[id];
    (waiting[id] = waiting[id] || []).push(cb);
    if (!first) return;
    var timer = setTimeout(function () { fail(new Error('the book file took too long')); }, 20000);
    function fail(err) {
      clearTimeout(timer);
      var cbs = waiting[id] || [];
      delete waiting[id];
      cbs.forEach(function (f) { try { f(err); } catch (e) { /* the caller's problem */ } });
    }
    loader(id, function (err) {
      clearTimeout(timer);
      if (BOOKS[id]) return;           /* add() has answered */
      fail(err || new Error('the book file did not register ' + id));
    });
  }
  return { index: index, add: add, get: get, list: list, entry: entry, loaded: loaded,
    /* for the node tests: another loader (id, done) and an empty shelf */
    _useLoader: function (fn) { loader = fn; }, _reset: function () { INDEX = []; BOOKS = {}; order = []; waiting = {}; } };
})();
if (typeof window !== 'undefined') window.BellatrixBooks = BellatrixBooks;
