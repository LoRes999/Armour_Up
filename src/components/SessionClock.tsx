import React, { useEffect, useReducer } from 'react';
import { StyleProp, Text, TextStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { timedMinutes } from '../models';
import { usePalette } from '../theme';
import { Numeric } from './ui';

/**
 * The parts of a live session that change every second.
 *
 * They live in their own components so that only they re-render on the tick.
 * The session screens used to hold the clock themselves, which re-rendered the
 * whole screen every second — and with it the header options, which
 * expo-router passes to navigation.setOptions on every render. On iOS that
 * rebuilt the native header each second, and it fed a "Maximum update depth
 * exceeded" crash when combined with a modal being remounted.
 */

export function elapsedSeconds(startedAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function clockString(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Re-renders the calling component once a second, and nothing else. */
function useSecondTick() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
}

/** Any text that has to stay current — a label that includes the running time. */
export function LiveText({
  render,
  style,
}: {
  render: () => string;
  style?: StyleProp<TextStyle>;
}) {
  useSecondTick();
  return <Text style={style}>{render()}</Text>;
}

/**
 * "● 12:04 elapsed", derived from the session's own start so it survives
 * leaving and returning. Past four hours it stops counting: the session was
 * picked up again later, and "1440:00 elapsed" measured nothing. It saves no
 * time either (timedMinutes).
 */
export function ElapsedClock({ startedAt, suffix = '' }: { startedAt: number; suffix?: string }) {
  const p = usePalette();
  return (
    <LiveText
      style={{ fontSize: 11, fontWeight: '700', color: p.accent, textAlign: 'center' }}
      render={() => `● ${elapsedLabel(startedAt)}${suffix}`}
    />
  );
}

/** "12:04 elapsed", or "Not timed" once the clock is past four hours. */
export function elapsedLabel(startedAt: number, now: number = Date.now()): string {
  return timedMinutes(startedAt, now) === undefined
    ? 'Not timed'
    : `${clockString(elapsedSeconds(startedAt, now))} elapsed`;
}

/**
 * The rest countdown, from a deadline rather than a counter. A counter only
 * moves when the JS timer fires, and timers stop while the phone is locked —
 * so a trainer who locked the phone between sets came back to a countdown
 * frozen where they left it. A deadline is correct whenever it is looked at.
 */
export function RestBanner({ endsAt, total }: { endsAt: number; total: number }) {
  useSecondTick();
  const p = usePalette();
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  if (left <= 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: p.surfaceAlt,
      }}
    >
      <Ionicons name="timer-outline" size={17} color={p.accent} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: p.text }}>Rest</Text>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: p.border }}>
          <View
            style={{
              height: 3,
              borderRadius: 2,
              backgroundColor: p.accent,
              width: `${Math.min(100, (left / total) * 100)}%`,
            }}
          />
        </View>
      </View>
      <Numeric size={17} color={p.accent}>
        {clockString(left)}
      </Numeric>
    </View>
  );
}
