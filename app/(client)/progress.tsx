import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { Card, EmptyState, Eyebrow, Numeric, Title } from '../../src/components/ui';
import { TopSetChart } from '../../src/components/charts';
import { DEFAULT_UNIT, formatIn } from '../../src/models';

export default function Progress() {
  const p = usePalette();
  const store = useStore();
  const { width } = useWindowDimensions();
  const [movement, setMovement] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);

  const client = store.currentClient();
  const unit = client?.unit ?? DEFAULT_UNIT;
  // Every trained movement, in the scrolling row: capped at six, a client's
  // newest record could be on a lift with no chip to chart it (Ryan's call,
  // 2026-09-13).
  const movements = client ? store.trainedMovements(client.id) : [];
  const active = movement ?? movements[0];
  const points = client && active ? store.topSetSeries(client.id, active) : [];
  const allRecords = client ? store.personalRecords(client.id) : [];
  const records = showAllRecords ? allRecords : allRecords.slice(0, 5);

  // Card is inset by the screen padding and its own 16pt padding on both sides.
  const chartWidth = width - metrics.screenPadding * 2 - 32;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 14 }}
      >
        <Title>Progress</Title>

        {movements.length === 0 ? (
          <EmptyState
            icon="analytics-outline"
            title="Nothing to chart yet"
            message="Once your coach logs a few sessions, your progress shows up here."
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {movements.map((name) => {
                  const on = name === active;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setMovement(name)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      // 34pt chips: the slop makes the target 44pt on a phone.
                      hitSlop={5}
                      style={{
                        height: 34,
                        paddingHorizontal: 13,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? p.accent : p.surfaceAlt,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: on ? p.onAccent : p.dim }}>
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {points.length < 2 ? (
              <Card radius={20}>
                <EmptyState
                  icon="stats-chart-outline"
                  title="Not enough sessions"
                  message="Two logged sessions are needed before a trend means anything."
                />
              </Card>
            ) : (
              <Card radius={20} style={{ padding: 16 }}>
                {/* Keyed on the movement so a point selected on one lift does
                    not carry its index over to the next. */}
                <TopSetChart key={active} points={points} unit={unit} width={chartWidth} />
              </Card>
            )}

            {records.length > 0 ? (
              <View style={{ gap: 9 }}>
                <Eyebrow>PERSONAL RECORDS</Eyebrow>
                {records.map((record) => (
                  <Card
                    key={record.movementName}
                    radius={15}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 13,
                      paddingVertical: 11,
                      minHeight: 56,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        backgroundColor: p.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="trending-up" size={15} color={p.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>
                        {record.movementName}
                      </Text>
                      <Text style={{ fontSize: 11, color: p.dim }}>
                        {record.previousWeight !== undefined
                          ? `${new Date(record.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · was ${formatIn(record.previousWeight, unit)} ${unit}`
                          : `${new Date(record.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · first recorded`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Numeric size={16}>{formatIn(record.weight, unit)}</Numeric>
                      <Eyebrow>{`${unit.toUpperCase()} × ${record.reps}`}</Eyebrow>
                    </View>
                  </Card>
                ))}
                {!showAllRecords && allRecords.length > records.length ? (
                  <Pressable
                    onPress={() => setShowAllRecords(true)}
                    accessibilityRole="button"
                    style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>Show all</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
