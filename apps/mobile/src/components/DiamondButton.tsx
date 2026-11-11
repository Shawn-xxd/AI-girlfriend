import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DiscoverIcon } from '../discover/Icons';
/** Unknown balance remains distinct from a verified zero. */
export function DiamondButton({
  onPress,
  balance,
}: {
  onPress: () => void;
  balance?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        balance === undefined
          ? 'Diamonds balance unavailable'
          : `Diamonds balance ${balance}`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={styles.balance}>
        <DiscoverIcon name="diamond" size={16} color="#ff3a21" />
        <Text numberOfLines={1} style={styles.text}>
          {balance === undefined ? '—' : balance.toLocaleString('en-US')}
        </Text>
        <View style={styles.add}>
          <DiscoverIcon name="plus" size={10} strokeWidth={3.2} />
        </View>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  touch: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
  balance: {
    height: 32,
    minWidth: 64,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#e9462a',
    backgroundColor: '#111111e8',
  },
  text: { color: '#ff3a21', fontSize: 15, fontWeight: '700' },
  add: {
    position: 'absolute',
    right: -2,
    bottom: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ff3a21',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
