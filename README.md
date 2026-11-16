# Ludo Mood 🎲

A 3D Ludo game for phones. The tokens blink, panic when an enemy is close, cry when knocked out and wear a crown when they get home. It installs as an app (PWA) and works offline.

**Play:** https://denzeldenys.github.io/Ludo/

## Features
- 3D board (Three.js) with lighting, shadows, glossy tiles and a pyramid centre
- Physics dice (cannon-es): tap to throw, or flick upwards to throw it your way; the face that lands on top counts
- 2–4 players: any mix of people (pass-and-play) and bots
- Tokens with moods drawn on their faces: sleepy, happy, excited, scared, sad, angry, proud, knocked out
- Knock-outs: slam, slow motion, camera shake, red flash, debris and a brutal sound hit
- Synthesised sound effects with reverb, plus background music (both can be switched off)
- Saves automatically, works offline, installable on Android and iPhone

## Install on your phone
- **Android (Chrome):** open the link, tap **📲 Install app** on the menu (or ⋮ → *Add to Home screen*).
- **iPhone (Safari):** open the link, tap Share → *Add to Home Screen*.

## Files
- `index.html`, `style.css`: page and HUD
- `js/rules.js`: board geometry and Ludo rules
- `js/scene3d.js`: 3D board, tokens, faces, dice physics, camera
- `js/audio.js`: sound effects and music (WebAudio, no audio files)
- `js/main.js`: game flow, bots, menu
- `vendor/`: Three.js and cannon-es, copied in so the game works offline
- `sw.js`, `manifest.json`: offline support and app install

No build step: GitHub Pages serves these files as they are. Add `?speed=20` to the URL for a fast test mode.
