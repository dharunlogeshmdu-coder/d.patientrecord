// ============================================================================
// Physio Accounting — Service Worker
// ----------------------------------------------------------------------------
// Two jobs:
//  1) PWA install-eligibility + basic offline fallback (unchanged from before).
//  2) Firebase Cloud Messaging background push — shows a system notification
//     with "Confirm/Mark Paid" and "WhatsApp Patient" actions for visit
//     reminders, even when the app/tab is fully closed. The actual sending
//     is done by the standalone reminder-scan backend (physio-reminder-backend/).
// ============================================================================

const CACHE_NAME = 'physio-accounting-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Basic network-first fetch handler (falls back to cache if offline).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ----------------------------------------------------------------------------
// Firebase Cloud Messaging — background push
// ----------------------------------------------------------------------------
// Service workers can't use ES module imports, so this uses the classic
// "compat" builds via importScripts (the standard Firebase pattern for sw.js).
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC8O_OWGcHHYK4Q8-cZNhqseSFeIy9-ixo",
  authDomain: "raghav-physio-ad066.firebaseapp.com",
  projectId: "raghav-physio-ad066",
  storageBucket: "raghav-physio-ad066.firebasestorage.app",
  messagingSenderId: "789966622009",
  appId: "1:789966622009:web:44977d7832aad1aa9aece8"
});

const messaging = firebase.messaging();

// Fired only when the app is backgrounded/closed. (When a tab is open and
// focused, the page's own onMessage() handler in index.html runs instead
// and shows the in-app toast — the two are mutually exclusive by design,
// since the backend sends a data-only payload with no top-level
// "notification" field.)
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = `${data.patientName || 'Patient'}'s Session — ${data.timeLabel || data.reminderTime || ''}`;
  const body = data.body || 'Scheduled visit time reached. Confirm the visit or send a WhatsApp nudge.';

  const notificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.patientId ? `visit-reminder-${data.patientId}-${data.date || ''}` : undefined,
    data, // carried through to notificationclick below
    actions: [
      { action: 'confirm', title: '✔ Confirm / Mark Paid' },
      { action: 'whatsapp', title: '📲 WhatsApp Patient' }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

// Routes a tap on the notification (or one of its two action buttons) back
// into the app. A service worker can't call the page's JS functions
// directly, so instead we open/focus the app with query params that
// index.html reads on load via window.handlePendingPushAction().
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action || 'confirm'; // tapping the body (no button) defaults to "confirm"
  const params = new URLSearchParams();
  params.set('pushAction', action);
  if (data.patientId != null) params.set('patientId', data.patientId);
  if (data.date) params.set('date', data.date);
  const targetUrl = '/?' + params.toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse an already-open tab when possible instead of opening a new one.
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => c.focus());
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
