/**
 * The four notification switches, shared by the app's Settings and the Cloud
 * Functions that decide what to send. Every group starts switched on.
 */

export type NotificationGroup = 'reminders' | 'activity' | 'motivation' | 'recap';
export type NotificationPrefs = Record<NotificationGroup, boolean>;

export const NOTIFICATION_GROUPS: readonly NotificationGroup[] = ['reminders', 'activity', 'motivation', 'recap'];

export const DEFAULT_PREFS: NotificationPrefs = {
  reminders: true,
  activity: true,
  motivation: true,
  recap: true,
};

/** Saved preferences with any missing switch filled in, so an older profile never reads as "off". */
export function withDefaults(saved: unknown): NotificationPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (typeof saved === 'object' && saved !== null) {
    for (const group of NOTIFICATION_GROUPS) {
      const value = (saved as Record<string, unknown>)[group];
      if (typeof value === 'boolean') prefs[group] = value;
    }
  }
  return prefs;
}

/** Settings wording, in each side's own terms (from the approved design). */
export function prefLabels(
  role: 'trainer' | 'client',
  coachFirstName: string
): Record<NotificationGroup, { title: string; detail: string }> {
  return role === 'trainer'
    ? {
        reminders: { title: 'Workout reminders', detail: "Today's sessions, at 7 AM" },
        activity: { title: 'Client activity', detail: 'Finished a session, joined' },
        motivation: { title: 'Motivation', detail: "Clients who've gone quiet" },
        recap: { title: 'Weekly recap', detail: 'Mondays at 8 AM' },
      }
    : {
        reminders: { title: 'Workout reminders', detail: 'Your sessions, at 7 AM' },
        activity: {
          title: coachFirstName ? `New workouts from ${coachFirstName}` : 'New workouts',
          detail: 'As soon as one is sent',
        },
        motivation: { title: 'Your streak', detail: 'A nudge before it ends' },
        recap: { title: 'Weekly recap', detail: 'Mondays at 8 AM' },
      };
}
