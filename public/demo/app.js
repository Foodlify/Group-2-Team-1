const API = "/api/v1";
const $ = (id) => document.getElementById(id);
const log = (message) => {
  $("log").textContent = `${message}\n\n${$("log").textContent}`;
};

const api = (path, init) =>
  fetch(API + path, { credentials: "same-origin", ...init });

let signedIn = false;

async function refreshIdentity() {
  try {
    const res = await api("/customers/me");
    if (res.status === 401) {
      signedIn = false;
      $("who").textContent = "Not signed in.";
    } else if (res.ok) {
      signedIn = true;
      const { data } = await res.json();
      const phone = data.phone ?? "no phone yet";
      $("who").innerHTML =
        `Signed in as <strong>${data.user.name}</strong> ` +
        `<span class="muted">(${data.user.email} · ${phone})</span>`;
    } else {
      signedIn = false;
      $("who").textContent =
        "Signed in, but not as a customer — this page needs a customer account.";
    }
  } catch (error) {
    $("who").textContent = "Could not reach the API.";
    log(`Identity check failed: ${error.message}`);
  }
  $("signout").disabled = !signedIn;
  $("signin").disabled = signedIn;
  await refreshPushState();
}

$("signin").addEventListener("click", () => {
  window.location.href = `${API}/auth/google`;
});

$("signout").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" });
  log("Signed out.");
  await refreshIdentity();
});

const pushSupported = "serviceWorker" in navigator && "PushManager" in window;

const toUint8Array = (base64url) => {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from([...atob(padded)].map((c) => c.charCodeAt(0)));
};

const currentSubscription = async () => {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration("/demo/");
  return (await reg?.pushManager.getSubscription()) ?? null;
};

async function refreshPushState() {
  if (!pushSupported) {
    $("push-state").textContent = "This browser has no Web Push support.";
    return;
  }
  if (!signedIn) {
    $("push-state").textContent =
      "Sign in first — notifications are per customer.";
    $("subscribe").disabled = true;
    $("unsubscribe").disabled = true;
    return;
  }
  const sub = await currentSubscription();
  $("push-state").textContent = sub
    ? "This browser is registered for notifications."
    : "This browser is not registered.";
  $("subscribe").disabled = Boolean(sub);
  $("unsubscribe").disabled = !sub;
}

$("subscribe").addEventListener("click", async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      log(
        `Notification permission: ${permission}. ` +
          "Push needs it — a subscription that cannot show anything is one " +
          "no browser will create. Allow notifications for this site and " +
          "press the button again.",
      );
      return;
    }

    const keyRes = await api("/push/public-key");
    if (!keyRes.ok) {
      log("Push is not configured on this deployment (no VAPID keys).");
      return;
    }
    const { data } = await keyRes.json();

    const reg = await navigator.serviceWorker.register("/demo/sw.js", {
      scope: "/demo/",
    });
    await navigator.serviceWorker.ready;

    let subscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(data.publicKey),
      });
    } catch (error) {
      log(
        `The browser could not register with its push service: ${error.message}`,
      );
      log(
        "Nothing reached this server — that step is between the browser and " +
          "its push service. Usual causes: notifications muted or blocked for " +
          "this site, notifications off at the OS level, or no route to the " +
          "push service (offline, VPN, or a firewall).",
      );
      return;
    }

    const saved = await api("/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    log(
      saved.ok
        ? "Notifications enabled."
        : `Server refused it: ${saved.status}`,
    );
  } catch (error) {
    log(`Failed: ${error.message}`);
  }
  await refreshPushState();
});

$("unsubscribe").addEventListener("click", async () => {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await api("/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    log("Notifications disabled.");
  } catch (error) {
    log(`Failed: ${error.message}`);
  }
  await refreshPushState();
});

refreshIdentity();
