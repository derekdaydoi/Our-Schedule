# Our Schedule

A private-use, mobile-first weekly planner for two people. Both users sign in with Google, pair once with an invite code, then Firestore keeps their calendars synchronized in realtime.

## What is already built

- Google sign-in with Firebase Authentication
- Pairing for exactly two people using a 10-character invite code
- Realtime Firestore synchronization across both devices
- Weekly navigation and responsive mobile day view
- Personal events and shared events
- Shared-event proposal → partner confirmation flow
- Ownership rules: personal events are editable by their owner; shared events by either partner
- Find common free time (90+ minute slots)
- Copy your previous week's events into the current week
- PWA manifest + service worker for Add to Home Screen
- Firebase Hosting configuration
- Firestore Security Rules
- GitHub Actions build check

## 1. Create the Firebase project

In Firebase Console:

1. Create a project, e.g. `our-schedule`.
2. **Authentication → Sign-in method → Google → Enable**.
3. **Firestore Database → Create database**. Choose a region near the two users. Do not leave production data on open/test rules; this repo includes the intended rules.
4. **Project settings → Your apps → Web app → Register app**.
5. Copy the Firebase Web SDK config values.

The Firebase Web API key is a client identifier, not a server secret. Actual data access is enforced by Authentication + `firestore.rules`. Never commit service-account JSON/private keys.

## 2. Configure local environment

```bash
cp .env.example .env
```

Fill:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Run locally

Requires Node 20.19+ (Node 22 recommended).

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## 4. Deploy Firestore rules and Hosting

Install the Firebase CLI once:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

Select the Firebase project you created, then:

```bash
npm run build
firebase deploy
```

Firebase deploys:

- `firestore.rules`
- `firestore.indexes.json`
- `dist/` to Firebase Hosting

For convenience you can also run:

```bash
npm run firebase:deploy
```

## 5. First use

1. Person A opens the deployed URL and signs in with Google.
2. Choose **Tạo lịch đôi mới**.
3. Copy the generated pairing code shown in the right-side card.
4. Person B opens the same URL, signs in with Google, chooses **Ghép vào lịch**, and enters the code.
5. Both devices now subscribe to the same Firestore event collection. Changes appear realtime without refresh.

## 6. Add to Home Screen

### iPhone / iPad

Open the Firebase Hosting URL in Safari → Share → **Add to Home Screen**.

### Android

Open the URL in Chrome → menu → **Add to Home screen / Install app**.

## Data model

```text
users/{uid}
  coupleId
  profile

couples/{pairCode}
  createdBy
  members.{uid}

couples/{pairCode}/events/{eventId}
  title
  notes
  category
  startAt
  endAt
  ownerType: personal | both
  ownerUid
  createdBy
  status: proposed | confirmed
```

Pair codes are high-entropy document IDs. Security rules allow authenticated direct `get` for a supplied code but deny listing the `couples` collection, preventing enumeration through normal Firestore queries.

## Security model

- A user can only read/write their own `users/{uid}` record.
- Couple documents cannot be listed.
- Event data is readable only by members of that couple.
- A personal event is editable/deletable only by its owner.
- A shared event is editable by either member.
- A non-member can only join a couple that currently has one member, and the update may only add that user to `members`.

## Repository hygiene

`.env` is ignored. Do **not** commit service-account credentials, private keys, or Firebase Admin SDK JSON files.

For personal use, consider making this GitHub repository **Private** as well; the app code itself contains no calendar data.
