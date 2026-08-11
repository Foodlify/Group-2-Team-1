self.addEventListener("push", (event) => {
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

      tag: payload.orderId ?? "foodlify",
      data: payload,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/demo/"));
});
