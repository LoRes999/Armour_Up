import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/scheduler';
import { db } from './admin';
import { deliver } from './deliver';
import { loadDueTrainers } from './load';
import { planScheduled } from './planner';

/**
 * Reminders, streak warnings, the coach's quiet-client nudge and the weekly
 * recap. Every send window is a whole local hour, so two runs an hour give
 * each message two chances to go out; the log in deliver() stops the second
 * from sending it again.
 */
export const sendScheduledNotifications = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', retryCount: 1 },
  async () => {
    const now = new Date();
    const trainers = await loadDueTrainers(now);
    const messages = planScheduled(now, trainers);
    const { sent, skipped } = await deliver(db, messages);
    logger.info('scheduled notifications', {
      coaches: trainers.length,
      planned: messages.length,
      sent,
      skipped,
    });
  }
);
