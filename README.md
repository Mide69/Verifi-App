# Larder — never let food expire again

**Larder** helps people track the expiry dates of their food and groceries. Scan a
barcode, confirm the name, set the expiry date, and Larder reminds you before it
goes off — with a notification and a sound. Built for everyone, with special care
for older people and those who rely on a carer or family member.

> One codebase, three platforms: **iOS, Android, and Web** (Expo + React Native Web).

## Why it matters (UK)

- UK households throw away around **£700 of edible food every year** (WRAP). Larder
  nudges you to use food before it spoils — saving money and cutting waste.
- **Care angle:** a shared store lets a family member or carer watch over someone's
  kitchen and get the same expiry alerts — ideal for elderly or vulnerable people
  living independently. That carer/provider tier is the commercial differentiator.

## How the scan flow really works

A barcode identifies *what* a product is — it does **not** contain the expiry date
(that's printed per-batch on the packaging). So Larder does two things:

1. **Scan the barcode** → look up the product name/brand/image from
   [Open Food Facts](https://world.openfoodfacts.org) (free, open, great UK coverage).
2. **Capture the expiry** → quick-pick (3 days / 1 week / 1 month…) or type the date.
   _Planned: point the camera at the printed date and OCR reads it automatically —
   minimal typing for older users._

## Features (MVP — built)

- 📷 Barcode scanning (camera) with manual fallback
- 🔎 Automatic product lookup (Open Food Facts)
- 📅 Expiry capture with quick-pick chips + Use-by / Best-before
- 🗂️ Larder list, colour-coded by urgency (red expired · orange within alert window · amber this week · green fine)
- ⏰ Local reminder N days before expiry (default 3) with sound
- ⚙️ Customisable default reminder lead time, sound, and time of day
- ✓ Mark as used / delete
- 💾 Works fully offline (on-device storage)

## Roadmap (Phase 2 — the sellable bit)

- 👪 **Shared stores** — invite family/carers, roles: Owner / Manager / Viewer
- 🔔 **Carer alerts** — the carer gets the expiry reminder too, and can add/edit/delete
- ☁️ **Cloud sync** (Supabase) — realtime shared larders + push notifications
- 🏥 **Care-provider dashboard** — manage many clients' kitchens (B2B2C subscription)
- 🔤 **OCR expiry capture** from the printed date
- 🛒 Shopping list from used/expired items · recipe suggestions to use up soon-to-expire food

## Tech

| Layer | Choice |
|---|---|
| App | Expo (React Native + React Native Web) — iOS, Android, Web |
| Language | TypeScript |
| Storage (now) | On-device AsyncStorage behind a swappable `FoodRepository` |
| Storage (phase 2) | Supabase (Postgres + auth + realtime + push) — same interface |
| Product data | Open Food Facts API |
| Notifications | expo-notifications (scheduled local alerts) |

## Run it

```bash
npm install
npm run web      # open in a browser
npm run android  # Android device/emulator (Expo Go or dev build)
npm run ios      # iOS simulator (macOS)
```

> Camera barcode scanning and push notifications need a real device/emulator.
> On web, use the manual barcode field and quick-pick expiry — the full loop still works.

## Project structure

```
App.tsx                  # root: navigation + data wiring + notification scheduling
src/
  types.ts               # FoodItem, Settings
  theme.ts               # accessible colours / spacing / type
  utils/date.ts          # expiry maths + urgency + friendly labels
  storage/repository.ts  # FoodRepository interface + AsyncStorage impl (swap → Supabase)
  services/
    productLookup.ts      # Open Food Facts barcode lookup
    notifications.ts      # schedule / cancel local expiry reminders
  components/             # Button, ItemCard
  screens/               # Home, AddItem, ItemDetail, Settings
```
