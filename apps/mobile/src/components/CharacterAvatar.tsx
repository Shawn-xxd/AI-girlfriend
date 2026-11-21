import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { avatarFrame } from './avatar-frame';
export function CharacterAvatar({
  uri,
  focus = 0.2,
  label,
}: {
  uri: string;
  focus?: number;
  label?: string;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [source, setSource] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const crop =
    source?.uri === uri
      ? avatarFrame(
          frame.width,
          frame.height,
          source.width,
          source.height,
          focus,
        )
      : null;
  return (
    <View
      style={local.frame}
      onLayout={({ nativeEvent: { layout } }) =>
        setFrame((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }
    >
      <Image
        source={{ uri, cache: 'force-cache' }}
        accessibilityLabel={label}
        resizeMode="cover"
        style={
          crop ? { position: 'absolute', ...crop } : StyleSheet.absoluteFill
        }
        onLoad={({ nativeEvent }) =>
          setSource({
            uri,
            width: nativeEvent.source.width,
            height: nativeEvent.source.height,
          })
        }
      />
    </View>
  );
}
const local = StyleSheet.create({
  frame: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
