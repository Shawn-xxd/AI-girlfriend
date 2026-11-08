import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Portrait } from '../onboarding/Portrait';
import { DiscoverIcon } from '../discover/Icons';
import { chatStyles as s } from '../chat/styles';
/** Local design photographs only; production access must come from the server. */
export function PreviewPhotoViewer({
  visible,
  index,
  onClose,
}: {
  visible: boolean;
  index?: number;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible && index !== undefined}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.viewer}>
        <View style={s.viewerTop}>
          <Text style={s.viewerText}>PHOTO · PREVIEW</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={s.sheetClose}
            onPress={onClose}
          >
            <DiscoverIcon name="close" />
          </Pressable>
        </View>
        <View style={s.viewerPhoto}>
          {index !== undefined && (
            <Portrait index={index} style={StyleSheet.absoluteFill} />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
