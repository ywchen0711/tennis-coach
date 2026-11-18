// UI strings, zh-TW (default) and English.
const S = {
  appName: ['揮拍教練', 'Swing Coach'],
  tagline: ['用手機拍下你的網球揮拍，從任何角度都能分析動作並給你具體的改善建議。', 'Film your tennis swing on your phone - from any angle - and get a breakdown of your technique with concrete fixes.'],
  privacy: ['影片只在你的裝置上分析，不會上傳到任何地方。', 'Your video is analysed on this device and never uploaded anywhere.'],
  pick: ['選擇或拍攝影片', 'Choose or record a video'],
  pickSub: ['iPhone 可直接開相機拍攝，或從相簿選擇', 'On iPhone you can open the camera or pick from Photos'],
  dropHint: ['或把影片拖曳到這裡', 'or drop a video file here'],
  tipsTitle: ['怎麼拍最準', 'How to film for best results'],
  tip1: ['全身入鏡：頭到腳都要在畫面內，留一點邊。', 'Whole body in frame, head to feet, with a little margin.'],
  tip2: ['手機固定：放在腳架、水壺或圍網上，不要手持晃動。', 'Keep the phone still: tripod, bottle or fence - not hand-held.'],
  tip3: ['側面最好，任何角度都可以：斜前方、正面、背面也能分析，App 會標出哪些數據比較不準。', 'Side-on is best, but any angle works - the app tells you which numbers are less reliable from your angle.'],
  tip4: ['光線充足、一次一位主角；60 fps 或慢動作更好。', 'Good light, one main player; 60 fps or slow-motion is even better.'],
  stepsTitle: ['三步驟', 'Three steps'],
  step1: ['選影片', 'Pick a video'], step2: ['選出揮拍片段', 'Trim to the swings'], step3: ['看分析與建議', 'Read the coaching'],
  history: ['紀錄', 'History'], theme: ['主題', 'Theme'], lang: ['EN', '中文'],
  back: ['返回', 'Back'],
  prepareTitle: ['選擇要分析的片段', 'Choose the part to analyse'],
  trimHint: ['拖動兩端選出有揮拍的部分；綠色曲線是動作量，已自動幫你選好。', 'Drag the ends to cover the swings. The curve shows motion; a range is pre-selected for you.'],
  scanning: ['正在掃描影片動作…', 'Scanning the clip for motion…'],
  useSuggested: ['用建議範圍', 'Use suggestion'], useAll: ['整段', 'Whole clip'],
  quality: ['分析精度', 'Accuracy'], qFast: ['快速', 'Fast'], qBalanced: ['標準', 'Standard'], qPrecise: ['精準', 'Precise'],
  qNote: ['快速：輕量模型、每秒 30 張；標準：完整模型、每秒最多 60 張；精準：最大的模型，較慢。', 'Fast: lite model, 30 samples/s. Standard: full model, up to 60/s. Precise: largest model, slowest.'],
  hand: ['持拍手', 'Hitting hand'], handAuto: ['自動', 'Auto'], handR: ['右手', 'Right'], handL: ['左手', 'Left'],
  slowmo: ['影片速度', 'Clip speed'], smAuto: ['自動', 'Auto'], sm1: ['一般', 'Normal'], sm4: ['慢動作 ×4', 'Slow-mo ×4'], sm8: ['慢動作 ×8', 'Slow-mo ×8'],
  start: ['開始分析', 'Analyse'],
  estimate: ['約 {n} 張畫面，預估 {t}', 'About {n} frames, roughly {t}'],
  longWarn: ['片段較長，分析會花比較久；可以縮短範圍。', 'That is a long range - trimming it will be faster.'],
  processing: ['分析中', 'Analysing'],
  loadingModel: ['載入姿勢模型…（第一次需要下載約 10–30 MB）', 'Loading the pose model… (first time downloads about 10-30 MB)'],
  frames: ['{a}/{b} 張畫面', '{a}/{b} frames'],
  eta: ['剩餘約 {t}', 'About {t} left'],
  cancel: ['取消', 'Cancel'],
  cancelled: ['已取消', 'Cancelled'],
  sec: ['{n} 秒', '{n} s'], min: ['{m} 分 {s} 秒', '{m} min {s} s'],
  noPose: ['找不到人物。請確認全身都在畫面內、光線足夠。', 'No player found. Make sure the whole body is in frame and the light is good.'],
  noSwing: ['沒有偵測到揮拍。試著把範圍拉長，或確認拍到的是揮拍動作。', 'No swings detected. Try a longer range, or check that the clip shows swings.'],
  decodeErr: ['這個瀏覽器無法播放這支影片（可能是 HEVC 格式）。請改用 Safari，或在 iPhone 設定 > 相機 > 格式 選「最相容」。', 'This browser cannot decode the video (it may be HEVC). Try Safari, or set iPhone Settings > Camera > Formats > Most Compatible.'],
  modelErr: ['姿勢模型載入失敗，請檢查網路後再試。', 'Could not load the pose model. Check your connection and try again.'],
  results: ['分析結果', 'Results'],
  overall: ['整體', 'Overall'],
  swingN: ['第 {n} 拍', 'Swing {n}'],
  swingsFound: ['找到 {n} 次揮拍', '{n} swings found'],
  view: ['拍攝角度', 'Camera angle'], viewConf: ['（估計）', '(estimated)'],
  handUnsure: ['持拍手無法確定（雙手擊球時兩手一起動），請確認', 'Hitting hand is uncertain (both hands move together on two-handers) - please check'],
  handIs: ['{h}持拍', '{h}-handed'], handSwitch: ['切換持拍手', 'Switch hand'],
  pickPlayer: ['點選球員', 'Pick player'], pickPlayerHint: ['點一下影片中要分析的球員', 'Tap the player you want analysed'],
  playerChanged: ['已改為分析這位球員', 'Now analysing this player'],
  slowHint: ['動作看起來很慢，這是慢動作影片嗎？', 'The motion looks very slow - is this a slow-motion clip?'],
  slowIs: ['已當作慢動作 ×{n} 計算', 'Treated as slow-motion ×{n}'],
  areas: ['各面向評估', 'By area'],
  areasNote: ['依可信度加權的大致評估，不是精確分數。', 'Rough, confidence-weighted ratings - not precise scores.'],
  topIssues: ['優先改善', 'Work on these first'],
  wellDone: ['做得好的地方', 'What you did well'],
  noIssues: ['這一拍在可信的數據裡沒有明顯問題，繼續保持！', 'Nothing stands out among the reliable numbers for this swing - keep it up!'],
  saw: ['觀察', 'What we saw'], why: ['為什麼重要', 'Why it matters'], cue: ['提示語', 'Cue'], drill: ['練習', 'Drill'],
  seeFrame: ['看這一刻', 'Show me'],
  ideal: ['建議範圍 {r}', 'Typical good range {r}'],
  inSwings: ['出現在第 {s} 拍', 'Seen in swing {s}'],
  keyframes: ['關鍵畫面', 'Key frames'],
  kfBack: ['引拍', 'Backswing'], kfTrophy: ['獎盃姿勢', 'Trophy'], kfContact: ['擊球', 'Contact'], kfFinish: ['收拍', 'Finish'],
  strokeType: ['擊球類型', 'Stroke'], strokeFix: ['類型不對？點選更正', 'Wrong type? Tap to correct'],
  tabCoach: ['指導', 'Coaching'], tabMetrics: ['數據', 'Metrics'], tabCharts: ['圖表', 'Charts'], tabCompare: ['比較', 'Compare'],
  metric: ['項目', 'Metric'], value: ['數值', 'Value'], range: ['建議', 'Good range'], confidence: ['可信度', 'Confidence'],
  unreliable: ['這個角度不太可靠', 'Less reliable from this angle'],
  lowConfNote: ['可信度低的數據不會拿來給建議。', 'Low-confidence numbers are never used for advice.'],
  heuristicNote: ['這些範圍來自一般教學經驗，是參考值，不是標準答案；每個人的打法不同。', 'Ranges come from common coaching practice - guides, not rules. Styles differ.'],
  speedRel: ['本段最快的 {p}%', '{p}% of your fastest here'],
  chainTimes: ['相對擊球：髖 {a}、肩 {b}、肘 {c} 毫秒', 'Peaks before contact: hips {a}, shoulders {b}, elbow {c} ms'],
  chartSpeed: ['持拍手腕速度（身高/秒）', 'Hitting-wrist speed (body heights/s)'],
  chartAngles: ['關節角度（這一拍）', 'Joint angles (this swing)'],
  chartAnglesAll: ['選一拍來看關節角度', 'Pick a swing to see joint angles'],
  elbow: ['手肘', 'Elbow'], knee: ['膝蓋', 'Knee'], trunk: ['上身傾斜', 'Trunk lean'], shoulderTurn: ['轉肩', 'Shoulder turn'],
  compareA: ['A', 'A'], compareB: ['B', 'B'],
  compareNote: ['兩拍對齊在擊球瞬間同步播放。', 'Both swings play in sync, aligned at contact.'],
  needTwo: ['需要至少兩拍才能比較。', 'You need at least two swings to compare.'],
  consistency: ['穩定度（同類型的拍）', 'Consistency (same stroke type)'],
  forwardTime: ['前揮時間', 'Forward-swing time'],
  consHigh: ['穩定', 'consistent'], consMid: ['有些變化', 'some variation'], consLow: ['變化大', 'varies a lot'],
  play: ['播放', 'Play'], pause: ['暫停', 'Pause'], prevFrame: ['上一格', 'Previous frame'], nextFrame: ['下一格', 'Next frame'],
  toContact: ['跳到擊球', 'Jump to contact'], skeleton: ['骨架', 'Skeleton'], speedLbl: ['速度', 'Speed'],
  saveImage: ['儲存摘要圖', 'Save summary image'], share: ['分享', 'Share'], newAnalysis: ['分析新影片', 'New video'],
  historyTitle: ['過去的分析', 'Past analyses'], historyEmpty: ['還沒有紀錄。', 'Nothing saved yet.'],
  historyNote: ['只保存數據（不保存影片），存在這台裝置的瀏覽器裡。', 'Only the numbers are kept (never the video), in this browser on this device.'],
  del: ['刪除', 'Delete'], delAll: ['全部刪除', 'Delete all'], confirmDelAll: ['確定刪除全部紀錄？', 'Delete all saved analyses?'],
  open: ['查看', 'Open'], historyView: ['紀錄（無影片）', 'Saved result (no video)'],
  swings: ['拍', 'swings'],
  credits: ['使用說明與授權', 'About & credits'],
  footer: ['姿勢偵測使用 Google MediaPipe（Apache-2.0）。數據為估計值，僅供練習參考。', 'Pose detection by Google MediaPipe (Apache-2.0). Numbers are estimates for practice, not a diagnosis.'],
  phase: ['階段', 'Phase'],
  delegate: ['運算：{d}', 'Compute: {d}'],
  tracked: ['偵測到球員的畫面 {p}%', 'Player tracked in {p}% of frames'],
  rotateHint: ['橫放手機可以看更大的影片', 'Turn your phone sideways for a bigger video'],
  summaryTitle: ['揮拍分析摘要', 'Swing analysis summary'],
  savedOk: ['已儲存', 'Saved'],
  angleWarn: ['依拍攝角度，以下數據較不可靠：', 'From this angle these are less reliable:'],
  multiPeople: ['畫面中有多人，已自動選最大、最中間的那位。', 'Several people in frame - the largest, most central one was chosen.'],
};

let lang = 'zh';
export function setLang(l) { lang = l === 'en' ? 'en' : 'zh'; document.documentElement.lang = lang === 'zh' ? 'zh-Hant-TW' : 'en'; }
export function getLang() { return lang; }
export function t(key, vars) {
  const e = S[key]; let s = e ? e[lang === 'zh' ? 0 : 1] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}
export function L(obj) { return obj ? obj[lang] : ''; }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
}
export function fmtDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return t('sec', { n: s });
  return t('min', { m: Math.floor(s / 60), s: s % 60 });
}
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
