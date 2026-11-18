# 揮拍教練 Swing Coach

**Live:** https://ywchen0711.github.io/tennis-coach/

Upload a tennis video you shot on your phone, from any angle. Swing Coach tracks your body,
finds each swing, splits it into phases and gives you a short list of things to work on, each with
a cue and a drill, in Traditional Chinese or English.

上傳用手機拍的網球影片（任何角度都可以），App 會追蹤身體動作、找出每一次揮拍、分出各個階段，
並列出最該優先改善的 2–3 個重點，每個都附上提示語和練習方法（繁體中文／英文）。

## Privacy / 隱私

Everything runs in your browser. **The video never leaves your device**: there is no server, no
upload and no account. The pose model is downloaded once from this site and then runs locally.
Past analyses are kept in your browser (IndexedDB) as numbers only, never the video, and can be
deleted at any time from the History screen.

影片只在你的裝置上分析，不會上傳。歷史紀錄只存數據、不存影片，可隨時刪除。

## What it does

1. **Pick or record a video**: on iPhone/iPad the picker offers the camera or Photos; on desktop you
   can drag a file in. MP4 and iPhone MOV (H.264 or HEVC where the browser can decode it), portrait
   or landscape, 30-240 fps. The frame rate is read from the file header.
2. **Trim**: a motion scan suggests the part with the swings (long clips are capped at 30 s).
3. **Pose tracking**: MediaPipe PoseLandmarker (lite / full / heavy = Fast / Standard / Precise) in
   VIDEO mode, frame by frame by seeking the video, at reduced resolution. Only landmarks are kept.
4. **Analysis**: One-Euro smoothing (zero-phase), gap filling, left/right label repair, player
   selection (largest and most central, tap to choose another), handedness detection, swing
   detection from wrist-speed peaks, phases (ready, unit turn/backswing or toss/trophy, forward swing,
   contact, follow-through, recovery) and stroke classification (forehand, one-/two-handed backhand,
   volley, serve, overhead) that you can correct.
5. **Metrics** (per swing): unit turn, hip-shoulder separation, non-hitting arm, knee bend, leg drive,
   base width, contact in front, contact height, elbow angle and arm extension at contact, wrist
   speed (body heights/s, relative), kinetic-chain order (hips → shoulders → elbow → wrist), head
   stability, trunk lean, follow-through finish, recovery footwork; for serves: trophy elbow angle and
   height, toss-arm reach, knee bend, leg drive, contact reach, extension.
6. **Coaching**: the top issues ranked by impact × confidence, each with what we saw (number + a
   button to jump to that frame), why it matters, one cue and one drill; what you did well; rough
   per-area ratings; consistency across swings of the same type.
7. **Review**: skeleton overlay with a wrist trail, phase timeline, frame stepping, ¼× and ½×
   playback, jump to contact, key frames, speed and joint-angle charts, side-by-side skeleton replay
   of two swings, and a summary PNG to save or share.

## Any camera angle

The model's 3D world landmarks are used for every angle and rotation, measured in a body frame built
from the hips and shoulders, so joint angles and turns do not depend on where the phone stood.
The camera view (front / front-diagonal / side / back-diagonal / back) is estimated from the body's
facing direction and shown. Each metric gets a confidence from landmark visibility, how much of the
measurement lies along the camera's depth axis (depth is estimated, so it is the least precise),
filled-in frames and frame rate (for timing). Numbers below the confidence threshold are marked
"less reliable from this angle" and are never used for advice.

## How to film / 怎麼拍

- Whole body in frame, head to feet, with a little margin. 全身入鏡。
- Keep the phone still (tripod, bottle, fence). 手機固定不晃。
- Side-on is best, but any angle works. 側面最好，但任何角度都可以。
- Good light, one main player; 60 fps or slow-motion helps. 光線充足、一位主角；60 fps 或慢動作更好。

## Limits

- The ranges are coaching heuristics, not lab norms; playing styles differ.
- No racket or ball tracking: contact is estimated from the wrist-speed peak (or highest reach on
  serves), so "contact" is approximate.
- Depth from a single camera is an estimate; front and back views make front/back distances rough.
- At 30 fps the kinetic-chain order is coarse (its confidence is lowered); 60 fps or slow-motion is better.
- Slow-motion clips exported at 30 fps cannot be detected from the file; the app guesses when the
  motion is obviously slow and lets you choose ×4 / ×8.
- HEVC (iPhone "High Efficiency") plays in Safari but not in every desktop browser.
- Two-handed strokes move both wrists together, so a clip of only two-handers cannot tell a left-hander's
  backhand from a right-hander's forehand; the app flags this and you can switch the hand.
- Serve and overhead look alike from pose alone; overheads are labelled serve unless you relabel them.
- Racket analysis (optional, on by default, about 30-40% more processing time) uses a general object
  detector (EfficientDet, COCO "tennis racket") plus simple geometry: the head is placed 3/4 of the way
  from the hand to the far corner of the racket box, and the face angle comes from the shape of the head's
  edges. It is only trustworthy with a side view, a sharp picture (60 fps or more, good light) and a
  racket that is large in the frame; otherwise values are marked unreliable and never used for advice.
- Busy backgrounds or several players can confuse tracking; tap the right player if needed.

## Tech

Plain HTML/CSS/ES modules, no build step, hosted on GitHub Pages. MediaPipe wasm and models are
self-hosted in `vendor/` and `models/` (see [CREDITS.md](CREDITS.md)).

```
index.html         page
css/app.css        styles (light/dark, phone portrait/landscape, safe areas)
js/app.js          UI
js/pose.js         MediaPipe runner, seeking, motion scan, key frames
js/analysis.js     tracking clean-up, view estimate, swing detection, metrics, confidence
js/coach.js        bilingual coaching library
js/i18n.js         UI strings
js/charts.js       canvas charts and skeleton drawing
js/summary.js      summary image
js/store.js        IndexedDB history
js/mp4.js          frame-rate reader for MP4/MOV
```

## Updating

All module imports, the stylesheet and the entry script carry a `?v=N` query so iPhone Safari picks up
new code immediately. When changing any file, bump `N` everywhere (`index.html` and every `from './x.js?v=N'`).
