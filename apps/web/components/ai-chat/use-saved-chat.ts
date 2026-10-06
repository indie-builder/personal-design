'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  analyticsAgent,
  defaultAgent,
  isMaleAvatar,
  randomAvatarId,
  savedSchema,
  type SavedChat,
} from '@personal-design/ai-chat';

import { createChatPersistence } from '@/lib/chat-stream';

const STORAGE_KEY = 'personal-design:ai-chat:v2';
const emptyStore: SavedChat = {
  agents: [defaultAgent, analyticsAgent],
  conversations: [],
};

/** 补齐内置智能体并强制其资料为包内最新版，再把非男生头像的记录重新随机分配。 */
function normalize(initial: SavedChat): SavedChat {
  const builtinIds = new Set([defaultAgent.id, analyticsAgent.id]);
  const stored = new Map(initial.agents.map((item) => [item.id, item]));
  const customAgents = initial.agents.filter((item) => !builtinIds.has(item.id));
  return {
    ...initial,
    agents: [...[defaultAgent, analyticsAgent], ...customAgents].map((item) => {
      const saved = stored.get(item.id);
      return {
        ...item,
        avatarId:
          item.id === analyticsAgent.id
            ? analyticsAgent.avatarId
            : isMaleAvatar(saved?.avatarId)
              ? saved!.avatarId
              : randomAvatarId(),
      };
    }),
  };
}

/**
 * 本机持久化的智能体与会话。浏览器存储在 hydration 后读取（服务端与首帧一致），
 * 首次成功载入后经 `onLoad` 交还初始数据；`ready` 起才开始持久化。
 */
export function useSavedChat(
  onLoad: (initial: SavedChat) => void,
  busy: boolean,
): {
  saved: SavedChat;
  setSaved: Dispatch<SetStateAction<SavedChat>>;
  storageError: string;
} {
  const [saved, setSaved] = useState<SavedChat>(emptyStore);
  const [storageError, setStorageError] = useState('');
  const [ready, setReady] = useState(false);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      let initial = emptyStore;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) initial = savedSchema.parse(JSON.parse(raw));
      } catch {
        setStorageError('本机历史记录无法读取，本次对话仍可使用。');
      }
      initial = normalize(initial);
      setSaved(initial);
      setReady(true);
      onLoadRef.current(initial);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persistence = useRef<ReturnType<typeof createChatPersistence> | null>(null);
  useEffect(() => {
    if (!ready || storageError) return;
    const writer = createChatPersistence(
      (snapshot) => localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)),
      () => setStorageError('浏览器存储不可用，本次更新暂未保存，请保留当前页面。'),
    );
    persistence.current = writer;
    const onHidden = () => {
      if (document.hidden) writer.flush();
    };
    window.addEventListener('pagehide', writer.flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', writer.flush);
      document.removeEventListener('visibilitychange', onHidden);
      writer.flush();
      persistence.current = null;
    };
  }, [ready, storageError]);

  useEffect(() => {
    persistence.current?.schedule(saved, busy);
  }, [saved, busy, ready]);

  return { saved, setSaved, storageError };
}
