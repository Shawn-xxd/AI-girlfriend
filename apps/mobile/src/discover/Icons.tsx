import type { ColorValue } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
export function DiscoverIcon({
  name,
  color = '#fff',
  size = 24,
  strokeWidth = 1.7,
  filled = false,
}: {
  name:
    | 'heart'
    | 'close'
    | 'diamond'
    | 'crown'
    | 'info'
    | 'back'
    | 'send'
    | 'plus'
    | 'cards'
    | 'chat'
    | 'person'
    | 'photo'
    | 'lock';
  color?: ColorValue;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}) {
  const paths = {
    heart:
      'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8Z',
    close: 'M6 6l12 12M6 18L18 6',
    diamond: 'M6 3h12l4 6-10 13L2 9l4-6ZM2 9h20M6 3l6 19 6-19',
    crown: 'm3 6 5 5 4-8 4 8 5-5-2 13H5L3 6ZM5 19h14',
    info: 'M12 11v6M12 7h.01',
    back: 'm14 6-6 6 6 6M8 12h13',
    send: 'm3 3 19 9-19 9 4-9-4-9ZM7 12h15',
    plus: 'M12 4v16M4 12h16',
    cards: 'm6 2 11 2-3 17-11-2L6 2Zm12 5 4 2-6 14-6-2 6-1 2-13Z',
    chat: 'M12 2a9 9 0 0 0-9 9 8.5 8.5 0 0 0 2 5.5L3 22l6-2.5a9 9 0 1 0 3-17.5Z',
    lock: 'M6 10h12v11H6V10Zm2 0V7a4 4 0 0 1 8 0v3M12 15v2',
    photo: 'M3 5h18v15H3V5Zm0 11 6-6 5 5 3-3 4 4M16 8h.01',
    person:
      'M16.5 6.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM3 20a8 8 0 0 1 6-8h6a8 8 0 0 1 6 8v2H3v-2Z',
  };
  return (
    <Svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled || name === 'heart' ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'info' && <Circle cx={12} cy={12} r={9} />}
      <Path d={paths[name]} />
      {name === 'chat' &&
        [8, 12, 16].map((cx) => (
          <Circle key={cx} cx={cx} cy={11} r={1.1} fill="#444" stroke="none" />
        ))}
    </Svg>
  );
}
