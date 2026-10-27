# CV Lab

Interactive computer-vision demonstrations that run entirely in the browser. The site has no backend, build step, or external runtime dependencies. The page lets students explore image manipulation techniques discussed in the lectures.

## Lecture 12 · Tracking labs

- **Live MOSSE vs. NCC tracker** — draw a box on the webcam; a fixed NCC template and a MOSSE filter run side by side with live response maps and PSR. The camera needs HTTPS or `localhost` (GitHub Pages is fine); video never leaves the browser. A *Simulated scene* source replays the three classroom experiments (head turn, hand occlusion, walk past) when no camera is available.
- **Data association exercise** — drag track IDs onto detections in the next frame and compare with greedy and minimum-cost (Hungarian) assignment.

Code lives in `js/tracking/`. Checks:

- `node --test tests/*.test.mjs` — FFT, trackers and association logic.
- Serve the repository root (`python3 -m http.server`) and open `/tests/scene-check.html` — replays every simulated scene and checks that the default settings still produce the outcomes the lecture describes. Re-run it after changing `synthetic-scene.js` or the tracker parameters.

## Bundled images

The thumbnail picker reads `images/manifest.json`. To add or remove an image, place it in `images/` and update the JSON array.
