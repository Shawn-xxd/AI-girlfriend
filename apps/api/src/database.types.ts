// Database row types follow the versioned SQL. Never export these to mobile.
type Relation = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type Table<Row, Insert, Relations extends Relation[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Relations;
};
export type Database = {
  public: {
    Tables: {
      companion_users: Table<
        { id: string; created_at: string },
        { id: string; created_at?: string }
      >;
      companion_characters: Table<
        {
          id: string;
          name: string;
          archetype: string;
          bio: string;
          tags: string[];
          published: boolean;
          system_prompt: string;
          created_at: string;
        },
        {
          id?: string;
          name: string;
          archetype: string;
          bio: string;
          tags?: string[];
          published?: boolean;
          system_prompt?: string;
          created_at?: string;
        }
      >;
      companion_conversations: Table<
        {
          id: string;
          user_id: string;
          character_id: string;
          next_sequence: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          character_id: string;
          next_sequence?: number;
          created_at?: string;
        },
        [
          {
            foreignKeyName: 'companion_conversations_character_id_fkey';
            columns: ['character_id'];
            isOneToOne: false;
            referencedRelation: 'companion_characters';
            referencedColumns: ['id'];
          },
        ]
      >;
      companion_chat_turns: Table<
        {
          id: string;
          conversation_id: string;
          request_key: string;
          state: string;
          generation_id: string;
          lease_expires_at: string;
          failure_reason: string | null;
          model: string | null;
          provider_response_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          completed_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          conversation_id: string;
          request_key: string;
          state: string;
          generation_id: string;
          lease_expires_at: string;
          failure_reason?: string | null;
          model?: string | null;
          provider_response_id?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          completed_at?: string | null;
          created_at?: string;
        }
      >;
      companion_ai_attempts: Table<
        {
          id: string;
          turn_id: string;
          state: string;
          model: string | null;
          provider_response_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          created_at: string;
          finished_at: string | null;
        },
        {
          id: string;
          turn_id: string;
          state: string;
          model?: string | null;
          provider_response_id?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
          finished_at?: string | null;
        }
      >;
      companion_ai_usage_events: Table<
        {
          id: string;
          turn_id: string;
          generation_id: string;
          phase: string;
          provider: string;
          model: string;
          provider_response_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          created_at: string;
        },
        {
          id?: string;
          turn_id: string;
          generation_id: string;
          phase: string;
          provider: string;
          model: string;
          provider_response_id?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
        }
      >;
      companion_messages: Table<
        {
          id: string;
          conversation_id: string;
          turn_id: string;
          role: 'user' | 'assistant';
          content: string;
          sequence: number;
          created_at: string;
        },
        {
          id?: string;
          conversation_id: string;
          turn_id: string;
          role: 'user' | 'assistant';
          content: string;
          sequence: number;
          created_at?: string;
        },
        [
          {
            foreignKeyName: 'companion_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'companion_conversations';
            referencedColumns: ['id'];
          },
        ]
      >;
      companion_schema_migrations: Table<
        { version: string; checksum: string; applied_at: string },
        { version: string; checksum: string; applied_at?: string }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      companion_record_ai_usage_v1: {
        Args: {
          p_actor: string;
          p_turn: string;
          p_generation: string;
          p_phase: string;
          p_provider: string;
          p_model: string;
          p_response_id: string | null;
          p_input_tokens: number | null;
          p_output_tokens: number | null;
        };
        Returns: string;
      };
      companion_open_conversation_v1: {
        Args: { p_actor: string; p_character: string };
        Returns: string;
      };
      companion_begin_turn_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_key: string;
          p_content: string;
        };
        Returns: { turnId: string; state: string; generationId: string };
      };
      companion_complete_turn_v1: {
        Args: {
          p_actor: string;
          p_turn: string;
          p_generation: string;
          p_text: string;
          p_model: string;
          p_response_id: string;
          p_input_tokens: number | null;
          p_output_tokens: number | null;
        };
        Returns: string;
      };
      companion_fail_turn_v1: {
        Args: {
          p_actor: string;
          p_turn: string;
          p_generation: string;
          p_reason: string;
          p_model?: string | null;
          p_response_id?: string | null;
          p_input_tokens?: number | null;
          p_output_tokens?: number | null;
        };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
