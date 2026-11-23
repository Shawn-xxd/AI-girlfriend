import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image, type ImageRef } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GalleryPhoto, CharacterProgress } from '@companion/shared';
import { randomUUID } from 'expo-crypto';
import { DiscoverIcon } from '../discover/Icons';
import { galleryStyles as g } from './styles';
import { walletKey } from '../api/queries';
import { MobileApiError } from '../api/core';
import { mobileApi } from '../api/client';
import { openedPhotos } from './opened';
import {
  privatePhotoSource,
  canReusePrivatePhoto,
} from './private-photo-source';
import { chatStyles as s } from '../chat/styles';

// Native cache eviction stays with SDWebImage; bound its iOS disk and decoded-memory cost.
if (Platform.OS === 'ios')
  Image.configureCache({
    maxDiskSize: 256 * 1024 * 1024,
    maxMemoryCost: 64 * 1024 * 1024,
  });

/** Only a persisted entitlement can reveal the original image, in the same card. */
export function PhotoCard(props: {
  owner: string;
  conversation: string;
  photo: GalleryPhoto;
  gallery?: boolean;
}) {
  return (
    <OwnedPhotoCard
      key={`${props.owner}:${props.conversation}:${props.photo.id}`}
      {...props}
    />
  );
}
function OwnedPhotoCard({
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
  const [cached, setCached] = useState<{ key: string; image: ImageRef } | null>(
    null,
  );
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const owned = photo.unlocked || purchased;
  const recovery = useRef(0);
  useEffect(() => {
    let active = true;
    void openedPhotos
      .read(owner, photo.id)
      .then(async (value) => {
        if (!active) return;
        if (value.opened) setOpened(true);
        if (!value.opened || !owned || !photo.available || !value.cacheKey)
          return;
        const image = await Image.readFromCacheAsync(value.cacheKey);
        if (active && image) setCached({ key: value.cacheKey, image });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [owner, photo.id, owned, photo.available]);
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
    staleTime: 40_000,
    gcTime: 5 * 60_000,
  });
  const remote =
    access.data &&
    privatePhotoSource(
      owner,
      photo.id,
      access.data.url,
      process.env.EXPO_PUBLIC_SUPABASE_URL,
    );
  const localImage =
    cached && (!remote || cached.key === remote.cacheKey) ? cached : null;
  const assetKey = remote?.cacheKey ?? localImage?.key;
  const source = localImage?.image ?? remote;
  const accessErrorCode = access.error
    ? access.error instanceof MobileApiError
      ? access.error.code
      : 'unknown'
    : undefined;
  const show = opened && owned && photo.available;
  const allowed = canReusePrivatePhoto(
    opened,
    owned,
    photo.available,
    accessErrorCode,
  );
  const imageFailed =
    failedUrl !== null && failedUrl === (access.data?.url ?? 'cache');
  const error = (!allowed && show) || imageFailed || (!!access.data && !remote);
  const visible = allowed && !!source && !error;
  return (
    <View
      testID={`${photo.kind}-photo-${photo.id}`}
      style={gallery ? local.gallery : s.photoCard}
    >
      <View style={[s.photoInside, gallery && local.galleryInside]}>
        {visible ? (
          <Image
            key={assetKey}
            source={source}
            cachePolicy="memory-disk"
            recyclingKey={assetKey}
            transition={0}
            contentFit="cover"
            accessibilityLabel="Character photo"
            style={StyleSheet.absoluteFill}
            onLoad={() => {
              recovery.current = 0;
              setLoadedKey(assetKey ?? null);
              void openedPhotos
                .mark(owner, photo.id, assetKey)
                .catch(() => undefined);
            }}
            onError={() => {
              setCached(null);
              setFailedUrl(access.data?.url ?? 'cache');
              if (recovery.current++ === 0)
                void access.refetch({ cancelRefetch: false }).then((result) => {
                  if (result.data) setFailedUrl(null);
                });
            }}
          />
        ) : (
          <LinearGradient
            pointerEvents="none"
            colors={['#65421e', '#71503c', '#b49a88']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {show && !error && !localImage && loadedKey !== assetKey && (
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
                    : `Open photo for ${photo.diamonds} diamonds`
                  : error
                    ? 'Retry photo'
                    : 'Open photo'
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
                recovery.current = 0;
                setFailedUrl(null);
                void access.refetch({ cancelRefetch: false });
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
