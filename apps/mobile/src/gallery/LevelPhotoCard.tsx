import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import type { LevelPhoto } from '@companion/shared';
import { mobileApi } from '../api/client';
import { chatStyles as s } from '../chat/styles';

/** Fetch full image bytes only after the server checks the permanent entitlement. */
export function LevelPhotoCard({
  owner,
  conversation,
  photo,
  gallery = false,
}: {
  owner: string;
  conversation: string;
  photo: LevelPhoto;
  gallery?: boolean;
}) {
  const [opened, setOpened] = useState(gallery && photo.unlocked);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const access = useQuery({
    queryKey: ['mobile-api', owner, 'photo-access', conversation, photo.id],
    queryFn: ({ signal }) =>
      mobileApi.photo(owner, conversation, photo.id, signal),
    enabled: opened && photo.unlocked && photo.available,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const imageFailed = !!access.data && failedUrl === access.data.url;
  const error = access.isError || imageFailed;
  const show = opened && photo.unlocked && photo.available;
  return (
    <View
      testID={`level-photo-${photo.id}`}
      style={gallery ? local.gallery : s.photoCard}
    >
      <View style={[s.photoInside, gallery && local.galleryInside]}>
        {show && access.data && !error ? (
          <Image
            key={access.data.url}
            source={{ uri: access.data.url }}
            resizeMode="cover"
            accessibilityLabel={photo.title}
            style={StyleSheet.absoluteFill}
            onError={() => {
              setFailedUrl(access.data.url);
              if (Date.parse(access.data.expiresAt) <= Date.now())
                void access.refetch();
            }}
          />
        ) : (
          <LinearGradient
            pointerEvents="none"
            colors={['#65421e', '#71503c', '#b49a88']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {!show && <Text style={s.photoTitle}>{photo.title}</Text>}
        {show && access.isFetching && (
          <ActivityIndicator color="#fff" accessibilityLabel="Loading photo" />
        )}
        {(!show || error) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              !photo.available
                ? 'Photo unavailable'
                : !photo.unlocked
                  ? `Photo requires Level ${photo.requiredLevel}`
                  : error
                    ? `Retry photo ${photo.title}`
                    : `Open photo ${photo.title}`
            }
            disabled={!photo.available || !photo.unlocked}
            onPress={() => {
              setOpened(true);
              if (error) {
                setFailedUrl(null);
                void access.refetch();
              }
            }}
            style={[s.photoOpen, local.open]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={s.photoOpenText}
            >
              {!photo.available
                ? 'UNAVAILABLE'
                : !photo.unlocked
                  ? `OPEN ON LVL ${photo.requiredLevel}`
                  : error
                    ? 'TRY AGAIN'
                    : 'OPEN'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
const local = StyleSheet.create({
  gallery: { flex: 1 },
  galleryInside: { borderRadius: 10, borderWidth: 0 },
  open: { width: '90%', maxWidth: 160 },
});
