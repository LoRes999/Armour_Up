import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../../src/store';
import { metrics, usePalette } from '../../../src/theme';
import { Card, EmptyState, StatTile } from '../../../src/components/ui';
import {
  CalendarEntry,
  CalendarLegend,
  MonthCalendar,
  MonthHeader,
} from '../../../src/components/MonthCalendar';
import { DayType, isSolo, loggedSets } from '../../../src/models';

/**
 * The training month. Only completed sessions appear — a day either happened
 * or it didn't — and every one of them opens the full session record.
 */
export default function History() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const client = store.currentClient();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const sessions = useMemo(
    () => (client ? store.workoutsFor(client.id).filter((w) => w.status === 'completed') : []),
    [client, store]
  );

  // Day-of-month -> that day's session, for the month on screen.
  const entries = useMemo(() => {
    const map = new Map<number, CalendarEntry>();
    sessions.forEach((workout) => {
      const date = new Date(workout.date);
      if (date.getFullYear() !== cursor.year || date.getMonth() !== cursor.month) return;
      const day = date.getDate();
      // workoutsFor is newest-first, so the first one to claim a day wins.
      if (!map.has(day)) map.set(day, { workout, dayType: store.dayType(workout.dayTypeId) });
    });
    return map;
  }, [sessions, cursor, store]);

  // Counted over every session in the month, not over the calendar cells. One
  // cell holds one session, so totalling the cells silently dropped a whole
  // session's sets and minutes whenever two landed on the same date — which a
  // coached session plus a solo repeat does routinely.
  const monthSessions = useMemo(
    () =>
      sessions.filter((workout) => {
        const date = new Date(workout.date);
        return date.getFullYear() === cursor.year && date.getMonth() === cursor.month;
      }),
    [sessions, cursor]
  );

  const monthTotals = useMemo(() => {
    let sets = 0;
    let minutes = 0;
    monthSessions.forEach((workout) => {
      sets += loggedSets(workout);
      minutes += workout.durationMinutes ?? 0;
    });
    return { sets, minutes, count: monthSessions.length };
  }, [monthSessions]);

  const legend = useMemo(() => {
    const seen = new Map<string, DayType>();
    entries.forEach(({ dayType }) => {
      if (dayType) seen.set(dayType.id, dayType);
    });
    return Array.from(seen.values());
  }, [entries]);

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  // Nothing to see past the current month.
  const canGoNext =
    cursor.year < now.getFullYear() ||
    (cursor.year === now.getFullYear() && cursor.month < now.getMonth());

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: p.background }}
      contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 14 }}
    >
      <Card radius={20} style={{ padding: 13, gap: 12 }}>
        <MonthHeader
          year={cursor.year}
          month={cursor.month}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          canGoNext={canGoNext}
        />

        <MonthCalendar
          year={cursor.year}
          month={cursor.month}
          entries={entries}
          onSelect={(entry) =>
            router.push({
              pathname: '/(client)/history/[id]',
              params: { id: entry.workout.id },
            })
          }
        />

        {legend.length ? (
          <View style={{ marginTop: 2, paddingTop: 11, borderTopWidth: 1, borderTopColor: p.border }}>
            <CalendarLegend
              dayTypes={legend}
              hasSolo={Array.from(entries.values()).some((e) => isSolo(e.workout))}
            />
          </View>
        ) : null}
      </Card>

      {monthTotals.count > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatTile label="SESSIONS" value={String(monthTotals.count)} />
            <StatTile label="SETS" value={String(monthTotals.sets)} />
            <StatTile label="MINUTES" value={String(monthTotals.minutes)} />
          </View>
          <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center' }}>
            Tap any training day to see that session.
          </Text>
        </>
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="Nothing this month"
          message={
            sessions.length
              ? 'Use the arrows to find a month you trained in.'
              : 'Your completed sessions will fill in here.'
          }
        />
      )}
    </ScrollView>
  );
}

