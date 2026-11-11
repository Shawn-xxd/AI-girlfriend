import { useState, type ReactNode } from 'react';
import type { GalleryPhoto } from '@companion/shared';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CharacterHeader,
  type DisplayCharacter,
} from '../chat/CharacterHeader';
import { chatStyles as sheetStyles } from '../chat/styles';
import { DiscoverIcon } from '../discover/Icons';
import { Portrait } from '../onboarding/Portrait';
import { PreviewPhotoViewer } from './PhotoViewer';
import { galleryPreviewPhotos, type GalleryPreviewPhoto } from './preview';
import { galleryStyles as g } from './styles';
export function GalleryScreen({
  character,
  preview = false,
  loading = false,
  unavailable = false,
  onRetry,
  onBack,
  level,
  balance,
  remotePhotos = [],
  renderPhoto,
}: {
  character?: DisplayCharacter;
  preview?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  onBack: () => void;
  level?: number;
  balance?: number;
  remotePhotos?: GalleryPhoto[];
  renderPhoto?: (photo: GalleryPhoto) => ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 360 || height < 700;
  const [tab, setTab] = useState<'all' | 'diamond'>('all');
  const [gridWidth, setGridWidth] = useState(0);
  const [photo, setPhoto] = useState(false);
  const [sheet, setSheet] = useState<
    'diamonds' | 'character' | GalleryPreviewPhoto | null
  >(null);
  const photos = preview
    ? galleryPreviewPhotos.filter(
        (photo) => tab === 'all' || photo.kind === 'diamond',
      )
    : [];
  const portrait = preview ? character?.portraitIndex : undefined;
  const visibleRemote = remotePhotos.filter(
    (photo) => tab === 'all' || photo.kind === 'diamond',
  );
  const close = () => setSheet(null);
  return (
    <SafeAreaView edges={['left', 'right']} style={g.screen}>
      <View style={g.header}>
        <CharacterHeader
          character={character}
          preview={preview}
          onBack={onBack}
          onCharacter={() => setSheet('character')}
          onDiamonds={() => setSheet('diamonds')}
          action="chat"
          onAction={onBack}
          previewLevel={preview ? 1 : undefined}
          level={level ?? (preview ? 1 : undefined)}
          balance={balance}
        />
      </View>
      <View
        accessibilityRole="tablist"
        style={[g.tabs, compact && g.tabsCompact]}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="All photos"
          accessibilityState={{ selected: tab === 'all' }}
          onPress={() => setTab('all')}
          style={[g.tab, tab === 'all' && g.tabActive]}
        >
          <Text style={g.tabText}>All photos</Text>
          {tab === 'all' && <View style={g.underline} />}
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Private diamond photos"
          accessibilityState={{ selected: tab === 'diamond' }}
          onPress={() => setTab('diamond')}
          style={[g.tab, g.privateTab, tab === 'diamond' && g.privateActive]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['#ff3e09', '#ff991f', '#ff5205']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={g.tabInner}>
            <DiscoverIcon name="lock" size={20} />
            <Text style={g.tabText}>PRIVATE</Text>
          </View>
        </Pressable>
      </View>
      {loading ? (
        <View style={g.state}>
          <ActivityIndicator
            color="#ff351c"
            accessibilityLabel="Loading gallery"
          />
        </View>
      ) : unavailable ? (
        <View style={g.state}>
          <Text style={g.stateText}>Unable to load this gallery.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={g.retry}
          >
            <Text style={g.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !photos.length && !visibleRemote.length ? (
        <View style={g.state}>
          <Text style={g.stateText}>No photos available yet.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            g.content,
            compact && g.contentCompact,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <View
            style={g.grid}
            onLayout={({ nativeEvent }) =>
              setGridWidth(nativeEvent.layout.width)
            }
          >
            {visibleRemote.map((item) => (
              <View
                key={item.id}
                style={[g.card, { width: Math.max(0, (gridWidth - 12) / 2) }]}
              >
                {renderPhoto?.(item)}
              </View>
            ))}
            {photos.map((item) => (
              <View
                key={item.id}
                testID={`gallery-${item.id}`}
                style={[g.card, { width: Math.max(0, (gridWidth - 12) / 2) }]}
              >
                {portrait !== undefined && (
                  <Portrait
                    index={portrait}
                    softened={!item.unlocked}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                {!item.unlocked && (
                  <>
                    <LinearGradient
                      pointerEvents="none"
                      colors={['#633900a0', '#63463d55', '#d4b9aa9c']}
                      style={g.lockedShade}
                    />
                    <Text style={g.cardTitle}>{item.title}</Text>
                  </>
                )}
                {item.unlocked ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open Level 1 photo"
                    onPress={() => setPhoto(true)}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.kind === 'level'
                        ? `Photo requires Level ${item.level}`
                        : `Preview diamond photo ${item.id}`
                    }
                    onPress={() => setSheet(item)}
                    style={({ pressed }) => [
                      g.unlock,
                      item.kind === 'level' && g.levelUnlock,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {item.kind === 'level' ? (
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        style={g.levelText}
                      >
                        OPEN ON{' '}
                        <Text style={g.levelNumber}>LVL {item.level}</Text>
                      </Text>
                    ) : (
                      <>
                        <Text style={g.openText}>OPEN</Text>
                        <View style={g.price}>
                          <DiscoverIcon
                            name="diamond"
                            size={18}
                            color="#ff2b09"
                          />
                          <Text style={g.priceText}>{item.diamonds}</Text>
                        </View>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue chatting"
            onPress={onBack}
            style={g.banner}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['#ff351600', '#ff461738', '#ff512699']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {portrait !== undefined && (
              <Portrait index={portrait} style={g.bannerPhoto} />
            )}
            <View style={g.bannerInner}>
              <DiscoverIcon name="chat" size={26} color="#ff4031" filled />
              <Text style={g.bannerText}>
                Continue chatting with the girl to unlock more photos!
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      )}
      <Modal
        transparent
        visible={sheet !== null}
        animationType="fade"
        onRequestClose={close}
      >
        <View style={sheetStyles.modal}>
          <View
            accessibilityViewIsModal
            style={[
              sheetStyles.sheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <View style={sheetStyles.sheetHeader}>
              <Text style={sheetStyles.sheetTitle}>
                {sheet === 'diamonds'
                  ? 'Diamonds'
                  : sheet === 'character'
                    ? character?.name
                    : typeof sheet === 'object' && sheet?.kind === 'level'
                      ? `Level ${sheet.level}`
                      : 'Diamond photo'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={close}
                style={sheetStyles.sheetClose}
              >
                <DiscoverIcon name="close" />
              </Pressable>
            </View>
            <Text style={sheetStyles.sheetText}>
              {sheet === 'diamonds'
                ? 'Purchases are currently unavailable.'
                : sheet === 'character'
                  ? character?.bio
                  : 'Photo unlocking isn’t available in this preview.'}
            </Text>
          </View>
        </View>
      </Modal>
      <PreviewPhotoViewer
        visible={photo && preview}
        index={portrait}
        onClose={() => setPhoto(false)}
      />
    </SafeAreaView>
  );
}
