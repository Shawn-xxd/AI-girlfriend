import { useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import portraits from '../../assets/images/onboarding-portraits.png';

/** Selects a panel of the original 3×2 image asset without making edited copies. */
export function Portrait({
  index,
  style,
  onReady,
  softened = false,
}: {
  index: number;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
  softened?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const tileWidth = Math.max(size.width, size.height / 1.5);
  const tileHeight = tileWidth * 1.5;
  const panel = Math.max(0, Math.min(5, index));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, style]}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }}
    >
      {tileWidth > 0 && (
        <Image
          source={portraits}
          resizeMode="stretch"
          blurRadius={softened ? 16 : 0}
          onLoad={onReady}
          onError={onReady}
          style={{
            position: 'absolute',
            width: tileWidth * 3,
            height: tileHeight * 2,
            left: -(panel % 3) * tileWidth + (size.width - tileWidth) / 2,
            top: -Math.floor(panel / 3) * tileHeight,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#171719' },
});
