import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GalleryPhoto, CharacterProgress } from '@companion/shared';
import { randomUUID } from 'expo-crypto';
import { DiscoverIcon } from '../discover/Icons';
import { galleryStyles as g } from './styles';
import { walletKey } from '../api/queries';
import { MobileApiError } from '../api/core';
import { mobileApi } from '../api/client';
import { chatStyles as s } from '../chat/styles';

/** Only a persisted entitlement can reveal the original image, in the same card. */
export function PhotoCard({
  owner,
  conversation,
  photo,
  gallery = false,
}: {
  owner: string;
  conversation: string;
  photo: GalleryPhoto;
  gallery?: boolean;
}) {
  const cache = useQueryClient();
  const request = useRef<{ requestKey: string; expectedPrice: number } | null>(
    null,
  );
  const lock = useRef(false);
  const [buying, setBuying] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [opened, setOpened] = useState(gallery && photo.unlocked);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const owned = photo.unlocked || purchased;
  async function unlock() {
    if (lock.current || photo.kind !== 'diamond' || photo.diamonds === null)
      return;
    lock.current = true;
    setBuying(true);
    setPurchaseError(null);
    request.current ??= {
      requestKey: randomUUID(),
      expectedPrice: photo.diamonds,
    };
    try {
      const result = await mobileApi.unlockPhoto(
        owner,
        conversation,
        photo.id,
        request.current,
      );
      if (result.photoId !== photo.id)
        throw new MobileApiError('invalid_response');
      // An older unlock response can arrive after another spend. Re-read the wallet
      // rather than overwriting its balance with an older response snapshot.
      await cache.cancelQueries({ queryKey: walletKey(owner), exact: true });
      cache.setQueryData<{
        photos: GalleryPhoto[];
        progress: CharacterProgress;
      }>(
        ['mobile-api', owner, 'gallery', conversation],
        (previous) =>
          previous && {
            ...previous,
            photos: previous.photos.map((item) =>
              item.id === photo.id ? { ...item, unlocked: true } : item,
            ),
          },
      );
      setPurchased(true);
      setOpened(true);
      void cache.invalidateQueries({
        queryKey: ['mobile-api', owner, 'gallery', conversation],
      });
    } catch (error) {
      setPurchaseError(
        error instanceof MobileApiError
          ? error.message
          : 'Unable to open photo. Please try again.',
      );
      if (error instanceof MobileApiError && error.code === 'wallet_conflict') {
        request.current = null;
        void cache.invalidateQueries({
          queryKey: ['mobile-api', owner, 'gallery', conversation],
        });
      }
    } finally {
      void cache.invalidateQueries({ queryKey: walletKey(owner), exact: true });
      lock.current = false;
      setBuying(false);
    }
  }
  const access = useQuery({
    queryKey: ['mobile-api', owner, 'photo-access', conversation, photo.id],
    queryFn: ({ signal }) =>
      mobileApi.photo(owner, conversation, photo.id, signal),
    enabled: opened && owned && photo.available,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const imageFailed = !!access.data && failedUrl === access.data.url;
  const error = access.isError || imageFailed;
  const show = opened && owned && photo.available;
  return (
    <View
      testID={`${photo.kind}-photo-${photo.id}`}
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
        {purchaseError && !show && (
          <Text accessibilityRole="alert" style={local.error}>
            {purchaseError}
          </Text>
        )}
        {(!show || error) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              !photo.available
                ? 'Photo unavailable'
                : !owned
                  ? photo.kind === 'level'
                    ? `Photo requires Level ${photo.requiredLevel}`
                    : `Open photo ${photo.title} for ${photo.diamonds} diamonds`
                  : error
                    ? `Retry photo ${photo.title}`
                    : `Open photo ${photo.title}`
            }
            accessibilityState={{ busy: buying }}
            disabled={
              buying ||
              !photo.available ||
              (!owned && (photo.kind === 'level' || photo.diamonds === null))
            }
            onPress={() => {
              if (!owned) {
                void unlock();
                return;
              }
              setOpened(true);
              if (error) {
                setFailedUrl(null);
                void access.refetch();
              }
            }}
            style={
              !owned && photo.kind === 'diamond'
                ? g.unlock
                : [s.photoOpen, local.open]
            }
          >
            {buying ? (
              <ActivityIndicator
                color="#fff"
                accessibilityLabel="Unlocking photo"
              />
            ) : !owned && photo.kind === 'diamond' ? (
              <>
                <Text style={g.openText}>OPEN</Text>
                <View style={g.price}>
                  <DiscoverIcon name="diamond" size={16} color="#ff2b09" />
                  <Text style={g.priceText}>{photo.diamonds ?? '—'}</Text>
                </View>
              </>
            ) : (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={s.photoOpenText}
              >
                {!photo.available
                  ? 'UNAVAILABLE'
                  : !owned
                    ? photo.kind === 'level'
                      ? `OPEN ON LVL ${photo.requiredLevel}`
                      : `OPEN ◈ ${photo.diamonds ?? '—'}`
                    : error
                      ? 'TRY AGAIN'
                      : 'OPEN'}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
const local = StyleSheet.create({
  error: {
    position: 'absolute',
    bottom: 62,
    left: 8,
    right: 8,
    textAlign: 'center',
    color: '#fff',
    fontSize: 12,
    backgroundColor: '#000b',
    borderRadius: 6,
    padding: 4,
  },
  gallery: { flex: 1 },
  galleryInside: { borderRadius: 10, borderWidth: 0 },
  open: { width: '90%', maxWidth: 160 },
});
