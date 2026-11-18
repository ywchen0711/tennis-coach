// Coaching library (original wording, zh-TW + en) and helpers that turn metrics into
// ranked advice. Ranges are coaching heuristics, not lab norms.
import { rangeFor } from './analysis.js?v=5';

const T = (zh, en) => ({ zh, en });

export const STROKE_NAMES = {
  forehand: T('正拍', 'Forehand'), backhand1: T('單手反拍', 'One-handed backhand'), backhand2: T('雙手反拍', 'Two-handed backhand'),
  volley: T('截擊', 'Volley'), serve: T('發球', 'Serve'), overhead: T('高壓', 'Overhead'),
};
export const STROKE_SHORT = {
  forehand: T('正拍', 'FH'), backhand1: T('單反', '1H BH'), backhand2: T('雙反', '2H BH'), volley: T('截擊', 'Volley'), serve: T('發球', 'Serve'), overhead: T('高壓', 'Smash'),
};
export const VIEW_NAMES = {
  front: T('正面', 'Front view'), frontDiag: T('斜前方', 'Front-diagonal'), side: T('側面', 'Side view'), backDiag: T('斜後方', 'Back-diagonal'), back: T('背面', 'Back view'),
};
export const VIEW_NOTES = {
  front: T('正面拍攝：擊球點前後距離、頭部前後移動要靠深度估計，這些數字可信度較低。', 'Front view: how far in front you hit and forward head movement rely on estimated depth, so those numbers are less certain.'),
  back: T('背面拍攝：擊球點前後距離要靠深度估計，可信度較低；臉部被擋住時左右也可能誤判。', 'Back view: contact distance in front relies on estimated depth; with the face hidden, left/right can be confused.'),
  side: T('側面拍攝：最適合看擊球點、轉體與重心，但肩膀起始方向在深度上，轉肩角度略不精準。', 'Side view: best for contact point, rotation timing and balance; the starting shoulder line lies in depth, so turn angles are a bit rougher.'),
  frontDiag: T('斜前方拍攝：大部分數據都可用。', 'Front-diagonal: most metrics are usable.'),
  backDiag: T('斜後方拍攝：大部分數據都可用。', 'Back-diagonal: most metrics are usable.'),
};
export const AREA_NAMES = {
  prep: T('準備與引拍', 'Preparation'), legs: T('下盤', 'Legs'), contact: T('擊球點', 'Contact'), power: T('發力鏈', 'Kinetic chain'),
  balance: T('平衡', 'Balance'), finish: T('收拍與回位', 'Finish & recovery'),
};
export const PHASE_NAMES = {
  ready: T('準備', 'Ready'), prep: T('轉體引拍', 'Unit turn / backswing'), prepServe: T('拋球・獎盃', 'Toss & trophy'),
  forward: T('前揮', 'Forward swing'), contact: T('擊球', 'Contact'), follow: T('隨揮', 'Follow-through'), recovery: T('回位', 'Recovery'),
};

export const METRIC_NAMES = {
  unitTurn: T('轉肩幅度', 'Unit turn'), separation: T('髖肩分離', 'Hip-shoulder separation'), offArm: T('非持拍手', 'Non-hitting arm'),
  compact: T('引拍大小', 'Backswing size'), trophyElbow: T('獎盃姿勢手肘角度', 'Trophy elbow angle'), trophyElbowHeight: T('獎盃姿勢手肘高度', 'Trophy elbow height'),
  tossArm: T('拋球手高度', 'Toss-arm reach'), kneeBend: T('屈膝', 'Knee bend'), legDrive: T('腿部蹬伸', 'Leg drive'), baseWidth: T('站位寬度', 'Base width'),
  contactFront: T('擊球點在身體前方', 'Contact in front'), contactHeight: T('擊球高度', 'Contact height'), contactReach: T('擊球點高度', 'Contact reach'),
  elbowAngle: T('擊球時手肘角度', 'Elbow at contact'), extension: T('手臂伸展', 'Arm extension'), chain: T('發力順序（髖→肩→肘→腕）', 'Sequence (hips→shoulders→elbow→wrist)'),
  wristSpeed: T('手腕速度', 'Wrist speed'), headStable: T('頭部穩定', 'Head stability'), trunkLean: T('上身傾斜', 'Trunk lean'),
  finish: T('隨揮收拍', 'Follow-through finish'), recovery: T('擊球後回位', 'Recovery footwork'),
  racketFace: T('擊球時拍面角度', 'Racket face at contact'), racketHeadHeight: T('擊球時拍頭高度', 'Racket head height at contact'), racketDrop: T('拍頭下沉（由下往上）', 'Racket drop (low to high)'),
  swingPath: T('揮拍路徑角度', 'Swing path'), racketLag: T('拍頭延遲（lag）', 'Racket lag'), takeBack: T('引拍時拍頭方向', 'Racket at take-back'), racketFinish: T('收拍時拍頭位置', 'Racket at finish'), serveDrop: T('發球拍頭下垂（背後抓背）', 'Serve racket drop'),

};

// what/why/cue/drill per metric and direction; "key@type" overrides the generic text
const C = {
  racketFace: {
    low: { why: T('擊球時拍面太關（往下蓋），球容易掛網。', 'The face is too closed at contact, so balls dive into the net.'),
      cue: T('「拍面垂直地面去碰球」，靠由下往上的揮拍產生上旋，不是靠蓋拍。', '"Meet it with a vertical face" - topspin comes from the low-to-high swing, not from rolling over.'),
      drill: T('定點餵球，擊球後停住檢查拍面是否接近垂直，15 球。', 'Fed balls: freeze after contact and check the face is close to vertical. 15 balls.') },
    high: { why: T('擊球時拍面太開（朝上），球容易飛高出界或變成削球。', 'The face is too open at contact, so balls float long or turn into slices.'),
      cue: T('「拍面對準網子上緣」，手腕保持固定。', '"Point the strings at the top of the net" and keep the wrist firm.'),
      drill: T('對牆短距離平擊，專注拍面垂直，連續 20 球。', 'Short wall rally focusing on a vertical face, 20 in a row.') },
    good: T('擊球時拍面角度穩定接近垂直。', 'Racket face close to square at contact.'),
  },
  'racketFace@volley': {
    low: { why: T('截擊拍面太關，球會往下掛網。', 'A closed face on the volley sends the ball into the net.'),
      cue: T('「拍面微開，像托住球」。', '"Slightly open face, like cradling the ball."'), drill: T('近距離截擊，讓球帶一點下旋過網，20 球。', 'Close volleys with a touch of underspin over the net. 20 balls.') },
    high: { why: T('截擊拍面太開，球會飄高。', 'Too open on the volley - the ball floats up.'), cue: T('「拍面只微微打開」。', '"Only slightly open."'), drill: T('對牆截擊，目標打在網高附近，20 球。', 'Wall volleys aiming at net height. 20 balls.') },
    good: T('截擊拍面微開、穩定。', 'Slightly open, steady volley face.'),
  },
  racketHeadHeight: {
    low: { why: T('擊球時拍頭垂得比手低很多，拍面不穩、容易掛網。', 'The racket head hangs well below the hand at contact, making the face unstable.'),
      cue: T('「用膝蓋降低，不是放下拍頭」。', '"Get low with the knees, don\'t drop the racket head."'), drill: T('低球練習，保持拍頭與手腕接近同高，10 球。', 'Low-ball practice keeping the head level with the wrist. 10 balls.') },
    high: { why: T('擊球時拍頭比手高很多，揮拍變成由上往下、球容易下網。', 'The head is far above the hand at contact, turning the swing downward.'),
      cue: T('「讓拍頭落到球的高度」。', '"Let the racket head come down to the ball."'), drill: T('空揮定格在擊球點，拍子接近水平，10 次。', 'Shadow swing and freeze at contact with the racket close to level. 10 reps.') },
    good: T('擊球時拍頭高度合適。', 'Good racket head height at contact.'),
  },
  'racketHeadHeight@volley': {
    low: { why: T('截擊拍頭低於手腕，拍面容易晃、擋不住球。', 'Racket head below the wrist on the volley makes the face wobble.'),
      cue: T('「拍頭高過手腕，像拿著盾牌」。', '"Head above the wrist, like holding a shield."'), drill: T('靠網截擊，全程保持拍頭朝上，20 球。', 'Net volleys keeping the head up the whole time. 20 balls.') },
    good: T('截擊拍頭保持在手腕上方。', 'Racket head stays above the wrist on volleys.'),
  },
  'racketHeadHeight@serve': {
    low: { why: T('發球擊球時拍子沒有向上伸直，擊球點變低。', 'The racket is not reaching straight up at the serve contact, lowering it.'),
      cue: T('「手臂和拍子連成一直線向上」。', '"Arm and racket in one straight line upward."'), drill: T('牆邊高點揮拍，10 次。', 'High-mark wall swings, 10 reps.') },
    good: T('發球擊球時拍子向上伸展。', 'Racket reaches up at the serve contact.'),
  },
  racketDrop: {
    low: { why: T('前揮時拍頭沒有先降到球的下方，揮拍太平，上旋不足、球不穩。', 'The head never drops below the ball in the forward swing, so the swing is flat and lacks topspin.'),
      cue: T('「拍頭先掉下去，再往上刷」。', '"Drop the head, then brush up."'), drill: T('從膝蓋高度開始的由下往上揮拍，打到圍網上方，15 球。', 'Low-to-high swings starting at knee height, hitting up over the fence line. 15 balls.') },
    high: { why: T('拍頭降得太低，揮拍路徑太陡，球容易短。', 'The head drops very low and the swing is too steep, so balls land short.'),
      cue: T('「拍頭只降到比球低一點」。', '"Drop just below the ball."'), drill: T('擊球深度練習：目標打過發球線後兩公尺，15 球。', 'Depth drill: land balls 2 m beyond the service line. 15 balls.') },
    good: T('拍頭有先下沉再往上揮。', 'Good low-to-high racket drop.'),
  },
  swingPath: {
    low: { why: T('揮拍路徑太平或由上往下，球過網低、上旋少。', 'The swing path is flat or downward, so the ball clears the net low with little topspin.'),
      cue: T('「由下往上刷球，像擦窗戶往上」。', '"Brush up the back of the ball."'), drill: T('對牆練習往上刷，讓球帶旋轉彈高，20 球。', 'Wall brushing practice making the ball kick up. 20 balls.') },
    high: { why: T('揮拍太往上，力量變成旋轉、球速不足。', 'The path is very steep, turning power into spin and losing pace.'),
      cue: T('「往前多一點，穿過球」。', '"More forward, through the ball."'), drill: T('目標打深，揮拍往目標延伸，15 球。', 'Aim deep and extend toward the target. 15 balls.') },
    good: T('揮拍路徑由下往上，角度合適。', 'Good low-to-high swing path.'),
  },
  'swingPath@volley': {
    high: { why: T('截擊往上撈，球容易飄高。', 'Lifting the volley makes it float.'), cue: T('「略由上往下擋」。', '"Block slightly high to low."'), drill: T('近網截擊下旋，20 球。', 'Underspin volleys at the net. 20 balls.') },
    good: T('截擊路徑平穩略向下。', 'Steady, slightly downward volley path.'),
  },
  racketLag: {
    low: { why: T('前揮時拍子和前臂幾乎一直線，少了「甩」的加速。', 'Racket and forearm stay in line in the forward swing, so there is no whip.'),
      cue: T('「手腕放鬆，讓拍頭跟在手後面」。', '"Loose wrist - let the racket head trail the hand."'), drill: T('輕握拍空揮，感覺拍頭最後才甩出去，15 次。', 'Shadow swings with a light grip, feeling the head whip through last. 15 reps.') },
    high: { why: T('拍頭落後太多，擊球時機不好抓。', 'The head lags too far behind, making timing hard.'), cue: T('「手腕稍微穩住」。', '"Firm the wrist a little."'), drill: T('慢速對打，專注準時擊球，20 球。', 'Slow rally focusing on on-time contact. 20 balls.') },
    good: T('前揮有拍頭延遲，甩動自然。', 'Natural racket lag in the forward swing.'),
  },
  takeBack: {
    low: { why: T('引拍時拍頭朝下太早，揮拍路徑和節奏不穩定。', 'The racket points down too early in the take-back, unsettling the path and rhythm.'),
      cue: T('「引拍時拍頭朝上或朝後圍網」。', '"In the take-back, point the head up or at the back fence."'), drill: T('引拍定格：拍頭朝上停 1 秒再揮，10 次。', 'Take-back freeze: head up for a second, then swing. 10 reps.') },
    good: T('引拍時拍頭位置合適。', 'Good racket position at the take-back.'),
  },
  racketFinish: {
    low: { why: T('收拍時拍頭停在肩膀下方，揮拍可能中途減速。', 'The racket finishes below the shoulder, a sign of slowing down early.'),
      cue: T('「拍子收到肩膀上方」。', '"Finish the racket over the shoulder."'), drill: T('收拍定格 2 秒，拍頭在肩上，15 次。', 'Hold the finish for 2 s with the head over the shoulder. 15 reps.') },
    good: T('收拍時拍頭在肩膀上方。', 'Racket finishes over the shoulder.'),
  },
  serveDrop: {
    low: { why: T('發球拍頭沒有在背後下垂，揮拍距離短、球速受限。', 'The racket head does not drop behind the back, shortening the serve swing.'),
      cue: T('「讓拍頭在背後掉下去，像抓背」。', '"Let the head drop down your back, like scratching it."'), drill: T('丟球練習 10 次，感受手肘抬起、拍頭下垂。', 'Throwing practice, 10 reps, feeling elbow up and head down.') },
    good: T('發球拍頭有充分下垂。', 'Good racket drop on the serve.'),
  },
  unitTurn: {
    low: { why: T('肩膀轉得不夠，揮拍就只剩手臂在出力，球速和穩定度都會打折。', 'Without enough shoulder turn the arm does all the work, which costs both power and control.'),
      cue: T('「先轉肩、再引拍」：讓非持拍手那側的肩膀對準來球。', '"Turn first, then take it back": point your front shoulder at the ball.'),
      drill: T('牆邊轉體：背對牆站一步遠，雙手橫握球拍在胸前，轉肩直到拍框輕碰牆面，左右各 10 次。', 'Wall turns: stand a step in front of a wall facing away, racket held across your chest; turn until the frame touches the wall. 10 per side.') },
    high: { why: T('轉得太多會來不及轉回來，擊球點常因此落在身體後面。', 'Over-turning makes it hard to rotate back in time, so contact often ends up late.'),
      cue: T('「轉到側身就好」：胸口對著側邊網柱即可。', '"Sideways is enough": stop when your chest faces the side fence.'),
      drill: T('定點餵球：只轉到側身，專注在前方準時擊球，連續 10 球。', 'Fed balls: turn only to sideways and focus on meeting the ball out front, 10 in a row.') },
    good: T('轉肩充分，身體有參與引拍。', 'Good shoulder turn - the body leads the backswing.'),
  },
  'unitTurn@volley': {
    low: { why: T('截擊幾乎沒轉肩，只靠手腕推球，拍面容易不穩。', 'Almost no turn on the volley, so the wrist pushes the ball and the face wobbles.'),
      cue: T('「肩膀先轉一點，拍子跟著身體」。', '"A small shoulder turn - let the body carry the racket."'),
      drill: T('同伴近距離拋球，只用轉肩把拍子帶到球的側後方再擋出去，10 球。', 'Close-range toss: use only a small shoulder turn to set the racket, then block. 10 balls.') },
    high: { why: T('截擊轉身太大，網前時間不夠，常常來不及。', 'Too much turn at the net - there is no time for it and you will be late.'),
      cue: T('「轉肩不拉拍，拍頭留在眼前」。', '"Turn the shoulders, not the racket - keep the head in sight."'),
      drill: T('背靠圍網截擊：站在圍網前一步，引拍碰到網就代表太大。', 'Fence volleys: stand one step in front of a fence; if the racket touches it, the backswing is too big.') },
    good: T('截擊轉體小而確實。', 'Compact, purposeful turn on the volley.'),
  },
  separation: {
    low: { why: T('髖和肩同時轉，少了「扭緊的彈簧」，上半身的爆發力來源變少。', 'Hips and shoulders turn as one block, so you lose the coiled-spring stretch that feeds power.'),
      cue: T('「肩比髖多轉一點」：引拍時感覺腰側被拉緊。', '"Shoulders turn a little more than hips" - feel the stretch along your side.'),
      drill: T('側拋練習：用藥球或裝水的寶特瓶，下半身先穩住、肩膀多轉一些再甩出，10 次×2 組。', 'Side throws with a medicine ball or water bottle: keep hips quieter, turn shoulders further, then release. 2 x 10.') },
    high: { why: T('扭轉角度過大，下背負擔重，時機也較難抓。', 'Very large twist strains the lower back and makes timing harder.'),
      cue: T('「讓髖跟著轉一些」，不要硬扭。', '"Let the hips come along a little" - no forced twisting.'),
      drill: T('慢動作空揮 10 次，感受髖帶肩一起轉回來。', 'Ten slow shadow swings feeling the hips lead the shoulders back round.') },
    good: T('髖肩有拉開，身體有蓄力。', 'Nice hip-shoulder stretch - the body is loaded.'),
  },
  offArm: {
    low: { why: T('非持拍手沒有伸出來，轉體不完整，也少了平衡與測距的幫手。', 'The non-hitting arm stays tucked, so the turn is incomplete and you lose a balance and spacing aid.'),
      cue: T('「另一手指著來球，擊球時收回胸前」。', '"Point at the ball with the other hand, then pull it in as you swing."'),
      drill: T('夾毛巾正拍：非持拍手伸直指球，揮拍時把手收回，夾住胸前的毛巾，10 次。', 'Towel catch: free arm points at the ball, then folds in to trap a towel against your chest as you swing. 10 reps.') },
    good: T('非持拍手有伸出協助轉體。', 'The free arm helps the turn.'),
  },
  'offArm@backhand1': {
    low: { why: T('單反擊球時另一手太早跟著往前，肩膀過早打開、拍面不穩。', 'On a one-hander the free hand follows the racket too early, opening the shoulders and the face.'),
      cue: T('「像拉弓」：擊球瞬間持拍手向前，另一手向後。', '"Draw the bow": at contact the racket hand goes forward, the other hand goes back.'),
      drill: T('單反定格：揮到擊球點停住，確認兩手分開、胸口仍側對球網，10 次。', 'Freeze at contact: check the hands are apart and your chest still faces the side. 10 reps.') },
    good: T('單反兩手有拉開，肩膀保持側身。', 'Arms spread nicely on the one-hander; shoulders stay closed.'),
  },
  compact: {
    high: { why: T('截擊引拍太大，網前反應時間不夠，容易打晚或打飛。', 'The volley backswing is too big - at the net there is no time and the ball flies.'),
      cue: T('「擋，不是揮」：拍頭留在身體前方。', '"Block, don\'t swing" - keep the racket head in front of you.'),
      drill: T('靠著圍網或牆截擊，拍子不碰到後方就算過關，連續 20 球。', 'Volley with your back near a fence or wall; do not let the racket touch it. 20 in a row.') },
    good: T('截擊引拍精簡。', 'Compact volley preparation.'),
  },
  kneeBend: {
    low: { why: T('膝蓋太直、重心偏高，不容易向上發力，也比較容易失去平衡。', 'Straight knees keep your weight high, so it is hard to push up into the ball and stay balanced.'),
      cue: T('「坐下去再揮」：像要坐上一張高腳椅。', '"Sit, then swing" - as if lowering onto a bar stool.'),
      drill: T('低重心餵球：在膝蓋高度橫拉一條毛巾或彈力帶，擊球前膝蓋要低過它，10 球。', 'Low-base feeding: stretch a towel at knee height; get your knees below it before every hit. 10 balls.') },
    high: { why: T('蹲得太低，動作會變僵硬、移動也變慢。', 'Sitting too low stiffens the swing and slows your feet.'),
      cue: T('「微蹲、保持彈性」。', '"Athletic, springy knees - not a squat."'),
      drill: T('分腿墊步後擊球，膝蓋像彈簧一樣微彎即可，10 球。', 'Split-step then hit, with springy, slightly bent knees. 10 balls.') },
    good: T('屈膝充足，重心穩。', 'Good knee bend and a stable base.'),
  },
  'kneeBend@serve': {
    low: { why: T('發球屈膝不足，腿部的力量幾乎沒有用上，擊球點也不容易變高。', 'Little knee bend on the serve leaves the legs out of it and limits how high you can hit.'),
      cue: T('「獎盃姿勢時膝蓋往前彎，像準備跳起來」。', '"Bend the knees at the trophy, as if about to jump."'),
      drill: T('不拿球拍做 10 次「獎盃姿勢→向上跳」，再拿拍做 10 次空揮。', 'Ten trophy-pose-to-jump reps without a racket, then ten shadow serves.') },
    high: { why: T('蹲太深反而會拖慢發球節奏。', 'Very deep bend slows the rhythm of the serve.'), cue: T('「彎到有彈性就好」。', '"Bend until springy, no deeper."'), drill: T('慢節奏空發 10 次，找舒服的屈膝深度。', 'Ten slow shadow serves to find a comfortable depth.') },
    good: T('發球有確實屈膝蓄力。', 'Solid knee bend loading the serve.'),
  },
  legDrive: {
    low: { why: T('擊球時腿沒有往上推，力量只剩上半身在出。', 'The legs do not push up through contact, so power comes from the upper body only.'),
      cue: T('「從地板推上來」：擊球時身體向上長高一點。', '"Push off the ground" - grow a little taller through contact.'),
      drill: T('蹲推空揮：從低重心開始，揮拍的同時把身體推高，10 次×2 組。', 'Squat-to-swing: start low and drive up as you swing. 2 x 10.') },
    good: T('有用腿往上蹬。', 'Good upward leg drive.'),
  },
  'legDrive@serve': {
    low: { why: T('發球沒有蹬地，擊球點偏低、球速也受限。', 'No push off the ground on the serve - lower contact and less pace.'),
      cue: T('「往上蹬，打到天花板」。', '"Drive up and hit the ceiling."'),
      drill: T('拋球後跳起，用非持拍手在最高點接住球，10 次。', 'Toss, jump and catch the ball at its peak with your free hand. 10 reps.') },
    good: T('發球蹬地有力。', 'Strong leg drive on the serve.'),
  },
  baseWidth: {
    low: { why: T('雙腳站得太近，揮拍時身體容易晃。', 'Feet too close together, so the swing rocks the body.'),
      cue: T('「雙腳比肩膀寬」。', '"Feet wider than your shoulders."'),
      drill: T('地上放兩個標誌，相距約一個半肩寬，每次擊球雙腳都踩在標誌外側。', 'Place two markers about 1.5 shoulder-widths apart and land outside them on every shot.') },
    high: { why: T('站得太開，轉體和回位都會變慢。', 'Very wide stance slows rotation and recovery.'),
      cue: T('「略寬於肩即可」。', '"A bit wider than shoulders is enough."'),
      drill: T('同上，把標誌距離縮短到約一個肩寬多一點。', 'Same drill with markers a little more than one shoulder-width apart.') },
    good: T('站位寬度適中，底盤穩。', 'Stable, well-sized base.'),
  },
  contactFront: {
    low: { why: T('擊球點太靠近身體或偏後，拍面難控制，容易打出界或掛網。', 'Contact is too close or late, so the racket face is hard to control - balls sail or hit the net.'),
      cue: T('「在前腳前方擊球」。', '"Meet it in front of your front foot."'),
      drill: T('前方標誌：在前腳前一個拍面距離放一個標誌，請同伴把球拋到那裡，專注在標誌上方擊球，15 球。', 'Contact marker: put a marker one racket-face ahead of your front foot; a partner tosses there and you hit above it. 15 balls.') },
    high: { why: T('擊球點太前面，手臂伸得太滿，失去身體的支撐。', 'Contact is reached too far out, overextending the arm without body support.'),
      cue: T('「讓球再進來一點」。', '"Let the ball come to you a little more."'),
      drill: T('拋球擊球，同伴觀察擊球點，目標落在前腳前方約一個拍面。', 'Toss-and-hit while a partner watches; aim about one racket-face ahead of the front foot.') },
    good: T('擊球點在身體前方，時機準。', 'Contact out in front - good timing.'),
  },
  'contactFront@volley': {
    low: { why: T('截擊在身體旁邊或後面才碰到球，球會軟、方向也不穩。', 'The volley is met beside or behind you, so it lacks punch and direction.'),
      cue: T('「往前迎球，在眼前接住它」。', '"Step forward and catch it in front of your eyes."'),
      drill: T('同伴近距離拋球，你用拍面「接住」球再放下，感覺擊球點在前方，15 球。', 'Partner tosses from close range; catch the ball on the strings out in front, 15 times.') },
    good: T('截擊擊球點在前方。', 'Volleys met out in front.'),
  },
  contactHeight: {
    low: { why: T('擊球點太低（低於腰），容易掛網，只能用撈的。', 'Contact below the waist makes you scoop the ball and net it.'),
      cue: T('「用膝蓋降低身體，不是只降拍頭」。', '"Lower your body with your knees, not just the racket head."'),
      drill: T('低球練習：同伴丟低彈跳球，屈膝讓眼睛接近球的高度，10 球。', 'Low balls: partner feeds low bounces; bend your knees to bring your eyes near the ball. 10 balls.') },
    high: { why: T('擊球點太高（高於肩膀），不好發力也難控制。', 'Contact above the shoulder is hard to drive and control.'),
      cue: T('「先退一步，等球落到腰胸之間」。', '"Step back and let it drop to waist-chest height."'),
      drill: T('高彈跳球練習：先後退再上前，在腰胸高度擊球，10 球。', 'High-bounce feeds: move back, then forward, and hit at waist-chest height. 10 balls.') },
    good: T('擊球高度在腰到胸之間的舒適區。', 'Contact in the waist-to-chest comfort zone.'),
  },
  contactReach: {
    low: { why: T('擊球點偏低，發球角度變小，容易掛網。', 'Low contact flattens the serve angle and brings the net into play.'),
      cue: T('「完全伸展，在最高點打球」。', '"Reach full stretch and hit at the top."'),
      drill: T('拋球拋高一點、略偏前；在牆上貼個高點標記，空揮時手臂伸直碰到標記上方。', 'Toss a little higher and more forward; tape a high mark on a wall and reach above it with a straight arm when shadowing.') },
    good: T('發球擊球點高。', 'High contact on the serve.'),
  },
  elbowAngle: {
    low: { why: T('擊球時手肘太彎，揮拍半徑變小、擊球點擠到身體。', 'A tightly bent elbow at contact shrinks the swing and jams the ball into your body.'),
      cue: T('「手臂放鬆打開，在前面擊球」。', '"Relax and let the arm open out in front."'),
      drill: T('空揮定格在擊球點，檢查手肘自然打開（約 100–170°），10 次。', 'Shadow swing and freeze at contact; check the elbow is comfortably open (about 100-170 deg). 10 reps.') },
    good: T('擊球時手肘角度合適。', 'Comfortable elbow angle at contact.'),
  },
  'elbowAngle@backhand1': {
    low: { why: T('單反擊球時手肘彎著，等於用手肘推球，容易無力也較傷手肘。', 'A bent elbow on the one-hander means pushing with the elbow - weak and hard on the joint.'),
      cue: T('「手臂打直，由肩膀帶動」。', '"Straight arm, swing from the shoulder."'),
      drill: T('單反慢揮：持拍手伸直，從肩膀擺動到擊球點停住，10 次。', 'Slow one-hander: straight arm, swing from the shoulder and freeze at contact. 10 reps.') },
    good: T('單反擊球手臂伸直。', 'Straight hitting arm on the one-hander.'),
  },
  'elbowAngle@serve': {
    low: { why: T('擊球時手肘還沒伸直，損失高度也損失力量。', 'The elbow is still bent at contact, costing height and power.'),
      cue: T('「往上伸直去打」。', '"Reach up straight to the ball."'),
      drill: T('牆邊高點揮拍：在牆上貼高點，手肘伸直讓拍子揮過標記，10 次。', 'High-mark swings: reach a mark on a wall with the elbow straight. 10 reps.') },
    good: T('發球擊球時手臂伸直。', 'Full arm extension at the serve contact.'),
  },
  'elbowAngle@volley': {
    low: { why: T('截擊手肘太彎，球拍貼近身體，擋球不穩。', 'Elbow too bent on the volley - the racket is crowded against you.'),
      cue: T('「拍子在身體前方，手肘輕彎就好」。', '"Racket out front, elbow only slightly bent."'),
      drill: T('近距離截擊對打，讓擊球點保持在身體前方一臂距離，20 球。', 'Close volley rally keeping contact an arm\'s length in front. 20 balls.') },
    high: { why: T('截擊手臂打太直，缺少緩衝，控制變差。', 'Arm locked straight on the volley - no cushion, less control.'), cue: T('「手肘微彎，像接球」。', '"Soft elbow, like catching."'), drill: T('用拍面接住拋來的球再放下，10 次。', 'Catch tossed balls on the strings and set them down. 10 reps.') },
    good: T('截擊手肘角度穩定。', 'Stable elbow on the volley.'),
  },
  extension: {
    low: { why: T('擊球時手臂沒有伸展開，擊球點擠到身體旁邊。', 'The arm is not extended at contact, so the ball is jammed beside you.'),
      cue: T('「把球推向目標，手臂延伸出去」。', '"Extend through the ball toward the target."'),
      drill: T('拋球擊球後定格，手臂朝目標延伸停 2 秒，10 球。', 'Toss-and-hit, then hold the extension toward the target for 2 s. 10 balls.') },
    good: T('擊球時手臂伸展。', 'Good extension through contact.'),
  },
  chain: {
    low: { why: T('身體發力順序亂掉（例如手臂比髖先動），力量傳到球拍前就斷了。', 'The body fires out of order (e.g. arm before hips), so energy leaks before it reaches the racket.'),
      cue: T('「髖→肩→手，由下往上依序轉」。', '"Hips, then shoulders, then arm - from the ground up."'),
      drill: T('分段揮拍：先只轉髖 5 次，再加上肩 5 次，最後加手臂 5 次，再連成一個動作。', 'Build-up swings: 5 with hips only, 5 adding shoulders, 5 adding the arm, then blend into one.') },
    good: T('發力順序正確：髖、肩、手依序加速。', 'Good sequence: hips, shoulders, then arm accelerate in order.'),
  },
  headStable: {
    high: { why: T('擊球時頭部晃動，眼睛追球不穩，擊球點也跟著不穩。', 'The head moves through contact, so your eyes - and the contact point - wobble.'),
      cue: T('「打完頭留在原地，多看擊球點半拍」。', '"Keep your head still and look at the contact point a beat longer."'),
      drill: T('定格練習：擊球後頭不動，直到球過網才抬頭，10 球。', 'Still-head drill: after contact keep the head still until the ball crosses the net. 10 balls.') },
    good: T('擊球時頭部穩定。', 'Steady head through contact.'),
  },
  trunkLean: {
    high: { why: T('上身傾斜太多，重心不穩，揮拍軌跡也會跑掉。', 'Leaning the trunk a lot unsettles balance and bends the swing path.'),
      cue: T('「上身直立，用腿調整高度」。', '"Stay tall, use your legs to adjust height."'),
      drill: T('頭頂放一條毛巾空揮 10 次，毛巾不掉為準。', 'Ten shadow swings with a towel on your head - keep it there.') },
    good: T('上身姿勢穩定直立。', 'Upright, stable posture.'),
  },
  'trunkLean@serve': {
    high: { why: T('發球時身體倒向一邊，擊球點和方向都不穩定。', 'The body falls sideways on the serve, making contact and direction erratic.'),
      cue: T('「身體往上伸展，不是往旁邊倒」。', '"Stretch up, don\'t fall sideways."'),
      drill: T('對著鏡子做獎盃姿勢到擊球點，檢查身體保持向上伸展，10 次。', 'Trophy-to-contact in front of a mirror, checking you stay tall. 10 reps.') },
    good: T('發球身體向上伸展。', 'Tall, stretched serve posture.'),
  },
  finish: {
    low: { why: T('隨揮太短或太低，通常表示揮拍在擊球前就減速了。', 'A short or low finish usually means the swing slows down before contact.'),
      cue: T('「拍子收到對側肩膀上方，手肘指向前方」。', '"Finish over the opposite shoulder, elbow pointing forward."'),
      drill: T('隨揮定格：每次揮完停 2 秒，確認拍子在對側肩膀上，15 次。', 'Hold the finish for 2 s and check the racket is over the opposite shoulder. 15 reps.') },
    good: T('收拍完整，揮拍有加速穿過球。', 'Full finish - you accelerate through the ball.'),
  },
  'finish@backhand1': {
    low: { why: T('單反收拍太低或太早停，球容易沒有深度。', 'A low or cut-short one-hander finish robs the ball of depth.'),
      cue: T('「收拍高舉，像在揮手道別」。', '"Finish high, like waving goodbye."'),
      drill: T('單反隨揮定格，拍子高過頭、胸口仍側對網，10 次。', 'Hold a high one-hander finish, chest still sideways. 10 reps.') },
    good: T('單反收拍高而完整。', 'High, complete one-hander finish.'),
  },
  'finish@backhand2': {
    low: { why: T('雙反收拍太低或太短，揮拍在擊球前就減速了。', 'A low or short two-hander finish means slowing down before contact.'),
      cue: T('「雙手一起收到持拍側肩膀上方」。', '"Both hands finish over the hitting-side shoulder."'),
      drill: T('雙反隨揮定格，肘部抬到下巴高度，10 次。', 'Hold the two-hander finish with elbows near chin height. 10 reps.') },
    good: T('雙反收拍完整。', 'Complete two-hander finish.'),
  },
  'finish@volley': {
    low: { why: T('截擊隨揮太長，回位慢，下一球容易來不及。', 'A long volley follow-through slows your recovery for the next ball.'),
      cue: T('「推一下就停：擋，不是揮」。', '"Punch and stop - block, don\'t swing."'),
      drill: T('快速截擊對打，拍子不越過身體中線，20 球。', 'Quick volley rally without the racket crossing your body. 20 balls.') },
    good: T('截擊隨揮短而穩。', 'Short, firm volley follow-through.'),
  },
  'finish@serve': {
    low: { why: T('發球隨揮不完整，前臂旋內不足，球速和旋轉都會受限。', 'An incomplete serve follow-through with little forearm turn limits pace and spin.'),
      cue: T('「打完拍子收向對側腰邊」。', '"Finish with the racket by your opposite hip."'),
      drill: T('空發 10 次，聽拍子劃空的聲音出現在身體前方，最後收到對側腰邊。', 'Ten shadow serves: hear the swish in front of you and finish by the opposite hip.') },
    good: T('發球隨揮完整、有旋內。', 'Full serve follow-through with forearm turn.'),
  },
  recovery: {
    low: { why: T('擊球後沒有移動回位，下一球會來不及。', 'No recovery steps after the shot - you will be late for the next ball.'),
      cue: T('「打完馬上小碎步回中間，再分腿墊步」。', '"Recover with quick steps to the middle, then split-step."'),
      drill: T('打一球→小碎步碰中線→再打，連續 10 球。', 'Hit, shuffle to touch the centre mark, hit again - 10 in a row.') },
    good: T('擊球後有積極回位。', 'Active recovery after the shot.'),
  },
  trophyElbow: {
    low: { why: T('獎盃姿勢手肘夾太緊，拍子後擺不夠，揮拍距離變短。', 'The elbow is folded too tight at the trophy, shortening the swing path.'),
      cue: T('「手肘打開約 90 度，像準備丟球」。', '"Open the elbow to about 90 degrees, like a throw."'),
      drill: T('丟球練習：用發球動作把網球丟過網 10 次，感受手肘的角度與鞭甩。', 'Throw a ball over the net with your service motion 10 times to feel the elbow angle and whip.') },
    high: { why: T('獎盃姿勢手臂太直，少了蓄力。', 'The arm is too straight at the trophy, so there is little load.'),
      cue: T('「手肘彎起來，拍頭指向天空」。', '"Bend the elbow, racket tip to the sky."'),
      drill: T('在獎盃姿勢停 2 秒再揮，10 次。', 'Pause 2 s in the trophy position, then swing. 10 reps.') },
    good: T('獎盃姿勢手肘角度好。', 'Good elbow angle at the trophy.'),
  },
  trophyElbowHeight: {
    low: { why: T('持拍手肘低於肩膀，向上揮拍受限，肩膀負擔也較大。', 'Hitting elbow below shoulder level limits the upward swing and loads the shoulder.'),
      cue: T('「手肘抬到肩膀高度」。', '"Lift the elbow to shoulder height."'),
      drill: T('鏡前做獎盃姿勢 10 次，確認手肘與肩同高。', 'Ten trophy poses in a mirror, elbow level with the shoulder.') },
    high: { why: T('手肘抬太高，肩膀容易緊繃。', 'Elbow lifted too high tenses the shoulder.'), cue: T('「放鬆，約與肩同高」。', '"Relax it to about shoulder height."'), drill: T('鏡前慢動作獎盃姿勢 10 次。', 'Ten slow trophy poses in a mirror.') },
    good: T('獎盃姿勢手肘高度合適。', 'Good elbow height at the trophy.'),
  },
  tossArm: {
    low: { why: T('拋球手沒有舉高，肩膀傾斜不足，拋球也較不穩。', 'The toss arm does not reach up, so the shoulders do not tilt and the toss is less reliable.'),
      cue: T('「拋球手向上伸直，指著球直到最高點」。', '"Lift the toss arm straight and point at the ball until it peaks."'),
      drill: T('只拋不打：手臂伸直停在頂端，讓球落在地上的拍框裡，10 次。', 'Toss only: hold the straight arm at the top and let the ball land on a racket on the ground. 10 tosses.') },
    good: T('拋球手伸展到位。', 'Toss arm reaches up fully.'),
  },
};

export function metricText(key, type) { return C[`${key}@${type}`] || (type === 'overhead' && C[`${key}@serve`]) || (type === 'backhand2' && key === 'unitTurn' ? C.unitTurn : null) || C[key] || null; }

export function fmtValue(m, lang, type) {
  const v = m.v;
  const unit = m.unitOverride || m.unit;
  switch (unit) {
    case 'deg': return `${Math.round(v)}°`;
    case 'face': return faceText(v, lang);
    case 'pctBH': return lang === 'zh' ? `${Math.round(v * 100)}% 身高` : `${Math.round(v * 100)}% of height`;
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'ratio': return lang === 'zh' ? `${v.toFixed(1)} 倍肩寬` : `${v.toFixed(1)}× shoulder width`;
    case 'level': return levelText(v, lang);
    case 'order': return lang === 'zh' ? `${Math.round(v)}/3 順序正確` : `${Math.round(v)}/3 in order`;
    case 'speed': return lang === 'zh' ? `${v.toFixed(1)} 身高/秒` : `${v.toFixed(1)} heights/s`;
    default: return String(Math.round(v * 100) / 100);
  }
}
export function faceText(v, lang) {
  const a = Math.round(Math.abs(v));
  if (a <= 3) return lang === 'zh' ? '垂直' : 'square';
  return lang === 'zh' ? (v < 0 ? `關閉 ${a}°` : `開放 ${a}°`) : (v < 0 ? `closed ${a}°` : `open ${a}°`);
}
function levelText(v, lang) {
  const zh = v < -0.15 ? '膝蓋高度' : v < 0.2 ? '髖部高度' : v < 0.55 ? '腰部高度' : v < 0.9 ? '胸口高度' : v < 1.15 ? '肩膀高度' : '高於肩膀';
  const en = v < -0.15 ? 'knee height' : v < 0.2 ? 'hip height' : v < 0.55 ? 'waist height' : v < 0.9 ? 'chest height' : v < 1.15 ? 'shoulder height' : 'above shoulder';
  return lang === 'zh' ? zh : en;
}
export function fmtRange(key, type, lang, unitOverride) {
  const r = rangeFor(type, key); if (!r) return '';
  const unit = unitOverride || ({ ...{ unitTurn: 'deg', separation: 'deg', trophyElbow: 'deg', kneeBend: 'deg', elbowAngle: 'deg', trunkLean: 'deg' } })[key] || null;
  const [lo, hi] = r;
  const f = (x) => {
    if (unit === 'deg') return `${Math.round(x)}°`;
    if (['contactFront', 'legDrive', 'compact', 'trophyElbowHeight', 'tossArm', 'contactReach', 'headStable', 'recovery', 'racketHeadHeight', 'racketDrop', 'racketFinish', 'serveDrop'].includes(key) || unitOverride === 'pctBH') return `${Math.round(x * 100)}%`;
    if (key === 'baseWidth') return x.toFixed(1);
    if (key === 'chain') return `${Math.round(x)}/3`;
    if (key === 'contactHeight') return levelText(x, lang);
    return `${Math.round(x * 100)}%`;
  };
  if (key === 'chain') return lang === 'zh' ? '3/3' : '3/3';
  if (key === 'racketFace') return `${faceText(lo, lang)} – ${faceText(hi, lang)}`;
  if (['swingPath', 'racketLag', 'takeBack'].includes(key)) return `${Math.round(lo)}°–${Math.round(hi)}°`;
  if (key === 'headStable' || key === 'compact') return lang === 'zh' ? `≤ ${f(hi)}` : `≤ ${f(hi)}`;
  if (key === 'trunkLean') return `≤ ${f(hi)}`;
  if (hi >= 1.5 && key !== 'baseWidth' && unit !== 'deg') return `≥ ${f(lo)}`;
  if (key === 'contactHeight') return lang === 'zh' ? `${levelText(lo + 0.3, lang)}～${levelText(hi - 0.05, lang)}` : `${levelText(lo + 0.3, lang)} to ${levelText(hi - 0.05, lang)}`;
  return `${f(lo)}–${f(hi)}`;
}

export const CONF_LABEL = (c, lang) => c >= 0.7 ? (lang === 'zh' ? '高' : 'high') : c >= 0.45 ? (lang === 'zh' ? '中' : 'medium') : (lang === 'zh' ? '低' : 'low');
export function areaLabel(score, lang) {
  if (score >= 0.9) return lang === 'zh' ? '很好' : 'Strong';
  if (score >= 0.72) return lang === 'zh' ? '不錯' : 'Good';
  if (score >= 0.5) return lang === 'zh' ? '可加強' : 'Fair';
  return lang === 'zh' ? '優先改善' : 'Work on it';
}

// Plain-language verdicts for the contact point, per stroke type (or one swing).
// heightCm converts body-height fractions to approximate centimetres.
const CONF_OK = 0.45;
const r5 = (x) => Math.max(5, Math.round(x / 5) * 5);
export function contactVerdicts(swings, heightCm, lang, single = false) {
  const zh = lang === 'zh'; const out = [];
  const groups = {};
  for (const s of swings) (groups[s.type] = groups[s.type] || []).push(s);
  for (const [type, list] of Object.entries(groups)) {
    const name = (single ? (zh ? '這一拍' : 'This swing') : '') + (single ? '' : STROKE_NAMES[type][zh ? 'zh' : 'en']);
    const avg = (key) => { const ms = list.map((s) => s.metrics[key]).filter(Boolean); if (!ms.length) return null; return { v: ms.reduce((a, m) => a + m.v, 0) / ms.length, conf: ms.reduce((a, m) => a + m.conf, 0) / ms.length, n: ms.length }; };
    const avgTxt = single || list.length === 1 ? '' : (zh ? '平均' : 'on average ');
    if (type === 'serve' || type === 'overhead') {
      const a = avg('contactReach'); if (!a) continue;
      const r = rangeFor(type, 'contactReach'); const pct = Math.round(a.v * 100), cm = Math.round(a.v * heightCm);
      let tail, ok = false;
      if (a.v < r[0]) tail = zh ? `偏低，再往上伸展約 ${r5((r[0] - a.v) * heightCm + 3)} 公分，在最高點、身體前上方（約 1 點鐘方向）擊球` : `low - reach about ${r5((r[0] - a.v) * heightCm + 3)} cm higher and hit at the top, up and in front (about 1 o'clock)`;
      else { tail = zh ? '在理想範圍內 ✓' : 'in the ideal range ✓'; ok = true; }
      out.push({ type, ok, lowConf: a.conf < CONF_OK, text: zh ? `${name}擊球點${avgTxt}高於頭部 ${pct}% 身高（約 ${cm} 公分；理想 ≥ ${Math.round(r[0] * 100)}%）：${tail}` : `${name} contact is ${avgTxt}${pct}% of height above the head (about ${cm} cm; ideal ≥ ${Math.round(r[0] * 100)}%): ${tail}` });
      continue;
    }
    const a = avg('contactFront'), h = avg('contactHeight');
    if (a) {
      const r = rangeFor(type, 'contactFront'); const pct = Math.round(a.v * 100), cm = Math.round(Math.abs(a.v) * heightCm);
      const lowConf = a.conf < CONF_OK; let tail, ok = false;
      const where = a.v >= 0 ? (zh ? `在身體前方 ${pct}% 身高（約 ${cm} 公分` : `${pct}% of height in front of the body (about ${cm} cm`) : (zh ? `在身體後方 ${-pct}% 身高（約 ${cm} 公分` : `${-pct}% of height behind the body (about ${cm} cm`);
      if (lowConf) tail = zh ? '從這個拍攝角度，前後距離量不準；想看準擊球點，請從側面或斜側面拍' : 'front-back distance is unreliable from this camera angle; film from the side or a diagonal to check it';
      else if (a.v < r[0]) tail = zh ? `太靠近身體，往前約 ${r5((r[0] - a.v) * heightCm + 5)} 公分` : `too close to the body - move it about ${r5((r[0] - a.v) * heightCm + 5)} cm further in front`;
      else if (a.v > r[1]) tail = zh ? `太前面，讓球再進來約 ${r5((a.v - r[1]) * heightCm + 5)} 公分` : `too far out - let the ball come about ${r5((a.v - r[1]) * heightCm + 5)} cm closer`;
      else { tail = zh ? '在理想範圍內 ✓' : 'in the ideal range ✓'; ok = true; }
      out.push({ type, ok, lowConf, text: zh ? `${name}擊球點${avgTxt}${where}；理想 ${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%）：${tail}` : `${name} contact is ${avgTxt}${where}; ideal ${Math.round(r[0] * 100)}-${Math.round(r[1] * 100)}%): ${tail}` });
    }
    if (h) {
      const r = rangeFor(type, 'contactHeight'); let tail, ok = false;
      if (h.v < r[0]) tail = zh ? '偏低，用膝蓋降低身體，或等球彈到腰胸高度' : 'low - bend your knees or wait for the ball to reach waist-chest height';
      else if (h.v > r[1]) tail = zh ? '偏高，退一步讓球落到腰胸之間' : 'high - step back and let it drop to waist-chest height';
      else { tail = zh ? '在腰到胸之間 ✓' : 'between waist and chest ✓'; ok = true; }
      out.push({ type, ok, lowConf: h.conf < CONF_OK, text: zh ? `${name}擊球高度${avgTxt}在${levelText(h.v, lang)}：${tail}` : `${name} contact height is ${avgTxt}at ${levelText(h.v, lang)}: ${tail}` });
    }
  }
  return out;
}

// Racket verdict lines (averages per stroke type, or one swing). Low-confidence values are
// reported as "not reliable" rather than as advice.
export const RACKET_KEYS = ['racketFace', 'racketHeadHeight', 'swingPath', 'racketDrop', 'racketLag', 'takeBack', 'racketFinish', 'serveDrop'];
export function racketVerdicts(swings, lang, single = false) {
  const zh = lang === 'zh'; const out = []; const groups = {};
  for (const s of swings) (groups[s.type] = groups[s.type] || []).push(s);
  for (const [type, list] of Object.entries(groups)) {
    const prefix = single ? '' : `${STROKE_NAMES[type][zh ? 'zh' : 'en']} · `;
    const weak = [];
    for (const key of RACKET_KEYS) {
      const ms = list.map((s) => s.metrics[key]).filter(Boolean); if (!ms.length) continue;
      const good = ms.filter((m) => m.conf >= CONF_OK);
      const name = METRIC_NAMES[key][zh ? 'zh' : 'en'];
      if (!good.length) { weak.push(name); continue; }
      const v = good.reduce((a, m) => a + m.v, 0) / good.length;
      const m0 = { ...good[0], v };
      const r = rangeFor(type, key); const unitOv = m0.unit === 'pctBH' ? 'pctBH' : undefined;
      const dir = !r ? null : v < r[0] ? 'low' : v > r[1] ? 'high' : null;
      const tx = metricText(key, type); const cue = dir && tx && tx[dir] ? tx[dir].cue[zh ? 'zh' : 'en'] : '';
      out.push({ key, type, ok: !dir, lowConf: false, text: `${prefix}${name}：${fmtValue(m0, lang, type)}（${zh ? '理想' : 'ideal'} ${fmtRange(key, type, lang, unitOv)}）${dir ? (zh ? '　' : ' - ') + cue : ' ✓'}` });
    }
    if (weak.length) out.push({ key: '_weak', type, ok: false, lowConf: true, text: `${prefix}${zh ? '從這個角度／畫質無法可靠判斷：' : 'Not reliable from this angle or video quality: '}${weak.join(zh ? '、' : ', ')}` });
  }
  return out;
}
