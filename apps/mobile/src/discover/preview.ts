import type { DiscoverCharacter } from './model';
/** Explicit review-only fixtures. Never used as a production API fallback. */
export const previewCharacters: DiscoverCharacter[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Ava',
    archetype: 'The girl next door',
    bio: 'Coffee dates, slow Sundays, and a little playful banter. What’s your idea of a perfect evening?',
    tags: ['Sweet', 'Playful', 'Romance'],
    portraitIndex: 0,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Luna',
    archetype: 'A gentle soul',
    bio: 'A quiet moment, a good story, and someone who really listens.',
    tags: ['Thoughtful', 'Warm', 'Books'],
    portraitIndex: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Sofia',
    archetype: 'A little mystery',
    bio: 'Good conversation is my favorite kind of chemistry. Tell me something unexpected.',
    tags: ['Confident', 'Flirty', 'Curious'],
    portraitIndex: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    name: 'Ruby',
    archetype: 'Your next adventure',
    bio: 'One more song, one more story. Let’s see where the night takes us.',
    tags: ['Bold', 'Music', 'Adventure'],
    portraitIndex: 3,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Isla',
    archetype: 'A natural connection',
    bio: 'Fresh air, little discoveries, and making ordinary days feel special.',
    tags: ['Easygoing', 'Nature', 'Sweet'],
    portraitIndex: 4,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    name: 'Mei',
    archetype: 'A spark of possibility',
    bio: 'A knowing smile and a story to tell. I’d love to hear yours.',
    tags: ['Charming', 'Creative', 'Warm'],
    portraitIndex: 5,
  },
];
