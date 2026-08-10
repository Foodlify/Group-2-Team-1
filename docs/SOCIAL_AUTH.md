# Social Media Authentication (Google)

> The official `Social Media Authentication`, over the OAuth 2.0
> authorization-code flow.

---

## What goes in `.env`

Two values, both from Google. The other two have working defaults:

```dotenv
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx

# Must match your PORT and the URI registered on the OAuth client:
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Optional — leave unset and the callback answers with JSON, which is what
# makes the flow demonstrable with no frontend. Uncomment it to land on the
# demo page instead (and to stop a reload of the callback URL 400ing):
# GOOGLE_POST_LOGIN_REDIRECT=http://localhost:3000/demo/
```

Unset credentials mean the two routes answer **404**: this deployment does not
offer that sign-in method, which is the truth. Setting only one of the pair is
refused at boot — it would send people to a consent screen whose callback can
never complete the exchange.

---

## Getting them

Free. No billing account, no card, and **no Google review** — the scopes used
here (`openid`, `email`, `profile`) are the non-sensitive ones, which is what
makes this the cheapest of the remaining scope-map items to actually finish.

**1. A project.** At
[console.cloud.google.com](https://console.cloud.google.com), pick the project
dropdown at the top → **New Project**. Any name.

**2. The consent screen.** Left menu → **APIs & Services → OAuth consent
screen** (newer consoles call this **Google Auth Platform → Branding**).

- User type **External**.
- App name, a support email, a developer contact email. That is all that is
  required.
- Scopes: **add nothing**. `openid`, `email` and `profile` are granted by
  default and are not the kind that trigger a verification review.

**3. Test users — the step everyone misses.** While the app's publishing status
is **Testing**, only accounts listed as test users can sign in; everyone else
gets `access_denied` at the consent screen and it looks like a bug in the code.
Add your own Google account under **Audience → Test users**. Up to 100.

Alternatively press **Publish app**. With non-sensitive scopes only, that needs
no verification.

**4. The credentials.** **APIs & Services → Credentials → Create Credentials →
OAuth client ID**.

- Application type: **Web application**.
- Under **Authorized redirect URIs**, add the callback exactly:

  ```
  http://localhost:<PORT>/api/v1/auth/google/callback
  ```

  **`<PORT>` is whatever `PORT` says in your `.env`** — 3000 in
  `.env.example`, but check yours. It has to match in three places at once:
  the port the server listens on, `GOOGLE_CALLBACK_URL`, and the URI
  registered here. Two out of three is a `redirect_uri_mismatch`, or a browser
  sent back to a port with nothing on it.

  Google compares the **string**, not the resolved URL. A trailing slash, a
  different port, or the loopback IP written out instead of `localhost` all
  count as a different URI.

  Plain `http` is fine here: Google requires HTTPS for redirect URIs generally,
  but exempts loopback addresses — `localhost`, `127.0.0.1`, `[::1]` — for
  local development. A deployed instance needs an `https://` URI added
  alongside it, and `GOOGLE_CALLBACK_URL` set to match.

- **Authorized JavaScript origins** can be left empty. That field is for
  browser-side token flows; ours is server-side.

**5. Copy the two values** into `.env` and restart the server.

**No API needs enabling.** The identity claims arrive inside the ID token from
the OAuth endpoints themselves — nothing here calls a Google API, so there is
no library to enable and nothing to add to the project.

### Checking it worked

```
curl -i http://localhost:$PORT/api/v1/auth/google
```

- **302**, with a `Location` on `accounts.google.com` and an `oauthState`
  cookie set — configured correctly.
- **404** — the server has no credentials; check `.env` and that it restarted.

Then open `http://localhost:$PORT/demo/` **in a browser** and press **Sign in
with Google** (not curl — the flow is a navigation). After the consent screen
you land back with the session cookies set, and the page asks
`GET /customers/me` who they belong to.

`/api/v1/auth/google` works on its own too, and answers with JSON rather than a
page. That is the better thing to show when the subject is the API contract;
the page is the better thing to show when the subject is that sign-in works.

### Landing somewhere after sign-in

`GOOGLE_POST_LOGIN_REDIRECT` is what turns the JSON answer into a redirect. It
ships **commented out**, pointing at `/demo/`, for a reason worth keeping: with
it unset the callback describes itself, which is what the integration tests
assert against and what the OpenAPI document promises. Uncomment it when you
want the browser to land on something — the session is already in the cookies,
so nothing sensitive travels in the URL.

**Unset also decides where the browser is standing when it finishes.** With no
redirect the callback renders its own JSON, so the address bar keeps
`?code=…&state=…` — and pressing reload re-submits both. The `code` was spent
on the first exchange and the `state` cookie was cleared before the exchange
even ran, so the second attempt is a 400. That is the protection working:
neither value is meant to be usable twice, and a callback that could be
replayed is the bug. Setting the redirect moves the browser off that URL, which
is the only reason the reload is ever tried.

### When it goes wrong

| What you see                                | What it means                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                     | The registered URI is not character-for-character the callback.             |
| `access_denied`                             | The account is not a test user, and the app is still in Testing.            |
| 400 `could not be verified` on first try    | The `oauthState` cookie did not survive — usually a different host/port.    |
| 400 `could not be verified` **on a reload** | Expected. The callback URL is single-use; set `GOOGLE_POST_LOGIN_REDIRECT`. |
| 404 on `/auth/google`                       | No credentials configured on this deployment.                               |

---

## The flow

```
GET /api/v1/auth/google           →  302 to Google's consent screen
                                     (sets a short-lived `oauthState` cookie)

     ← Google returns the browser →

GET /api/v1/auth/google/callback  →  verify state, exchange code,
                                     sign in, set our own auth cookies
```

Both are `GET` because both are **browser navigations**, not calls a client
makes. Open `/auth/google` in a browser; do not fetch it.

The session at the end is an ordinary one of ours — the same access and refresh
cookies `/auth/login` sets, refreshable and revocable the same way. Google's
part is over once we know who the person is.

---

## The three decisions that matter

### 1. Match on the subject, never on the email

A returning user is found by Google's `sub` claim, stored as `User.googleId`.

Google lets people change their address. Matching on email would mean an
account silently follows whoever registers that address next — and it would
also create a duplicate account for anyone who changed theirs.

### 2. Link by email only when Google says it is verified

If nobody holds that `sub` but an account already has that email, the Google
identity is **linked** to it. The account keeps its password: it now has two
ways in, not one fewer.

That is safe for exactly one reason — the `email_verified` claim is checked
first. **Google will issue a token for an address the account has not proven it
owns.** Linking on one of those means: register a Google account claiming
somebody else's address, sign in, own their account. So an unverified email is
refused outright, before anything is linked or created.

### 3. `state`, and why it is compared in constant time

`/auth/google` mints a 256-bit nonce, sets it as an httpOnly cookie, and hands
the same value to Google. The callback requires them to match.

Without it, an attacker can send someone a callback URL carrying **their own**
authorization code — and the victim's browser quietly signs into the attacker's
account, where anything they then do is visible to the attacker. The cookie is
what they cannot forge.

It is cleared on the way through **whatever the outcome**, so a failed attempt
cannot be retried, and compared with `timingSafeEqual` after a length check.

`sameSite: "lax"`, deliberately not `strict`: Google's callback is a cross-site
top-level navigation, and a strict cookie would not be sent with it — the flow
would fail every single time.

---

## What is not kept

Only identity scopes are requested — `openid`, `email`, `profile`. No Gmail, no
Drive, and **no offline access**: a refresh token from Google would let us act
on someone's account long after they signed in, and we have no reason to.

Everything the exchange returns beyond the identity is dropped. Credentials for
an API we never call would be a stored liability with no use.

`verifyIdToken` checks the token's signature against Google's published keys and
validates `aud`, `iss` and `exp`. Skipping the signature is technically
permissible for a token that came straight from the token endpoint over TLS —
but that exemption stops holding the moment anyone reuses the helper for a token
supplied by a client, which is the obvious next step for a mobile app.
Verifying always makes that change safe by default.

---

## Two columns became nullable

Google supplies neither a password nor a phone number, and inventing them would
put fabricated data where it matters.

| Column           | Why nullable                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `User.password`  | An unusable random hash would have the data model claim a password exists. |
| `Customer.phone` | A made-up number ends up on a delivery record.                             |

`comparePassword` treats a null hash as **no** — handled in that one function so
no call site can forget, and so a sign-in attempt on a Google-only account
answers "wrong credentials" rather than crashing. A 500 that happened only for
those accounts would tell an attacker which addresses use Google.

**Password registration still requires a phone.** Nothing about it changed. A
Google customer adds one through `PATCH /customers/me`, and PostgreSQL treats
NULLs as distinct in a unique index, so any number of customers may have none
while no two can share one.

---

## Testing

- **Unit** (`tests/auth/google.login.unit.test.ts`) — the three matching cases,
  the unverified-email refusal, and that a disabled account is refused before
  anything is written.
- **Unit** (`tests/auth/google.client.unit.test.ts`) — the exchange itself: the
  audience check, the claim mapping, and that none of Google's tokens survive.
- **Integration** (`tests/integration/http.auth.google.integration.test.ts`) —
  the redirect, the state round-trip, the session cookies, linking to an
  existing account, and that a Google-only account cannot be logged into with
  a password. Google is stubbed at the client boundary; these tests never leave
  the machine.

Mutation-tested with ten mutations, each of which leaves a **working sign-in**
and only changes who else gets in. Two survived the first run and both were
real gaps:

- _"the state comparison always returns true"_ survived because every state in
  the suite differed in **length** from the cookie, and the length check alone
  rejects those — the value comparison was never reached.
- _"drop the ID token's audience check"_ survived because `exchangeCode` was
  stubbed everywhere, so the client module had no coverage at all. Without the
  audience, a token minted for **any** other application on Google verifies.

Both are covered now, and all ten are caught, with a no-op control surviving.
