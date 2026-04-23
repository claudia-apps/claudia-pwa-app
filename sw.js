importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB9EkixRdQRh8vT17rFKK1jcVuROZ_Nl9o',
  authDomain: 'claudia-adelina-programari.firebaseapp.com',
  projectId: 'claudia-adelina-programari',
  storageBucket: 'claudia-adelina-programari.firebasestorage.app',
  messagingSenderId: '365647029841',
  appId: '1:365647029841:web:a1d502ee6ac017830c7a70',
  measurementId: 'G-FLN8THNJHF'
});

const messaging = firebase.messaging();

const CACHE_VERSION = 'claudia-pwa-v7';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

self.addEventListener('message', (event) => {
  const action = event?.data?.type || event?.data?.action;
  if (action === 'SKIP_WAITING' || action === 'skipWaiting') {
    self.skipWaiting();
  }
});

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigationRequest = event.request.mode === 'navigate';

  event.respondWith((async () => {
    if (isNavigationRequest) {
      try {
        const networkResponse = await fetch(event.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put('./index.html', networkResponse.clone());
        return networkResponse;
      } catch (error) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    }

    if (isSameOrigin) {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return Response.error();
      }
    }

    try {
      return await fetch(event.request);
    } catch (error) {
      return caches.match(event.request).then((response) => response || Response.error());
    }
  })());
});

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Claudia Adelina';
  const options = {
    body: payload?.notification?.body || 'Ai primit o notificare nouă.',
    icon: payload?.notification?.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: payload?.data?.tag || 'claudia-admin-background',
    data: {
      url: payload?.data?.url || './'
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || './';
  event.waitUntil((async () => {
    const resolvedTargetUrl = new URL(targetUrl, self.registration.scope).href;
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingClient = allClients.find((client) => {
      try {
        return new URL(client.url).href === resolvedTargetUrl;
      } catch (error) {
        return false;
      }
    });
    if (matchingClient) {
      await matchingClient.focus();
      matchingClient.postMessage({ type: 'notification-click', url: resolvedTargetUrl });
      return;
    }
    await self.clients.openWindow(resolvedTargetUrl);
  })());
});
