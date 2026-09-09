import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { metrics, tagColor, usePalette } from '../theme';
import { DayType, Workout, isSolo } from '../models';

/**
 * A real month grid rather than a contribution heatmap: a trained day carries
 * its day type's colour and short label, so the month reads as a training
 * schedule at a glance. Untrained days stay quiet.
 */

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface CalendarEntry {
  workout: Workout;
  dayType?: DayType;
}

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export function MonthCalendar({
  year,
  month,
  entries,
  onSelect,
}: {
  year: number;
  month: number;
  /** Keyed by day-of-month (1-31). */
  entries: Map<number, CalendarEntry>;
  onSelect: (entry: CalendarEntry) => void;
}) {
  const p = usePalette();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = leadingBlanks(year, month);
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  // Pad to whole weeks so every row has seven cells.
  const cells: (number | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((label, index) => (
          <View key={`${label}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: p.dim }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row', gap: 4 }}>
          {cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            if (day === null) {
              return <View key={`blank-${index}`} style={{ flex: 1, height: 52 }} />;
            }

            const entry = entries.get(day);
            const color = entry ? tagColor(p, entry.dayType?.colorIndex ?? 0) : p.dim;
            const isToday = isThisMonth && today.getDate() === day;

            const body = (
              <View
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 10,
                  paddingTop: 5,
                  paddingHorizontal: 2,
                  alignItems: 'center',
                  backgroundColor: entry ? p.surface : 'transparent',
                  borderWidth: 1,
                  borderColor: entry ? p.border : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? '900' : '700',
                    color: entry ? p.text : p.dim,
                    opacity: entry ? 1 : 0.55,
                    textDecorationLine: isToday ? 'underline' : 'none',
                  }}
                >
                  {day}
                </Text>

                {entry ? (
                  <>
                    {/* Same kind of day, different author: a solo session keeps
                        its day type's colour but draws the bar hollow, which
                        costs no layout inside a 52pt cell. */}
                    <View
                      style={{
                        height: 3,
                        alignSelf: 'stretch',
                        marginTop: 4,
                        marginHorizontal: 3,
                        borderRadius: 2,
                        backgroundColor: isSolo(entry.workout) ? 'transparent' : color,
                        borderWidth: isSolo(entry.workout) ? 1 : 0,
                        borderColor: color,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 8,
                        fontWeight: '800',
                        letterSpacing: 0.2,
                        marginTop: 3,
                        color,
                      }}
                    >
                      {entry.dayType?.shortLabel ?? '•'}
                    </Text>
                  </>
                ) : null}
              </View>
            );

            return entry ? (
              <Pressable
                key={day}
                onPress={() => onSelect(entry)}
                style={{ flex: 1, flexDirection: 'row' }}
              >
                {body}
              </Pressable>
            ) : (
              <View key={day} style={{ flex: 1, flexDirection: 'row' }}>
                {body}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Month name with arrows either side. */
export function MonthHeader({
  year,
  month,
  onPrevious,
  onNext,
  canGoNext,
}: {
  year: number;
  month: number;
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  const p = usePalette();
  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const arrow = (name: 'chevron-back' | 'chevron-forward', onPress: () => void, enabled: boolean) => (
    <Pressable
      onPress={enabled ? onPress : undefined}
      style={{
        width: metrics.hitTarget,
        height: metrics.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enabled ? 1 : 0.3,
      }}
    >
      <Ionicons name={name} size={18} color={p.accent} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {arrow('chevron-back', onPrevious, true)}
      <Text
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 17,
          fontWeight: '800',
          letterSpacing: -0.3,
          color: p.text,
        }}
      >
        {label}
      </Text>
      {arrow('chevron-forward', onNext, canGoNext)}
    </View>
  );
}

/** Names the colours used in the month currently on screen. */
export function CalendarLegend({
  dayTypes,
  hasSolo,
}: {
  dayTypes: DayType[];
  hasSolo?: boolean;
}) {
  const p = usePalette();
  if (!dayTypes.length && !hasSolo) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {dayTypes.map((dayType) => (
        <View key={dayType.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              backgroundColor: tagColor(p, dayType.colorIndex),
            }}
          />
          <Text style={{ fontSize: 11, fontWeight: '600', color: p.dim }}>{dayType.name}</Text>
        </View>
      ))}
      {hasSolo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: p.dim,
            }}
          />
          <Text style={{ fontSize: 11, fontWeight: '600', color: p.dim }}>Trained solo</Text>
        </View>
      ) : null}
    </View>
  );
}
