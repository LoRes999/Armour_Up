import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { usePalette } from '../theme';
import { Eyebrow, Numeric } from './ui';
import { WeightUnit, formatIn, trendVerb } from '../models';

// MARK: - Progress ring

export function ProgressRing({
  progress,
  size = 68,
  strokeWidth = 6,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const p = usePalette();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={p.surfaceAlt}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={p.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Numeric size={size * 0.25}>{`${Math.round(clamped * 100)}%`}</Numeric>
    </View>
  );
}

// MARK: - Top-set chart
//
// One series, so no legend is needed — the card title names it. Thin 2px line,
// recessive grid, and tap-to-inspect rather than hover, since this is a phone.

export interface SeriesPoint {
  date: string;
  weight: number;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function TopSetChart({
  points,
  unit,
  width,
}: {
  points: SeriesPoint[];
  unit: WeightUnit;
  width: number;
}) {
  const p = usePalette();
  const [selected, setSelected] = useState<number | null>(null);
  const height = 150;
  const padX = 10;
  const padTop = 14;
  const padBottom = 26;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.weight);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = (high - low) * 0.25 || 5;
    const min = low - pad;
    const max = high + pad;

    const innerWidth = width - padX * 2;
    const innerHeight = height - padTop - padBottom;
    const step = innerWidth / (points.length - 1);

    const coords = points.map((point, index) => ({
      x: padX + index * step,
      y: padTop + innerHeight - ((point.weight - min) / (max - min)) * innerHeight,
    }));

    const line = coords
      .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(' ');

    const baseline = padTop + innerHeight;
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${baseline} L${padX},${baseline} Z`;

    return { coords, line, area, baseline, innerHeight };
  }, [points, width]);

  // Clamped, because `selected` is a bare index that outlives the array it
  // indexes: switching to a movement with fewer sessions leaves it out of range.
  const activeIndex =
    selected !== null && selected >= 0 && selected < points.length ? selected : points.length - 1;
  const active = points[activeIndex];
  const gain =
    points.length > 1 && points[points.length - 1].weight > points[0].weight
      ? points[points.length - 1].weight - points[0].weight
      : null;

  if (!geometry || !active) {
    return null;
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Eyebrow>{`TOP SET · ${points.length} SESSIONS`}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
            <Numeric size={30}>{formatIn(active.weight, unit)}</Numeric>
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.dim }}>{unit}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {gain !== null ? (
            <Numeric size={12} color={p.success}>
              {`+${formatIn(gain, unit)} ${unit}`}
            </Numeric>
          ) : null}
          <Text style={{ fontSize: 11, fontWeight: '600', color: p.dim, marginTop: 1 }}>
            {shortDate(active.date)}
          </Text>
        </View>
      </View>

      <View
        style={{ marginTop: 10 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Top set over ${points.length} sessions. ${formatIn(
          points[0].weight,
          unit
        )} ${unit} on ${shortDate(points[0].date)}, ${trendVerb(
          points[0].weight,
          points[points.length - 1].weight
        )} ${formatIn(
          points[points.length - 1].weight,
          unit
        )} ${unit} on ${shortDate(points[points.length - 1].date)}.`}
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.accent} stopOpacity={0.22} />
              <Stop offset="1" stopColor={p.accent} stopOpacity={0.01} />
            </LinearGradient>
          </Defs>

          {[0, 0.5, 1].map((fraction) => {
            const y = padTop + geometry.innerHeight * fraction;
            return (
              <Line key={fraction} x1={padX} y1={y} x2={width - padX} y2={y} stroke={p.border} strokeWidth={1} />
            );
          })}

          <Path d={geometry.area} fill="url(#fade)" />
          <Path
            d={geometry.line}
            stroke={p.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {geometry.coords.map((coord, index) => (
            <Circle
              key={index}
              cx={coord.x}
              cy={coord.y}
              r={index === activeIndex ? 5.5 : 4}
              fill={index === activeIndex ? p.accent : p.surfaceAlt}
              stroke={p.surface}
              strokeWidth={2}
            />
          ))}
        </Svg>

        {/* Tap targets are wider than the dots, so a thumb can hit them. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height, flexDirection: 'row' }}>
          {points.map((point, index) => (
            <Pressable
              key={index}
              onPress={() => setSelected(index)}
              accessibilityRole="button"
              accessibilityLabel={`${formatIn(point.weight, unit)} ${unit} on ${shortDate(
                point.date
              )}`}
              accessibilityState={{ selected: index === activeIndex }}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -18 }}
      >
        <Text style={{ fontSize: 9, fontWeight: '700', color: p.dim }}>
          {shortDate(points[0].date).toUpperCase()}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: p.dim }}>
          {shortDate(points[points.length - 1].date).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
