Pachet pregătit pentru deploy Firebase

Conținut:
- index.html (varianta cu butoane toggle pentru liste)
- manifest.json
- sw.js
- firebase.json
- .firebaserc
- .gitignore
- icon-192.png
- icon-512.png
- README_NOTIFICARI_ADMIN.txt
- functions/
  - index.js
  - package.json
  - package-lock.json

Pași:
1. Deschide terminalul în acest folder.
2. Rulează:
   npm install -g firebase-tools
   firebase login
3. Pentru functions:
   cd functions
   npm install
   cd ..
4. Deploy:
   firebase deploy

Dacă vrei să publici doar functions:
   firebase deploy --only functions
