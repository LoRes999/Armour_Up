/**
 * Reference copy for the built-in catalogue. Written to be read by a client
 * mid-session, so descriptions stay short and the cues are the things a coach
 * actually says out loud.
 *
 * Trainer-authored movements live in the store as `CustomMovement` and are
 * rendered by the same screen.
 */

export interface MovementInfo {
  name: string;
  description: string;
  cues: string[];
  muscles: string[];
}

export const MOVEMENT_LIBRARY: MovementInfo[] = [
  {
    name: 'Barbell Bench Press',
    description:
      'The primary horizontal press. Lying on a flat bench, the bar travels from over the shoulders down to the lower chest and back. It loads more weight than any other chest movement, which is why it anchors most push days.',
    cues: [
      'Shoulder blades pulled back and down into the bench',
      'Bar touches the lower chest, not the throat',
      'Drive the feet into the floor as you press',
      'Wrists stacked over the elbows throughout',
    ],
    muscles: ['Chest', 'Front delt', 'Triceps'],
  },
  {
    name: 'Incline DB Press',
    description:
      'A pressing angle of roughly 30 degrees that shifts work toward the upper chest and front delt. Dumbbells let each arm travel its own path, so the shoulder finds a more comfortable groove than a fixed bar allows.',
    cues: [
      'Set the bench near 30 degrees, not steeper',
      'Lower until you feel a stretch across the upper chest',
      'Press up and slightly together at the top',
      'Keep the ribs down — do not arch to move weight',
    ],
    muscles: ['Upper chest', 'Front delt', 'Triceps'],
  },
  {
    name: 'Cable Lateral Raise',
    description:
      'An isolation movement for the side delt. The cable keeps tension on the muscle at the bottom of the range, where a dumbbell goes light — which is exactly where the side delt is hardest to load.',
    cues: [
      'Lead with the elbow, not the hand',
      'Stop at shoulder height',
      'Keep a soft, fixed bend in the elbow',
      'Slow on the way down — this is not a swing',
    ],
    muscles: ['Side delt'],
  },
  {
    name: 'Overhead Triceps Ext.',
    description:
      'An extension performed with the arms overhead, which puts the long head of the triceps on stretch. That stretched position is where most of the growth stimulus comes from, so range of motion matters more than load here.',
    cues: [
      'Upper arms stay put; only the forearms move',
      'Lower until you feel the stretch behind the arm',
      'Elbows track forward, not flared wide',
      'Do not let the lower back arch',
    ],
    muscles: ['Triceps'],
  },
  {
    name: 'Back Squat',
    description:
      'The bar sits across the upper back and the lifter squats to at least parallel. It loads the whole lower body at once and carries most of the systemic fatigue in a training week, so it usually goes first in a session.',
    cues: [
      'Brace the whole midsection before you unrack',
      'Sit between the hips, not straight back',
      'Knees track over the middle of the foot',
      'Drive the whole foot through the floor',
    ],
    muscles: ['Quads', 'Glutes', 'Adductors', 'Spinal erectors'],
  },
  {
    name: 'Romanian Deadlift',
    description:
      'A hip hinge from the top down. The knees stay mostly fixed while the hips travel back, loading the hamstrings under stretch. The bar never returns to the floor, so tension stays on the muscle the whole set.',
    cues: [
      'Push the hips back, do not bend the knees more',
      'Bar stays in contact with the thighs',
      'Stop when the hamstrings stop, not when the bar hits the floor',
      'Neutral spine from head to hips',
    ],
    muscles: ['Hamstrings', 'Glutes', 'Spinal erectors'],
  },
  {
    name: 'Leg Press',
    description:
      'A machine press for the lower body with the back supported. Removing the balance and bracing demand of a squat means the legs can be pushed closer to failure with less overall fatigue.',
    cues: [
      'Lower until the hips are about to round off the pad',
      'Do not lock the knees hard at the top',
      'Feet mid-platform, knees tracking over the toes',
      'Control the negative — no bouncing off the stack',
    ],
    muscles: ['Quads', 'Glutes'],
  },
  {
    name: 'Deadlift',
    description:
      'A pull from the floor to a standing lockout. It trains the posterior chain against the heaviest loads of any lift, which makes it both the most productive and the most fatiguing movement in a programme.',
    cues: [
      'Take the slack out of the bar before you pull',
      'Bar stays against the legs the entire way',
      'Push the floor away rather than yanking up',
      'Finish standing tall — no leaning back',
    ],
    muscles: ['Hamstrings', 'Glutes', 'Spinal erectors', 'Lats', 'Traps'],
  },
  {
    name: 'Barbell Row',
    description:
      'A horizontal pull with the torso bent forward. It builds mid-back thickness and balances out the pressing volume of a push day, which is why most programmes match rows to presses.',
    cues: [
      'Hinge to roughly 45 degrees and hold it',
      'Pull to the lower ribs, not the collarbone',
      'Elbows drive back past the torso',
      'No jerking the torso up to start the rep',
    ],
    muscles: ['Lats', 'Rhomboids', 'Rear delt', 'Biceps'],
  },
  {
    name: 'Lat Pulldown',
    description:
      'A vertical pull that trains the lats through a full overhead range. Adjustable load makes it the practical way to accumulate pulling volume before chin-ups are achievable for reps.',
    cues: [
      'Start with the arms fully overhead and the lats stretched',
      'Pull the bar to the upper chest',
      'Drive the elbows down toward the hips',
      'Let the bar rise all the way back up',
    ],
    muscles: ['Lats', 'Biceps', 'Mid-back'],
  },
  {
    name: 'DB Curl',
    description:
      'Direct elbow flexion for the biceps. Dumbbells allow the forearm to rotate through the rep, which recruits the biceps more completely than a fixed grip does.',
    cues: [
      'Keep the elbows at your sides',
      'Supinate — turn the palm up as you curl',
      'Do not swing the torso to start the rep',
      'Lower under control to a full stretch',
    ],
    muscles: ['Biceps', 'Brachialis', 'Forearms'],
  },
  {
    name: 'Overhead Press',
    description:
      'A strict press from the shoulders to a locked-out position overhead. Standing means the whole body has to brace, which makes it a genuine test of pressing strength rather than just shoulder size.',
    cues: [
      'Squeeze the glutes to stop the lower back arching',
      'Move the head back so the bar can pass the face',
      'Finish with the bar over the middle of the foot',
      'Shrug the shoulders up at lockout',
    ],
    muscles: ['Front delt', 'Side delt', 'Triceps', 'Upper chest'],
  },
];

export function movementInfo(name: string): MovementInfo | undefined {
  return MOVEMENT_LIBRARY.find((m) => m.name.toLowerCase() === name.toLowerCase());
}
