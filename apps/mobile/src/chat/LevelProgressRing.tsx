import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const circumference = 2 * Math.PI * 34;
/** Uses the SVG primitives already installed with Expo; progress comes from the server. */
export function LevelProgressRing({
  fraction,
  size,
}: {
  fraction: number;
  size: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
    >
      <Circle
        cx={36}
        cy={36}
        r={34}
        fill="none"
        stroke="#ffffff40"
        strokeWidth={3}
      />
      {fraction > 0 && (
        <Circle
          cx={36}
          cy={36}
          r={34}
          fill="none"
          stroke="#ff351c"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - fraction)}
          rotation={-90}
          origin="36,36"
        />
      )}
    </Svg>
  );
}
