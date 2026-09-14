import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/scheduler';
import { db } from './admin';
import { checkReceipts, deliver } from './deliver';
import { loadDueTrainers } from './load';
import { planScheduled } from './planner';

/**
 * Reminders, streak warnings, the coach's quiet-client nudge and the weekly
 * recap. Every send window is a whole local hour, so two runs an hour give
 * each message two chances to go out; the log in deliver() stops the second
 * from sending it again.
 */
export const sendScheduledNotifications = onSchedule(
  // Five minutes rather than the default one: a 7 AM run claims and sends for
  // every coach and client due, a batch at a time.
  { schedule: 'every 30 minutes', timeZone: 'UTC', retryCount: 1, timeoutSeconds: 300 },
  async () => {
    const now = new Date();
    const trainers = await loadDueTrainers(now);
    // One person's malformed data skips only their messages, and says so here.
    const messages = planScheduled(now, trainers, (error, uid) =>
      logger.warn('scheduled notifications skipped for one person', { uid, error })
    );
    const { sent, skipped } = await deliver(db, messages);
    // Receipts for earlier runs' messages: phones that no longer have the app
    // come off their accounts. A failure here must not fail the run.
    const receipts = await checkReceipts(db).catch((error) => {
      logger.warn('push receipts not checked', { error });
      return { checked: 0, removed: 0 };
    });
    logger.info('scheduled notifications', {
      coaches: trainers.length,
      planned: messages.length,
      sent,
      skipped,
      receiptsChecked: receipts.checked,
      tokensRemoved: receipts.removed,
    });
  }
);
