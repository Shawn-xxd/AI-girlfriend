import { EmptyState, HomeScreen, PageHeading } from '../../src/home/ui';

export default function DiscoverScreen() {
  return (
    <HomeScreen>
      <PageHeading
        title="Discover"
        subtitle="Find a connection that feels like you."
      />
      <EmptyState
        icon="discover"
        title="A new beginning."
        description="There are no companions to show just yet. Your next connection has room to unfold."
      />
    </HomeScreen>
  );
}
