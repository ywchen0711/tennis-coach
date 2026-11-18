# Credits

## MediaPipe Tasks Vision (pose tracking)

- Library: `@mediapipe/tasks-vision` **0.10.35** (`vendor/mediapipe/vision_bundle.js` and the
  `vendor/mediapipe/wasm/vision_wasm_internal.*` / `vision_wasm_nosimd_internal.*` files),
  copied unmodified from the npm package (only the source-map comment line was removed).
- Models: `models/pose_landmarker_lite.task`, `pose_landmarker_full.task`, `pose_landmarker_heavy.task`
  (float16, from `storage.googleapis.com/mediapipe-models/pose_landmarker/...`).
- Copyright Google LLC. Licensed under the **Apache License 2.0**:
  https://www.apache.org/licenses/LICENSE-2.0
- Project: https://github.com/google-ai-edge/mediapipe
- Model card (BlazePose GHUM 3D): https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf

## Racket detector

- `models/efficientdet_lite0.tflite`, `models/efficientdet_lite2.tflite` (float16, MediaPipe Object Detector,
  COCO classes, used only for the "tennis racket" class), from `storage.googleapis.com/mediapipe-models/object_detector/...`.
- Copyright Google LLC / TensorFlow authors. Licensed under the **Apache License 2.0**.

## Everything else

All application code, coaching text (Chinese and English), icons and design are original to this project.
The coaching ranges are general heuristics from common tennis teaching practice, written in our own words.

## Test material (not included in the repository)

The app was tested locally with these Wikimedia Commons clips, which are **not** part of this repository:

- "0DRIVE.ogv", "0REVES 1 MANO.ogv", "0REVES 2 MANOS.ogv", "0SAQUE.ogv", "0VOLEA.ogv", "Smash con pelota.ogv"
  by User:Dardo_86_7, CC BY-SA 3.0 - https://commons.wikimedia.org/wiki/Category:Videos_of_tennis
