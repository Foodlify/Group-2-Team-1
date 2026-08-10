# Social Media Authentication (Google)

> The official `Social Media Authentication`, over the OAuth 2.0
> authorization-code flow.

---

## Setting it up

Free, and no card: create an **OAuth 2.0 Client ID** of type _Web application_
at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials),
then put the id and secret in `.env`.

Register the callback as an **Authorized redirect URI** on that client, exactly
as written — Google compares the string, not the resolved URL:

```
http://localhost:3000/api/v1/auth/google/callback
```

Unset credentials mean the two routes answer **404**: this deployment does not
offer that sign-in method, which is the truth. Setting only one of the pair is
refused at boot — it would send people to a consent screen whose callback can
never complete the exchange.

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
