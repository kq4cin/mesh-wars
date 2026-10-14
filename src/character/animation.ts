import type { AnimationDriver, AnimationState, BoneTransform, Pose } from './types';

const ident = (): BoneTransform => ({ dx: 0, dy: 0, rot: 0, scale: 1 });
export const CLIPS = { hit: 420, nod: 650 } as const;
export type ClipName = keyof typeof CLIPS;

/** Fixed artwork stays still at rest. Clips transform the whole image, never repaint its face. */
export class IdleDriver implements AnimationDriver {
  isAnimated(st: AnimationState): boolean { return st.oneShots.size > 0; }

  sample(t: number, st: AnimationState): Pose {
    const pose: Pose = {
      bones: { root: ident(), torso: ident(), head: ident() },
      alpha: {}, desaturate: st.expression === 'ko' ? 0.8 : 0,
    };
    for (const [name, start] of st.oneShots) {
      const duration = CLIPS[name as ClipName];
      if (!duration) continue;
      const p = (t - start) / duration;
      if (p < 0 || p >= 1) continue;
      if (name === 'hit') {
        if (!st.reducedMotion) pose.bones.root.dx = Math.sin(p * Math.PI * 9) * (1 - p) * 3;
        pose.tint = { color: '#ff4d5e', alpha: 0.42 * (1 - p) };
      } else if (name === 'nod' && !st.reducedMotion) {
        pose.bones.root.dy = 2 * Math.sin(p * Math.PI);
      }
    }
    return pose;
  }
}
