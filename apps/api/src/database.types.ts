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
      companion_wallets: Table<
        { user_id: string; balance: number; updated_at: string },
        { user_id: string; balance?: number; updated_at?: string }
      >;
      companion_wallet_transactions: Table<
        {
          id: string;
          user_id: string;
          kind: string;
          amount: number;
          balance_after: number;
          source_key: string;
          photo_id: string | null;
          reversal_of: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          kind: string;
          amount: number;
          balance_after: number;
          source_key: string;
          photo_id?: string | null;
          reversal_of?: string | null;
          created_at?: string;
        }
      >;
      companion_photo_unlock_requests: Table<
        {
          user_id: string;
          request_key: string;
          photo_id: string;
          expected_price: number;
          charged_diamonds: number;
          created_at: string;
        },
        {
          user_id: string;
          request_key: string;
          photo_id: string;
          expected_price: number;
          charged_diamonds: number;
          created_at?: string;
        }
      >;

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
      companion_chat_memory: Table<
        {
          conversation_id: string;
          summary: string;
          through_sequence: number;
          generation_id: string | null;
          target_sequence: number | null;
          lease_until: string | null;
          updated_at: string;
        },
        {
          conversation_id: string;
          summary?: string;
          through_sequence?: number;
          generation_id?: string | null;
          target_sequence?: number | null;
          lease_until?: string | null;
          updated_at?: string;
        }
      >;
      companion_memory_usage: Table<
        {
          id: string;
          conversation_id: string;
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
          conversation_id: string;
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
      companion_level_configs: Table<
        {
          character_id: string;
          rules: { level: number; requiredCount: number }[];
          updated_at: string;
        },
        {
          character_id: string;
          rules: { level: number; requiredCount: number }[];
          updated_at?: string;
        }
      >;
      companion_user_character_progress: Table<
        {
          user_id: string;
          character_id: string;
          effective_chat_count: number;
          level: number;
          updated_at: string;
        },
        {
          user_id: string;
          character_id: string;
          effective_chat_count?: number;
          level?: number;
          updated_at?: string;
        }
      >;
      companion_chat_count_events: Table<
        {
          turn_id: string;
          user_id: string;
          character_id: string;
          created_at: string;
        },
        {
          turn_id: string;
          user_id: string;
          character_id: string;
          created_at?: string;
        }
      >;
      companion_photos: Table<
        {
          id: string;
          character_id: string;
          kind: 'level' | 'diamond';
          title: string;
          required_level: number | null;
          diamond_price: number | null;
          object_key: string;
          review_status: 'draft' | 'approved' | 'rejected';
          published: boolean;
          created_at: string;
        },
        {
          id?: string;
          character_id: string;
          kind?: 'level' | 'diamond';
          title?: string;
          required_level?: number | null;
          diamond_price?: number | null;
          object_key: string;
          review_status?: 'draft' | 'approved' | 'rejected';
          published?: boolean;
          created_at?: string;
        }
      >;
      companion_photo_unlocks: Table<
        {
          id: string;
          user_id: string;
          character_id: string;
          photo_id: string;
          earned_level: number | null;
          unlock_kind: string;
          wallet_transaction_id: string | null;
          unlocked_at: string;
        },
        {
          id?: string;
          user_id: string;
          character_id: string;
          photo_id: string;
          earned_level: number | null;
          unlock_kind?: string;
          wallet_transaction_id?: string | null;
          unlocked_at?: string;
        }
      >;
      companion_photo_messages: Table<
        {
          id: string;
          conversation_id: string;
          unlock_id: string;
          sequence: number;
          created_at: string;
        },
        {
          id?: string;
          conversation_id: string;
          unlock_id: string;
          sequence: number;
          created_at?: string;
        }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      companion_wallet_snapshot_v1: {
        Args: { p_actor: string };
        Returns: unknown;
      };
      companion_credit_wallet_v1: {
        Args: { p_actor: string; p_amount: number; p_reference: string };
        Returns: string;
      };
      companion_reverse_credit_v1: {
        Args: { p_credit: string; p_reference: string };
        Returns: string;
      };
      companion_unlock_diamond_photo_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_photo: string;
          p_key: string;
          p_expected_price: number;
        };
        Returns: unknown;
      };
      companion_gallery_v1: {
        Args: { p_actor: string; p_conversation: string };
        Returns: unknown;
      };
      companion_memory_context_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_limit?: number;
          p_max_chars?: number;
        };
        Returns: unknown;
      };
      companion_claim_memory_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_batch?: number;
          p_max_chars?: number;
        };
        Returns: unknown;
      };
      companion_finish_memory_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_generation: string;
          p_summary: string | null;
        };
        Returns: boolean;
      };
      companion_record_memory_usage_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
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
      companion_set_level_rules_v1: {
        Args: {
          p_character: string;
          p_rules: { level: number; requiredCount: number }[];
        };
        Returns: undefined;
      };
      companion_sync_progress_v1: {
        Args: { p_actor: string; p_conversation: string };
        Returns: undefined;
      };
      companion_progress_snapshot_v1: {
        Args: { p_actor: string; p_conversation: string };
        Returns: unknown;
      };
      companion_level_photos_v1: {
        Args: { p_actor: string; p_conversation: string };
        Returns: unknown;
      };
      companion_timeline_v1: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_before?: number | null;
          p_limit?: number;
        };
        Returns: unknown;
      };
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
