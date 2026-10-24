# Knee Angle

A separate, simplified camera page inspired by [Vivek's Knee Recovery](https://viviscool.github.io/knee_recovery/). It displays a full-body MediaPipe skeleton and a live knee-bend angle. It is independent of the existing Knee Recovery website and has no exercise programmes, patient accounts or recovery scores.

## Use

1. Open the HTTPS GitHub Pages link in Safari on iPhone, or Safari/Chrome on Mac.
2. Select the anatomical left or right knee. Choose front/built-in or back camera before starting.
3. Place the device securely, side-on to the selected knee, with one person's whole body in frame. Start the camera and allow access.
4. The orange hip-knee-ankle line shows the measured leg. The other landmarks form the full-body skeleton. The live knee bend updates as you move.
5. Optionally select **Save a reading** for a short average. There is no stillness test. Hold the position comfortably; minor movement is accepted. Select **Stop camera** to release the camera.

The front preview is mirrored. Anatomical left and right do not change when the image is mirrored. Stop the camera before changing front/back selection. Backgrounding the page stops the camera, so return and start it again.

## Measurement

- Google MediaPipe Tasks Vision **1.1.1**, pinned and bundled, with Pose Landmarker **Full float16 revision 1**. GPU delegate with a CPU fallback.
- Uses hip, knee and ankle image coordinates converted to pixels before calculating the included angle. This avoids distortions from non-square camera frames.
- Knee bend = 180° minus the included hip-knee-ankle angle. **0° = straight, 90° = a right-angle bend.** This unsigned 2D angle cannot distinguish hyperextension, assess clinical extension lag, or replace goniometry.
- Minimum visibility/presence 0.5 for the measured joints. Uncertain, out-of-frame or collapsed segments produce no angle. The skeleton uses 0.35 for display only; its visibility is not proof that a measurement is reliable.
- Live values use a 700 ms trimmed mean and refresh at most once every 250 ms. The average resets immediately on invalid joints, side changes, camera dimensions changing or a tracking gap. A frozen camera clears the skeleton and angle after 700 ms without a fresh processed frame, checked every 250 ms.
- Skeleton coordinates use a time-aware exponential average with a 160 ms time constant. Current confidence is never averaged: hidden or uncertain joints disappear immediately. Missing poses, tracking gaps over 400 ms, side changes and camera resets discard previous positions. This drawing filter does not change the raw angles used for measurements or saved readings.
- A saved reading gathers about two seconds, with at most four seconds allowed for intermittent tracking. At least five usable frames spanning 600 ms are required. The mean trims 15% from each end when there are enough samples. The displayed range is the raw observed range, not a validated maximum ROM or an error bound.
- Model inference is capped at roughly 15 frames per second to limit device load. Actual speed depends on hardware. The video remains live while inference runs.

**Prototype only.** Camera measurements have not been clinically validated. Performance depends on perspective, clothing, visibility, device and model limitations. Saving an average reduces jitter; it does not establish accuracy. The app makes no clinical or scoring claims.

## Privacy

No recordings, microphone access, analytics, accounts, uploads, localStorage or external API calls. The application processes camera frames locally. Saved numeric readings remain in memory until reload. GitHub serves the static page and model assets and receives normal web requests, but the app does not transmit camera frames or readings.

## Development and checks

No build step or npm installation is needed. Serve the repository root:

```sh
python3 -m http.server 8779 --bind 127.0.0.1
node --experimental-vm-modules --test tests/*.test.mjs
```

Open `http://127.0.0.1:8779/`. Localhost or HTTPS is required for camera access. Opening `index.html` as a file is not supported.

- `tests/measurement.test.mjs`: geometry, aspect ratio, mirroring, anatomical side, missing/invalid joints, jitter averaging, gaps and reading coverage.
- `tests/lifecycle.test.mjs`: permission errors, cancelled starts, late resources, timeouts, stale angles, background cleanup and side changes, using simulated camera/model inputs.
- `tests/model-load.html`: actual bundled GPU model loading and inference on an empty image, with no camera access.
- `tests/responsive.html`: 390 × 844 CSS pixel layout inspection.

Software and synthetic tests do not validate clinical measurement or physical iPhone camera performance. Real device testing with side-on leg movement and a reference goniometer remains necessary before relying on results.

## GitHub Pages

Publish this repository separately as `knee-angle-simple`. In **Settings → Pages**, choose **Deploy from a branch**, **main**, **/(root)**. `.nojekyll` preserves the bundled runtime assets.

## References and attribution

- [Google: Pose Landmarker overview](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
- [Google: web implementation, landmark outputs and options](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Vivek's Knee Recovery reference](https://viviscool.github.io/knee_recovery/). Independently implemented; no source copied from that website.
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled runtime and model provenance.
