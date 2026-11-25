import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const radius = 33;
const circumference = 2 * Math.PI * radius;
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
        r={radius}
        fill="none"
        stroke="#e6e8ef"
        strokeWidth={5}
      />
      {fraction > 0 && (
        <Circle
          cx={36}
          cy={36}
          r={radius}
          fill="none"
          stroke="#ff4b8b"
          strokeWidth={5}
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
