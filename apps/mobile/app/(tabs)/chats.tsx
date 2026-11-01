import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import {
  EmptyState,
  HomeScreen,
  PageHeading,
  homeStyles,
} from '../../src/home/ui';

export default function ChatsScreen() {
  return (
    <HomeScreen>
      <PageHeading
        title="Chats"
        subtitle="A space for conversations to grow."
      />
      <EmptyState
        icon="chats"
        title="Your story starts with hello."
        description="You don’t have any conversations yet. Explore Discover when you’re ready."
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/(tabs)')}
          style={({ pressed }) => [
            homeStyles.button,
            pressed && homeStyles.pressed,
          ]}
        >
          <Text style={homeStyles.buttonText}>Explore Discover</Text>
        </Pressable>
      </EmptyState>
    </HomeScreen>
  );
}
