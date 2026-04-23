Versiune finală cu update PWA instant

Fișiere principale:
- index.html
- sw.js

Ce s-a schimbat:
- sw.js are CACHE_VERSION = claudia-pwa-v7
- service worker-ul acceptă mesaj SKIP_WAITING
- index.html verifică update-uri la deschidere și la fiecare 60 secunde
- când există update, noul service worker se activează automat și pagina se reîncarcă o singură dată

Deploy:
git add .
git commit -m "instant pwa update"
git push
