Je veux une cartes web avec les données que tu trouves dans ce repos. Je veux une carte qui utilise la techno maplibre. Carte interactive qu'on va pousser sur github pages. Je veux une carte statique avec les features suivantes :

- champs recherche sur toutes les couches ayant la colonne name_fr


Voici les couches dispo : 

fond.geojson : cette carte c'est le fond la terre c'est juste un aplat de couleur. Tout ce qui n'est pas fond est eau
frontiere.geojson : ce sont les frintières politique ce sont donc juste des lignes afficher comme des frotnières avec un pointillé par exemple
iles.geojson : sert jste pour le label des iles, on a déja le geom des iles dans fond
lacs.geojson : a affichage avec label 
lieux.geojson : coupe de point a afficher avec une discrésation du pus important au moins important : City / town / chateau / ruin avec label
mur.geojson : un gros train ?
politique.geojson : pas afficher la geom juste un label en liserrait en fond arrière plan
rivieres.geojson : afficher avec le même bleu que les lacs plus label le long du cours d'eau
routes.geojson : a afficher ce sont des lignes, épaisseur du trait en fonction de size

Tous les labels se font sur le champs name_fr quand je demande un label
