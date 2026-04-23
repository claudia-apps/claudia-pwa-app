PAȘI RAPIZI PENTRU NOTIFICĂRI ADMIN

1. Din folderul proiectului rulezi în terminal:
   npm install -g firebase-tools
   firebase login

2. Instalezi dependențele funcției:
   cd functions
   npm install
   cd ..

3. Publici backend-ul pentru notificări:
   firebase deploy --only functions

4. Publici și aplicația web dacă vrei să urci tot proiectul:
   firebase deploy

5. Pe telefonul de admin:
   - deschizi aplicația publicată
   - te autentifici ca admin
   - intri în Setări administrator
   - apeși „Activează notificările”
   - accepți permisiunea browserului

CE AM LĂSAT GATA ÎN PROIECT
- notificarea push se trimite automat când apare o programare nouă în colecția Programari
- tokenul dispozitivului de admin se salvează în AdminPushSubscriptions
- aplicația poate afișa notificări în foreground și background
- serviciul selectat în programare se salvează și în Firebase

IMPORTANT
- pe iPhone, aplicația trebuie instalată pe ecranul principal pentru notificări push
- dacă ai mai avut o versiune veche instalată, șterge aplicația/PWA veche și reinstaleaz-o după deploy


UPDATE REMINDERE:
- functia sendAdminBookingReminders ruleaza automat la fiecare 5 minute
- trimite reminder cu ~1 ora inainte
- trimite reminder cu ~30 minute inainte
- marcheaza in Firestore campurile reminder60Sent/reminder30Sent pentru a evita dublurile
- dupa acest update trebuie rulat din nou: firebase deploy --only functions
