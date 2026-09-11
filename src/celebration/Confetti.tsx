import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

/**
 * Confetti falling from the top of the screen.
 *
 * Built on React Native's own Animated rather than a library, so it runs the
 * same in Safari and in Expo Go with nothing to install. The reanimated copy in
 * node_modules is a stray peer dependency at a version Expo Go does not ship.
 *
 * One animated value drives every piece: each piece maps its own slice of the
 * timeline onto a fall, a drift, a spin and a flutter. A hundred-odd
 * Animated.Values would work too, but one timeline is one thing to start, stop
 * and clean up.
 */

export type ConfettiSize = 'light' | 'standard' | 'big';

const COUNT: Record<ConfettiSize, number> = { light: 30, standard: 70, big: 130 };
const DURATION_MS = 2600;

interface Piece {
  left: number;
  drift: number;
  spin: number;
  /** Where in the 0..1 timeline this piece starts and finishes falling. */
  start: number;
  end: number;
  width: number;
  height: number;
  color: string;
  round: boolean;
}

function makePieces(count: number, screenWidth: number, colors: readonly string[]): Piece[] {
  return Array.from({ length: count }, (_, index) => {
    // Staggered starts, so it pours rather than dropping as one sheet.
    const start = 0.01 + Math.random() * 0.27;
    const end = Math.min(0.98, start + 0.5 + Math.random() * 0.2);
    const round = Math.random() < 0.25;
    const size = 6 + Math.random() * 5;
    return {
      left: Math.random() * screenWidth,
      drift: (Math.random() - 0.5) * 140,
      spin: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 480),
      start,
      end,
      width: size,
      height: round ? size : size * (1.4 + Math.random() * 0.6),
      color: colors[index % colors.length],
      round,
    };
  });
}

export function Confetti({
  size,
  colors,
  onDone,
}: {
  size: ConfettiSize;
  colors: readonly string[];
  onDone?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => makePieces(COUNT[size], width, colors), [size, width, colors]);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.linear,
      // react-native-web has no native driver; asking for one logs a warning
      // on every frame and falls back anyway.
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => animation.stop();
  }, [progress, onDone]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {pieces.map((piece, index) => {
        const { start, end } = piece;
        const span = end - start;
        const mid = start + span * 0.5;

        // Slow at the top and quicker below: a third of the distance in the
        // first half of the fall reads as gravity rather than a conveyor belt.
        const translateY = progress.interpolate({
          inputRange: [0, start, mid, end, 1],
          outputRange: [-30, -30, height * 0.33, height + 40, height + 40],
        });
        const translateX = progress.interpolate({
          inputRange: [0, start, mid, end, 1],
          outputRange: [0, 0, piece.drift * 0.7, piece.drift, piece.drift],
        });
        const rotate = progress.interpolate({
          inputRange: [0, start, end, 1],
          outputRange: ['0deg', '0deg', `${piece.spin}deg`, `${piece.spin}deg`],
        });
        // Paper flipping over as it falls — the thing that makes it read as
        // confetti rather than coloured rain.
        const quarter = span / 4;
        const scaleX = piece.round
          ? 1
          : progress.interpolate({
              inputRange: [0, start, start + quarter, start + quarter * 2, start + quarter * 3, end, 1],
              outputRange: [1, 1, 0.15, 1, 0.15, 1, 1],
            });
        const opacity = progress.interpolate({
          inputRange: [0, end - 0.06, end, 1],
          outputRange: [1, 1, 0, 0],
        });

        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              top: 0,
              left: piece.left,
              width: piece.width,
              height: piece.height,
              borderRadius: piece.round ? piece.width / 2 : 1.5,
              backgroundColor: piece.color,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }, { scaleX }],
            }}
          />
        );
      })}
    </View>
  );
}
