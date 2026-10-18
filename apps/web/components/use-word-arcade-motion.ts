import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { games, type GameKind } from '@personal-design/word-arcade';
import { EASE_OUT, instantMotion, observeMotionPolicy } from '@/lib/motion';

type Handoff = { target: GameKind; direction: number; phase: 'exit' | 'measure' | 'enter' };

/** Own only the scene handoff and the prompt's deferred start; physics stays in WordArcade. */
export function useWordArcadeMotion(
  kind: GameKind,
  onMode: (kind: GameKind) => void,
  onStart: () => void,
  onPause: () => void,
) {
  const scene = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(kind);
  // A batched mode commit can coalesce back to the mounted kind; this still forces measurement.
  const [measureRevision, setMeasureRevision] = useState(0);
  const current = useRef(kind);
  const actions = useRef({ onMode, onStart, onPause });
  const handoff = useRef<Handoff | null>(null);
  const sceneAnimation = useRef<Animation | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sceneInstant = useRef(false);
  const promptAnimation = useRef<Animation | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startAfterMeasure = useRef(false);

  useLayoutEffect(() => {
    actions.current = { onMode, onStart, onPause };
    if (!handoff.current) {
      current.current = kind;
      setSelected(kind);
    }
  }, [kind, onMode, onStart, onPause]);

  useLayoutEffect(() => {
    if (!prompt.current && promptAnimation.current) cancelStart();
  });

  function clearScene() {
    clearTimeout(sceneTimer.current);
    const animation = sceneAnimation.current;
    sceneAnimation.current = null;
    animation?.cancel();
  }
  function cancelStart() {
    startAfterMeasure.current = false;
    clearTimeout(promptTimer.current);
    const animation = promptAnimation.current;
    promptAnimation.current = null;
    animation?.cancel();
  }
  function commitMode() {
    const next = handoff.current;
    if (!next || next.phase !== 'exit') return;
    if (sceneAnimation.current?.playState === 'running') sceneAnimation.current.finish();
    clearTimeout(sceneTimer.current);
    next.phase = 'measure';
    current.current = next.target;
    actions.current.onMode(next.target);
    setMeasureRevision((revision) => revision + 1);
  }
  function settleScene() {
    commitMode();
    clearScene();
    // The pending commit still needs its new engine measured before an immediate start.
    if (handoff.current?.phase !== 'measure') handoff.current = null;
    else sceneInstant.current = true;
  }
  function enter(from: Keyframe, direction: number) {
    const element = scene.current;
    if (!element || instantMotion() || document.hidden || !direction) {
      clearScene();
      handoff.current = null;
      return;
    }
    clearScene();
    handoff.current = { target: current.current, direction, phase: 'enter' };
    const animation = element.animate([from, { transform: 'none', opacity: 1 }], {
      duration: 180,
      easing: EASE_OUT,
      fill: 'both',
    });
    sceneAnimation.current = animation;
    const finish = () => {
      if (sceneAnimation.current !== animation) return;
      clearScene();
      handoff.current = null;
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    sceneTimer.current = setTimeout(finish, 300);
  }
  function choose(target: GameKind, keyboard = false) {
    if (target === (handoff.current?.target ?? current.current)) return;
    sceneInstant.current = keyboard || instantMotion() || document.hidden;
    cancelStart();
    actions.current.onPause();
    setSelected(target);
    if (handoff.current?.phase === 'measure') {
      handoff.current.target = target;
      handoff.current.direction = Math.sign(
        games.findIndex((game) => game.id === target) -
          games.findIndex((game) => game.id === current.current),
      );
      current.current = target;
      actions.current.onMode(target);
      return;
    }
    const element = scene.current;
    const visual = element ? getComputedStyle(element) : null;
    const from = { transform: visual?.transform ?? 'none', opacity: visual?.opacity ?? '1' };
    clearScene();
    if (target === current.current) {
      handoff.current = null;
      if (!keyboard && !instantMotion() && !document.hidden) enter(from, 1);
      return;
    }
    const direction = Math.sign(
      games.findIndex((game) => game.id === target) -
        games.findIndex((game) => game.id === current.current),
    );
    handoff.current = { target, direction, phase: 'exit' };
    if (!element || keyboard || instantMotion() || document.hidden) {
      settleScene();
      return;
    }
    const animation = element.animate(
      [from, { transform: `translateX(${-direction * 8}px)`, opacity: 0 }],
      { duration: 100, easing: EASE_OUT, fill: 'forwards' },
    );
    sceneAnimation.current = animation;
    animation.onfinish = () => {
      if (sceneAnimation.current === animation) commitMode();
    };
    animation.oncancel = () => {
      if (sceneAnimation.current === animation) settleScene();
    };
    sceneTimer.current = setTimeout(() => {
      if (sceneAnimation.current === animation) commitMode();
    }, 220);
  }
  function start(keyboard = false) {
    if (document.hidden) return cancelStart();
    const opacity = prompt.current ? getComputedStyle(prompt.current).opacity : '1';
    prompt.current?.getAnimations().forEach((animation) => {
      if (animation !== promptAnimation.current) animation.cancel();
    });
    if (keyboard || instantMotion()) {
      cancelStart();
      settleScene();
      if (handoff.current?.phase === 'measure') startAfterMeasure.current = true;
      else actions.current.onStart();
      return;
    }
    if (
      promptAnimation.current ||
      handoff.current?.phase === 'exit' ||
      handoff.current?.phase === 'measure'
    )
      return;
    const element = prompt.current;
    if (!element) return;
    const animation = element.animate([{ opacity }, { opacity: 0 }], {
      duration: 100,
      easing: EASE_OUT,
      fill: 'forwards',
    });
    promptAnimation.current = animation;
    const finish = () => {
      if (promptAnimation.current !== animation) return;
      cancelStart();
      actions.current.onStart();
    };
    animation.onfinish = finish;
    animation.oncancel = () => {
      if (promptAnimation.current === animation) cancelStart();
    };
    promptTimer.current = setTimeout(finish, 220);
  }
  // Scene transforms must never be present during collision-layout reads, including resize.
  function beforeMeasure(measuredKind: GameKind) {
    const pending = handoff.current;
    if (pending?.phase === 'exit') {
      // Fonts can settle during the exit: keep its final frame until the new DOM commits.
      if (measuredKind !== pending.target) return false;
      settleScene();
    }
    if (handoff.current?.phase === 'measure' && handoff.current.target !== measuredKind)
      return false;
    clearScene();
    if (handoff.current?.phase === 'enter') handoff.current = null;
    const queued = startAfterMeasure.current;
    cancelStart();
    startAfterMeasure.current = queued;
    return true;
  }
  function measured(measuredKind: GameKind) {
    const next = handoff.current;
    if (next?.phase === 'measure' && next.target === measuredKind)
      enter(
        { transform: `translateX(${next.direction * 8}px)`, opacity: 0 },
        sceneInstant.current ? 0 : next.direction,
      );
    if (startAfterMeasure.current) {
      startAfterMeasure.current = false;
      actions.current.onStart();
    }
  }
  function resize() {
    cancelStart();
    settleScene();
  }
  function reset() {
    cancelStart();
    clearScene();
    handoff.current = null;
    current.current = kind;
    setSelected(kind);
  }

  useEffect(() => {
    const stop = observeMotionPolicy(() => {
      if (document.hidden) cancelStart();
      else if (instantMotion() && promptAnimation.current) {
        cancelStart();
        actions.current.onStart();
      }
      if (instantMotion() || document.hidden) settleScene();
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelStart();
    };
    const blur = () => {
      cancelStart();
      settleScene();
    };
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      stop();
      cancelStart();
      clearScene();
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, []);

  return {
    scene,
    prompt,
    selected,
    measureRevision,
    choose,
    start,
    cancelStart,
    beforeMeasure,
    measured,
    resize,
    reset,
  };
}
