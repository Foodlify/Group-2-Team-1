/**
 * Service worker for the Web Push demo.
 *
 * The browser runs this in the background — it is what receives a push when
 * the page (or the whole browser window) is closed, which is the entire point
 * of push over polling.
 */

self.addEventListener("push", (event) => {
  // A push with no payload is legal; the spec allows waking a client up with
  // nothing in it, so this must not throw.
  let payload = { title: "Foodlify", body: "You have an update." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "Foodlify", body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Foodlify", {
      body: payload.body ?? "",
      // Collapses repeat notifications for the same order into one entry
      // rather than stacking a fresh banner for every status change.
      tag: payload.orderId ?? "foodlify",
      data: payload,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/push-demo/"));
});
