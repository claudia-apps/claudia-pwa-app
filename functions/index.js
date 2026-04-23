
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const BOOKING_COLLECTION = 'Programari';
const ADMIN_PUSH_COLLECTION = 'AdminPushSubscriptions';
const TIME_ZONE = 'Europe/Bucharest';

function cleanText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function formatBookingDate(value) {
  if (!value || typeof value !== 'string') return '-';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(parsed);
}

function formatBookingTime(value) {
  const normalized = cleanText(value);
  return normalized === '-' ? normalized : normalized.slice(0, 5);
}

function getDatePartsInTimeZone(date = new Date(), timeZone = TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getTimeZoneOffsetMs(timeZone, date = new Date()) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateString, timeString, timeZone = TIME_ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return null;
  if (!/^\d{2}:\d{2}$/.test(timeString || '')) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offset);
}

async function getAdminTokens() {
  const subscriptionsSnapshot = await db
    .collection(ADMIN_PUSH_COLLECTION)
    .where('enabled', '==', true)
    .get();

  if (subscriptionsSnapshot.empty) return [];

  return subscriptionsSnapshot.docs
    .map((doc) => cleanText(doc.get('token'), ''))
    .filter(Boolean);
}

async function removeInvalidTokens(tokens, response, meta = {}) {
  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code || 'unknown';
      logger.error('Eroare la trimiterea notificării.', {
        ...meta,
        token: tokens[index],
        code,
        message: item.error?.message || null
      });

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (!invalidTokens.length) return;

  await Promise.all(
    invalidTokens.map((token) =>
      db.collection(ADMIN_PUSH_COLLECTION).doc(token).delete().catch((error) => {
        logger.error('Nu am putut șterge token-ul invalid.', {
          token,
          error: error.message
        });
      })
    )
  );
}

async function sendBookingNotification({
  tokens,
  title,
  body,
  tag,
  bookingId,
  booking,
  link = '/',
  requireInteraction = false,
  renotify = false
}) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const clientName = cleanText(booking.name);
  const phone = cleanText(booking.phone);
  const instagram = cleanText(booking.instagram);
  const serviceModel = cleanText(booking.model);
  const details = cleanText(booking.details);
  const service = cleanText(booking.service || booking.selectedService || 'Programare');
  const bookingDate = formatBookingDate(booking.date);
  const bookingTime = formatBookingTime(booking.time);

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body
    },
    webpush: {
      notification: {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        renotify,
        requireInteraction,
        vibrate: [250, 120, 250, 120, 400],
        actions: [
          { action: 'open-booking', title: 'Deschide agenda ✨' }
        ]
      },
      fcmOptions: {
        link
      }
    },
    data: {
      url: link,
      tag,
      bookingId,
      clientName,
      phone,
      instagram,
      service,
      serviceModel,
      details,
      date: cleanText(booking.date),
      readableDate: bookingDate,
      time: bookingTime
    }
  });

  await removeInvalidTokens(tokens, response, { bookingId, tag });
  return response;
}

exports.notifyAdminOnNewBooking = onDocumentCreated(
  {
    document: `${BOOKING_COLLECTION}/{bookingId}`,
    region: 'europe-west1'
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('Eveniment fără snapshot.');
      return;
    }

    const booking = snapshot.data() || {};
    const bookingId = event.params.bookingId;
    const tokens = await getAdminTokens();

    if (!tokens.length) {
      logger.info('Nu există dispozitive admin înregistrate pentru notificări.', { bookingId });
      return;
    }

    const clientName = cleanText(booking.name);
    const bookingDate = formatBookingDate(booking.date);
    const bookingTime = formatBookingTime(booking.time);

    const response = await sendBookingNotification({
      tokens,
      title: 'Programare nouă ✨',
      body: `${clientName} • ${bookingDate}, ${bookingTime}`,
      tag: `booking-${bookingId}`,
      bookingId,
      booking,
      requireInteraction: true,
      renotify: true
    });

    logger.info('Notificările pentru programare au fost procesate.', {
      bookingId,
      totalTokens: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  }
);

exports.sendAdminBookingReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: TIME_ZONE,
    region: 'europe-west1',
    retryCount: 0
  },
  async () => {
    const tokens = await getAdminTokens();
    if (!tokens.length) {
      logger.info('Reminder-ele au fost omise: nu există dispozitive admin active.');
      return;
    }

    const now = new Date();
    const todayParts = getDatePartsInTimeZone(now, TIME_ZONE);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = getDatePartsInTimeZone(tomorrow, TIME_ZONE);
    const today = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`;
    const nextDay = `${tomorrowParts.year}-${String(tomorrowParts.month).padStart(2, '0')}-${String(tomorrowParts.day).padStart(2, '0')}`;

    const snapshot = await db
      .collection(BOOKING_COLLECTION)
      .where('date', '>=', today)
      .where('date', '<=', nextDay)
      .get();

    if (snapshot.empty) {
      logger.info('Nu există programări pentru intervalul verificat la remindere.');
      return;
    }

    let checked = 0;
    let sent = 0;

    for (const doc of snapshot.docs) {
      checked += 1;
      const booking = doc.data() || {};
      const bookingId = doc.id;
      const bookingMoment = zonedDateTimeToUtc(booking.date, booking.time, TIME_ZONE);

      if (!bookingMoment) {
        logger.warn('Programare ignorată la remindere: dată sau oră invalidă.', { bookingId });
        continue;
      }

      const diffMinutes = Math.round((bookingMoment.getTime() - now.getTime()) / 60000);
      if (diffMinutes < 0) continue;

      let reminderType = null;
      let title = '';
      let body = '';
      let patch = null;

      const clientName = cleanText(booking.name);
      const bookingTime = formatBookingTime(booking.time);

      if (!booking.reminder60Sent && diffMinutes >= 56 && diffMinutes <= 65) {
        reminderType = '1h';
        title = 'Programare în 1 oră 💖';
        body = `${clientName} la ${bookingTime}. Pregătește-te frumos ✨`;
        patch = {
          reminder60Sent: true,
          reminder60SentAt: admin.firestore.FieldValue.serverTimestamp()
        };
      } else if (!booking.reminder30Sent && diffMinutes >= 26 && diffMinutes <= 35) {
        reminderType = '30m';
        title = 'Programare în 30 min 💅';
        body = `${clientName} la ${bookingTime}. E momentul să fii gata 🌸`;
        patch = {
          reminder30Sent: true,
          reminder30SentAt: admin.firestore.FieldValue.serverTimestamp()
        };
      }

      if (!reminderType || !patch) continue;

      const response = await sendBookingNotification({
        tokens,
        title,
        body,
        tag: `reminder-${reminderType}-${bookingId}`,
        bookingId,
        booking,
        requireInteraction: true,
        renotify: true
      });

      await doc.ref.set(patch, { merge: true });
      sent += 1;

      logger.info('Reminder trimis cu succes.', {
        bookingId,
        reminderType,
        diffMinutes,
        successCount: response.successCount,
        failureCount: response.failureCount
      });
    }

    logger.info('Verificare remindere finalizată.', {
      checked,
      sent,
      totalCandidates: snapshot.size
    });
  }
);
