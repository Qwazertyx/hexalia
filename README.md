# Hexalia

Jeu de plateau à hexagones (ressources, colonies, routes, villes, échanges) qui se joue dans le navigateur :
la TV/le PC affiche le plateau, chaque joueur scanne le QR code et son téléphone devient sa manette (main privée, constructions, échanges).

- 7 formes de plateau (Classique, Marathon, Duel, Anneau, Étoile, Archipel, Isthme), carte tirée au hasard à chaque partie
- 1 à 4 joueurs, victoire à 10 points
- Connexion téléphone ↔ écran en WebRTC (PeerJS), aucune base de données ni backend à héberger

## Jouer en local

```
node serve.js        # affiche l'adresse à ouvrir, ex. http://192.168.1.20:8000
```
Ouvrir cette adresse (pas `localhost`) sur le PC, les téléphones scannent le QR code. Même Wi-Fi requis.

## Déployer

Site 100 % statique : déposer le dossier sur Netlify, Cloudflare Pages, Vercel ou GitHub Pages.
`_headers` ajoute des en-têtes de sécurité sur Netlify / Cloudflare Pages.

## Tests

```
npm test             # moteur de règles : toutes les formes, parties simulées, entrées malveillantes
```

## Sécurité

- L'écran partagé est l'autorité : chaque action d'un téléphone est validée (tour, coûts, emplacements, types).
- Les téléphones ne reçoivent jamais la main des adversaires ni leurs identifiants.
- Noms échappés (pas d'injection HTML), anti-flood (30 messages/s par téléphone), expulsion depuis le lobby.
- CSP stricte, scripts CDN verrouillés par empreinte SRI, serveur local en liste blanche.
- Limite connue : la mise en relation passe par le serveur public gratuit de PeerJS (0.peerjs.com).
# hexalia
