import type { Animation, MotionState } from '@/lib/api/types';
import type { PipelineStage } from '@/lib/store/pipelineStore';

const STAGE_TO_MOTION: Record<PipelineStage, MotionState> = {
  idle: 'idle',
  recording: 'listening',
  uploading: 'thinking',
  processing: 'thinking',
  speaking: 'speaking',
  error: 'error',
};

const ANIMATION_TO_MOTION: Record<Animation, MotionState> = {
  idle: 'idle',
  listen: 'listening',
  think: 'thinking',
  speak: 'speaking',
  happy: 'idle',
  sad: 'idle',
  angry: 'idle',
};

export interface MotionResolveInput {
  stage: PipelineStage;
  avatarAnimation: Animation;
}

export function resolveMotionState(input: MotionResolveInput): MotionState {
  if (input.stage !== 'idle') {
    return STAGE_TO_MOTION[input.stage];
  }
  return ANIMATION_TO_MOTION[input.avatarAnimation] ?? 'idle';
}

export class MotionStateMachine {
  private current: MotionState = 'idle';

  getCurrent(): MotionState {
    return this.current;
  }

  resolveMotion(input: MotionResolveInput): MotionState {
    const next = resolveMotionState(input);
    this.current = next;
    return next;
  }

  onStageChange(stage: PipelineStage, avatarAnimation: Animation): MotionState {
    return this.resolveMotion({ stage, avatarAnimation });
  }
}
