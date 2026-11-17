import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOpenedPhotoStore } from './opened-core';
export const openedPhotos = createOpenedPhotoStore(AsyncStorage);
