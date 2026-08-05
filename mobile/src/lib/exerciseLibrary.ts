import type { SessionType } from './strengthTypes';

export interface ExerciseDefinition {
  name:           string;
  primaryMuscles: string[];
  // Short how-to, 1–2 sentences.
  description:    string;
  // Eccentric-pause-concentric seconds, e.g. "3-1-1"; "explosive" for power
  // lifts; "hold" for isometrics.
  tempo:          string;
  // 2–3 short form cues.
  cues:           string[];
}

export const EXERCISE_LIBRARY: Record<SessionType, ExerciseDefinition[]> = {
  lower: [
    {
      name: 'Romanian Deadlift', primaryMuscles: ['hamstrings', 'glutes', 'lower back'],
      description: 'Hinge at the hips with soft knees, lowering the bar down the thighs until you feel a hamstring stretch, then drive the hips forward to stand.',
      tempo: '3-1-1',
      cues: ['Push hips back, not down', 'Keep the bar close to your legs', 'Flat back throughout'],
    },
    {
      name: 'Hip Thrust', primaryMuscles: ['glutes', 'hamstrings'],
      description: 'With upper back on a bench and a bar over the hips, drive through the heels to lift the hips until the torso is parallel to the floor.',
      tempo: '2-1-1',
      cues: ['Squeeze glutes at the top', 'Ribs down, chin tucked', 'Push through the heels'],
    },
    {
      name: 'Bulgarian Split Squat', primaryMuscles: ['quads', 'glutes', 'hamstrings'],
      description: 'With the rear foot elevated on a bench, lower straight down until the front thigh is parallel, then drive up through the front heel.',
      tempo: '3-0-1',
      cues: ['Weight in the front heel', 'Torso tall, slight forward lean', 'Front knee tracks over toes'],
    },
    {
      name: 'Goblet Squat', primaryMuscles: ['quads', 'glutes', 'core'],
      description: 'Hold a dumbbell or kettlebell at chest height and squat between the knees, keeping the chest up and elbows inside the thighs.',
      tempo: '3-0-1',
      cues: ['Elbows brush the inner knees', 'Chest proud', 'Sit between your feet'],
    },
    {
      name: 'Sumo Deadlift', primaryMuscles: ['glutes', 'hamstrings', 'adductors'],
      description: 'With a wide stance and toes turned out, grip inside the knees and push the floor away to stand tall, keeping the bar close.',
      tempo: '2-0-1',
      cues: ['Spread the floor with your feet', 'Chest up, back flat', 'Bar glides up the shins'],
    },
    {
      name: 'Box Step-up', primaryMuscles: ['quads', 'glutes'],
      description: 'Step onto a knee-height box, driving through the top leg to stand fully, then lower under control.',
      tempo: '2-0-1',
      cues: ['Drive through the top heel', 'Stand tall at the top', 'Control the way down'],
    },
    {
      name: 'Reverse Lunge', primaryMuscles: ['quads', 'glutes', 'hamstrings'],
      description: 'Step one foot back and lower the back knee toward the floor, then push through the front heel to return to standing.',
      tempo: '2-0-1',
      cues: ['Step straight back', 'Front knee over the ankle', 'Torso upright'],
    },
    {
      name: 'Walking Lunge', primaryMuscles: ['quads', 'glutes', 'hamstrings'],
      description: 'Step forward into a lunge until both knees are ~90°, then drive up and forward into the next step.',
      tempo: '2-0-1',
      cues: ['Long, controlled steps', 'Knee tracks over the toes', 'Push through the front heel'],
    },
    {
      name: 'Leg Press', primaryMuscles: ['quads', 'glutes'],
      description: 'Press the platform away through mid-foot until the legs are nearly straight, then lower until the knees reach ~90°.',
      tempo: '3-0-1',
      cues: ['Feet shoulder-width', 'Do not lock the knees', 'Lower back stays on the pad'],
    },
    {
      name: 'Leg Extension', primaryMuscles: ['quads'],
      description: 'Seated, extend the knees to straighten the legs against the pad, then lower under control.',
      tempo: '2-1-2',
      cues: ['Squeeze the quads at the top', 'Slow on the way down', 'Keep hips on the seat'],
    },
    {
      name: 'Hamstring Curl', primaryMuscles: ['hamstrings'],
      description: 'Curl the pad toward the glutes by bending the knees, then lower slowly to full stretch.',
      tempo: '2-1-2',
      cues: ['Squeeze at full bend', 'Control the eccentric', 'Hips stay down'],
    },
    {
      name: 'Nordic Curl', primaryMuscles: ['hamstrings'],
      description: 'Kneeling with ankles anchored, lower the torso toward the floor as slowly as possible, then pull back up using the hamstrings.',
      tempo: '4-0-1',
      cues: ['Resist the descent', 'Hips extended, body straight', 'Catch and push back up'],
    },
    {
      name: 'Glute Bridge', primaryMuscles: ['glutes', 'hamstrings'],
      description: 'Lying on your back with knees bent, drive through the heels to lift the hips until the body forms a straight line.',
      tempo: '2-1-1',
      cues: ['Squeeze glutes at the top', 'Ribs down', 'Push through the heels'],
    },
    {
      name: 'Calf Raise', primaryMuscles: ['calves'],
      description: 'Rise onto the balls of the feet to full height, then lower the heels below the step for a full stretch.',
      tempo: '2-1-2',
      cues: ['Full range top to bottom', 'Pause at the top', 'Slow on the drop'],
    },
    {
      name: 'Lateral Band Walk', primaryMuscles: ['glutes', 'hip abductors'],
      description: 'With a band around the legs, take controlled steps sideways in a quarter-squat, keeping constant tension on the band.',
      tempo: 'steady',
      cues: ['Stay low in a quarter squat', 'Toes point forward', 'Keep the band tight'],
    },
    {
      name: 'Sissy Squat', primaryMuscles: ['quads'],
      description: 'Rise onto the toes and lean the torso back as the knees travel forward, lowering under control, then return to standing.',
      tempo: '3-1-1',
      cues: ['Knees travel forward', 'Hips and torso in one line', 'Move slowly and controlled'],
    },
  ],
  upper: [
    {
      name: 'Dumbbell Row', primaryMuscles: ['lats', 'rhomboids', 'biceps'],
      description: 'Hinged at the hips, pull the dumbbells to the ribs by driving the elbows back, then lower to a full stretch.',
      tempo: '2-1-2',
      cues: ['Lead with the elbow', 'Squeeze the shoulder blades', 'Flat back, braced core'],
    },
    {
      name: 'Single-arm Row', primaryMuscles: ['lats', 'rhomboids', 'biceps'],
      description: 'With one hand and knee on a bench, row the dumbbell to the hip, keeping the torso square to the floor.',
      tempo: '2-1-2',
      cues: ['Pull to the hip, not the chest', 'No torso rotation', 'Full stretch at the bottom'],
    },
    {
      name: 'Lat Pulldown', primaryMuscles: ['lats', 'biceps'],
      description: 'Pull the bar to the upper chest by driving the elbows down and back, then return under control to a full stretch.',
      tempo: '2-1-2',
      cues: ['Drive elbows to the floor', 'Chest up, slight lean back', 'Control the bar back up'],
    },
    {
      name: 'Seated Cable Row', primaryMuscles: ['rhomboids', 'lats', 'biceps'],
      description: 'Sitting tall, pull the handle to the stomach by retracting the shoulder blades, then extend the arms to a full stretch.',
      tempo: '2-1-2',
      cues: ['Squeeze the shoulder blades', 'Tall torso, no rocking', 'Elbows stay close'],
    },
    {
      name: 'Bench Press', primaryMuscles: ['chest', 'triceps', 'anterior deltoid'],
      description: 'Lower the bar to the mid-chest with elbows tucked ~45°, then press back up to lockout.',
      tempo: '3-1-1',
      cues: ['Shoulder blades pinched down', 'Elbows at ~45°', 'Touch the mid-chest'],
    },
    {
      name: 'Incline Dumbbell Press', primaryMuscles: ['upper chest', 'triceps', 'anterior deltoid'],
      description: 'On a 30–45° incline, press the dumbbells up and slightly together, then lower to the upper-chest line.',
      tempo: '3-0-1',
      cues: ['Wrists stacked over elbows', 'Lower to the collarbone line', 'Do not clash at the top'],
    },
    {
      name: 'Chest Fly', primaryMuscles: ['chest', 'anterior deltoid'],
      description: 'With a slight elbow bend, open the arms in a wide arc until you feel a chest stretch, then bring them back together.',
      tempo: '3-1-1',
      cues: ['Slight, fixed elbow bend', 'Hug the arc', 'Stretch, then squeeze'],
    },
    {
      name: 'Overhead Press', primaryMuscles: ['deltoids', 'triceps', 'upper traps'],
      description: 'From shoulder height, press the weight overhead to lockout, moving the head through as the bar passes, then lower to the shoulders.',
      tempo: '2-0-1',
      cues: ['Brace the core, glutes tight', 'Bar over the mid-foot at lockout', 'Ribs down, no back arch'],
    },
    {
      name: 'Arnold Press', primaryMuscles: ['deltoids', 'triceps'],
      description: 'Start with palms facing you at chest height, rotate the palms out as you press overhead, then reverse on the way down.',
      tempo: '2-0-2',
      cues: ['Smooth rotation as you press', 'Ribs down', 'Control the descent'],
    },
    {
      name: 'Lateral Raise', primaryMuscles: ['lateral deltoid'],
      description: 'With a slight elbow bend, raise the dumbbells out to the sides to shoulder height, then lower slowly.',
      tempo: '2-0-2',
      cues: ['Lead with the elbows', 'Stop at shoulder height', 'No swinging'],
    },
    {
      name: 'Reverse Fly', primaryMuscles: ['rear deltoids', 'rhomboids'],
      description: 'Hinged forward, raise the dumbbells out to the sides by squeezing the shoulder blades, then lower under control.',
      tempo: '2-1-2',
      cues: ['Squeeze the shoulder blades', 'Thumbs slightly down', 'No momentum'],
    },
    {
      name: 'Face Pull', primaryMuscles: ['rear deltoids', 'rotator cuff', 'upper traps'],
      description: 'Pull a rope toward the face, splitting the hands apart and rotating so the knuckles finish beside the ears.',
      tempo: '2-1-2',
      cues: ['Pull to the forehead', 'Elbows high', 'Split the rope at the end'],
    },
    {
      name: 'Band Pull-apart', primaryMuscles: ['rear deltoids', 'rhomboids'],
      description: 'Holding a band at shoulder height, pull it apart until it touches the chest by squeezing the shoulder blades, then return slowly.',
      tempo: '2-1-2',
      cues: ['Arms stay straight', 'Squeeze the mid-back', 'Slow return'],
    },
    {
      name: 'Bicep Curl', primaryMuscles: ['biceps'],
      description: 'With elbows pinned to the sides, curl the weight to the shoulders, then lower under control to full extension.',
      tempo: '2-1-2',
      cues: ['Elbows stay pinned', 'No swinging', 'Full stretch at the bottom'],
    },
    {
      name: 'Hammer Curl', primaryMuscles: ['biceps', 'brachialis'],
      description: 'Curl the dumbbells with a neutral (palms-facing) grip to the shoulders, then lower slowly.',
      tempo: '2-1-2',
      cues: ['Neutral grip throughout', 'Elbows pinned', 'Control the descent'],
    },
    {
      name: 'Tricep Extension', primaryMuscles: ['triceps'],
      description: 'Keeping the upper arms fixed, extend the elbows to straighten the arms, then bend back to a full stretch.',
      tempo: '2-1-2',
      cues: ['Only the forearms move', 'Squeeze at lockout', 'Full stretch at the top of the bend'],
    },
    {
      name: 'Skull Crusher', primaryMuscles: ['triceps'],
      description: 'Lying down, lower the bar toward the forehead by bending the elbows, then extend to lockout.',
      tempo: '3-0-1',
      cues: ['Upper arms stay vertical', 'Elbows point forward', 'Lower under control'],
    },
    {
      name: 'Push-up', primaryMuscles: ['chest', 'triceps', 'anterior deltoid'],
      description: 'In a rigid plank, lower the chest to the floor with elbows ~45°, then press back to a straight-arm position.',
      tempo: '2-1-1',
      cues: ['Body in one line', 'Elbows at ~45°', 'Full lockout at the top'],
    },
  ],
  general: [
    {
      name: 'Deadlift', primaryMuscles: ['hamstrings', 'glutes', 'lower back', 'traps'],
      description: 'With the bar over the mid-foot, hinge and bend to grip it, then push the floor away and stand tall, keeping the bar against the legs.',
      tempo: '2-0-1',
      cues: ['Bar over mid-foot', 'Take the slack out first', 'Push the floor away'],
    },
    {
      name: 'Barbell Back Squat', primaryMuscles: ['quads', 'glutes', 'hamstrings', 'core'],
      description: 'With the bar on the upper back, break at the hips and knees to squat to depth, then drive up through the mid-foot.',
      tempo: '3-0-1',
      cues: ['Brace before you descend', 'Knees track over the toes', 'Drive the floor away'],
    },
    {
      name: 'Front Squat', primaryMuscles: ['quads', 'glutes', 'core'],
      description: 'With the bar racked on the front of the shoulders, squat down keeping the torso upright, then drive up to stand.',
      tempo: '3-0-1',
      cues: ['Elbows high', 'Stay tall through the chest', 'Sit straight down'],
    },
    {
      name: 'Pull-up', primaryMuscles: ['lats', 'biceps', 'core'],
      description: 'Hanging from a bar, pull the chest toward the bar by driving the elbows down, then lower to a full hang.',
      tempo: '2-1-2',
      cues: ['Drive elbows to the ribs', 'Chest to the bar', 'Control the descent'],
    },
    {
      name: 'Dip', primaryMuscles: ['chest', 'triceps', 'anterior deltoid'],
      description: 'Supporting your weight on parallel bars, lower until the shoulders are just below the elbows, then press back to lockout.',
      tempo: '3-0-1',
      cues: ['Slight forward lean', 'Elbows track back', 'Lower under control'],
    },
    {
      name: 'Power Clean', primaryMuscles: ['glutes', 'hamstrings', 'traps', 'core'],
      description: 'Explosively extend the hips to pull the bar up, then drop under it to catch on the front of the shoulders in a quarter squat.',
      tempo: 'explosive',
      cues: ['Explode through the hips', 'Fast elbows to catch', 'Land in a stable quarter squat'],
    },
    {
      name: 'Hang Clean', primaryMuscles: ['glutes', 'hamstrings', 'traps'],
      description: 'From the hang at the knees, explosively extend the hips and shrug to pull the bar up, then catch it on the shoulders.',
      tempo: 'explosive',
      cues: ['Violent hip extension', 'Keep the bar close', 'Fast turnover to the catch'],
    },
    {
      name: 'Kettlebell Swing', primaryMuscles: ['glutes', 'hamstrings', 'core'],
      description: 'Hinge to hike the bell back between the legs, then snap the hips forward to float it to chest height.',
      tempo: 'explosive',
      cues: ['Power from the hips, not the arms', 'Snap the glutes at the top', 'Bell floats, arms relaxed'],
    },
    {
      name: "Farmer's Carry", primaryMuscles: ['forearms', 'traps', 'core'],
      description: 'Hold a heavy weight in each hand and walk with tall posture and braced core for the prescribed distance or time.',
      tempo: 'hold',
      cues: ['Stand tall, shoulders back', 'Brace the core', 'Short, steady steps'],
    },
    {
      name: 'Sled Push', primaryMuscles: ['quads', 'glutes', 'calves', 'core'],
      description: 'With arms extended and a forward body lean, drive the sled forward with powerful, alternating leg strides.',
      tempo: 'steady',
      cues: ['Low forward lean', 'Full leg drive each step', 'Keep a strong, braced trunk'],
    },
    {
      name: 'Box Jump', primaryMuscles: ['quads', 'glutes', 'calves'],
      description: 'Dip and swing the arms, then jump onto the box landing softly in a quarter squat; step back down to reset.',
      tempo: 'explosive',
      cues: ['Explode up, land soft', 'Land in a quarter squat', 'Step down, do not jump down'],
    },
    {
      name: 'Battle Ropes', primaryMuscles: ['shoulders', 'core', 'forearms'],
      description: 'In an athletic stance, drive the ropes up and down (or in waves) continuously for the prescribed time.',
      tempo: 'steady',
      cues: ['Stay low and braced', 'Fast, continuous waves', 'Power from the whole body'],
    },
    {
      name: 'Turkish Get-up', primaryMuscles: ['core', 'shoulders', 'glutes'],
      description: 'Pressing a weight overhead, move step-by-step from lying to standing and back down, keeping the arm locked out throughout.',
      tempo: 'steady',
      cues: ['Eyes on the weight', 'Move one step at a time', 'Keep the arm locked and vertical'],
    },
    {
      name: 'Plank', primaryMuscles: ['core', 'transverse abdominis'],
      description: 'Hold a rigid straight-body position on the forearms and toes for the prescribed time.',
      tempo: 'hold',
      cues: ['Body in one straight line', 'Squeeze glutes and brace', 'Ribs down, no sagging hips'],
    },
  ],
};

// Flat name → definition map, built once, for looking up instructional content
// by exercise name at display time (the persisted plan structure stays lean).
const META_BY_NAME: Record<string, ExerciseDefinition> = Object.values(EXERCISE_LIBRARY)
  .flat()
  .reduce((acc, def) => { acc[def.name] = def; return acc; }, {} as Record<string, ExerciseDefinition>);

/** Look up description/tempo/cues for an exercise by name. Undefined if unknown. */
export function getExerciseMeta(name: string): ExerciseDefinition | undefined {
  return META_BY_NAME[name];
}
