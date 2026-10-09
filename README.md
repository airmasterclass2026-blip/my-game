# Tiny Explorers 3D 🐥

A gentle 3D learning game for toddlers (around age 3). A friendly chick guides your child through three short activities. Each one has spoken prompts, bright 3D objects and lots of praise. **It works online and fully offline.**

## Activities and learning goals

| Activity | What the child does | Learning goals |
|---|---|---|
| 🎈 **Colors** | "Pop the red balloon!": tap the matching balloon | Recognising and naming 7 colors (it starts with red, blue, yellow and green) |
| ⭐ **Shapes** | "Find the star!": tap the matching chunky 3D shape | Circle, square and triangle first, then star and heart |
| 🍎 **Count** | Tap each apple on the tree. It flies into the basket while the count is spoken aloud | Counting 1–6, one-to-one correspondence, linking the numeral to the quantity (the counter shows "3 🍎🍎🍎") |

### Toddler-friendly design
- **No failing, no timers, no game over.** A wrong tap makes the object wiggle and names it gently ("That's blue. Can you find red?").
- **Errorless learning:** after two wrong taps, or if the child goes quiet for a while, the right answer glows and pulses.
- **Adaptive difficulty:** rounds start with 2 choices, then go up to 3 and later 4. New colors, shapes and bigger numbers are added as the child succeeds.
- **Spoken prompts** for pre-readers. Tap the prompt bubble to hear it again.
- **Rewards:** every success gives a ⭐ that flies to the star counter. Every 5 stars there is a confetti party and the chick does a dance.
- Tapping empty space makes sparkles, and tapping the chick makes it hop and peep, so every tap does something.
- Big touch targets, no ads, no links and no in-app purchases. The star count is kept on the device.

## How to play

### Online
Host the folder on any static web host. For GitHub Pages: open the repo's **Settings → Pages**, choose this branch with the `/ (root)` folder, then open the URL it gives you.

### Offline
- **As an app:** open the hosted page once, then use "Add to Home Screen" (iOS/Android) or "Install" (Chrome/Edge). A service worker caches everything, so it then works without internet.
- **From files:** download the repo (Code → Download ZIP), unzip it and double-click `index.html`. No server or internet is needed because Three.js is bundled in `vendor/`.

To try it locally with a server: `python3 -m http.server` and then open http://localhost:8000.

> The voice uses the device's built-in text-to-speech. Most phones, tablets and computers include offline voices. If none is available, the game still works with sounds and on-screen pictures.


## 🏀 Ball House (balls.html)

A 3D indoor play centre with a **ball pit full of bouncing balls**, a **slide**, a **trampoline** and a giant **bouncy hopper ball**. Two original cartoon friends host it: **Momo** the mouse and **Bolt** the yellow buddy.

| Level | Host | What the child does | Learning goals |
|---|---|---|---|
| 1 | 🐭 Momo | "Momo wants red balls!": tap the balls of that color and they fly into Momo's bucket, counted out loud | Color recognition, counting 1–5 |
| 2 | 💛 Bolt | "Give Bolt three balls!", then "Make Bolt jump four times!" on the trampoline, then "Find the BIG ball!" | Counting a set, counting actions, big vs little |

Each level has 3 rounds. Finishing one moves on to the other, and the game gets slowly harder as the child succeeds.

**Ways to play anytime:**
- Tap a ball and it jumps.
- Tap the pit floor for a boom that bounces the balls nearby.
- Drag a finger through the pit to stir the balls.
- Tap the slide to send balls whooshing down it.
- Tap the trampoline to make the friend on it bounce and spin.
- Tap the hopper ball or a character to make them bounce or giggle.

After every round, the character goes down the slide and splashes into the balls.

## Files
- `index.html`, `style.css`: page and on-screen buttons
- `game.js`: Tiny Explorers activities (colors, shapes, counting)
- `balls.html`, `balls.css`, `balls.js`: Ball House game
- `vendor/three.min.js`: Three.js r158 (MIT license)
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and installable app support

If you change any file, bump `VERSION` in `sw.js` so installed copies update.
