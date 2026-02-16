import * as THREE from 'three';
import type { PipelineStage } from '@/lib/store/pipelineStore';

export type MotionTouchZone = 'head' | 'face' | 'eyes' | 'leftHand' | 'rightHand' | 'body' | 'shoulders';

interface BoneRig {
  head: THREE.Bone | null;
  neck: THREE.Bone | null;
  leftShoulder: THREE.Bone | null;
  rightShoulder: THREE.Bone | null;
  leftHand: THREE.Bone | null;
  rightHand: THREE.Bone | null;
}

function matchBoneByCandidates(bones: THREE.Bone[], candidates: string[]): THREE.Bone | null {
  const lowered = candidates.map((item) => item.toLowerCase());
  for (const bone of bones) {
    const name = bone.name.toLowerCase();
    if (lowered.some((candidate) => name.includes(candidate))) {
      return bone;
    }
  }
  return null;
}

function resolveRig(mesh: THREE.SkinnedMesh): BoneRig {
  const bones = mesh.skeleton?.bones ?? [];
  return {
    head: matchBoneByCandidates(bones, ['頭', 'head']),
    neck: matchBoneByCandidates(bones, ['首', 'neck']),
    leftShoulder: matchBoneByCandidates(bones, ['左肩', 'leftshoulder', 'l_shoulder']),
    rightShoulder: matchBoneByCandidates(bones, ['右肩', 'rightshoulder', 'r_shoulder']),
    leftHand: matchBoneByCandidates(bones, ['左手首', 'lefthand', 'leftwrist', 'l_wrist', '左ひじ']),
    rightHand: matchBoneByCandidates(bones, ['右手首', 'righthand', 'rightwrist', 'r_wrist', '右ひじ']),
  };
}

export class MotionDriver {
  private readonly rig: BoneRig;
  private readonly baseMeshPosition: THREE.Vector3;
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpOffset = new THREE.Vector3();

  private stage: PipelineStage = 'idle';
  private stageBlend = 1;
  private activeDragZone: MotionTouchZone | null = null;

  private readonly headLookTarget = new THREE.Vector2();
  private readonly headLookCurrent = new THREE.Vector2();
  private hoverWeightTarget = 0;
  private hoverWeightCurrent = 0;

  private readonly bodyShiftTarget = new THREE.Vector2();
  private readonly bodyShiftCurrent = new THREE.Vector2();

  private handSwingTarget = 0;
  private handSwingCurrent = 0;
  private handLiftTarget = 0;
  private handLiftCurrent = 0;

  private headPitchImpulse = 0;
  private headRollImpulse = 0;
  private shoulderImpulse = 0;
  private handImpulse = 0;

  constructor(private readonly mesh: THREE.SkinnedMesh) {
    this.rig = resolveRig(mesh);
    this.baseMeshPosition = mesh.position.clone();
  }

  setPipelineStage(stage: PipelineStage): void {
    this.stage = stage;
  }

  triggerTap(zoneId: MotionTouchZone, intensity = 0.7): void {
    const value = THREE.MathUtils.clamp(intensity, 0, 1);
    if (zoneId === 'head' || zoneId === 'face' || zoneId === 'eyes') {
      this.headPitchImpulse += 0.16 * value;
      this.headRollImpulse += (Math.random() > 0.5 ? 1 : -1) * 0.1 * value;
      return;
    }
    if (zoneId === 'shoulders') {
      this.shoulderImpulse += 0.14 * value;
      return;
    }
    if (zoneId === 'leftHand' || zoneId === 'rightHand') {
      this.handImpulse += 0.2 * value;
      return;
    }
    this.bodyShiftTarget.y = THREE.MathUtils.clamp(this.bodyShiftTarget.y - 0.2 * value, -1, 1);
  }

  startDrag(zoneId: MotionTouchZone | null): void {
    if (zoneId === 'head' || zoneId === 'body' || zoneId === 'shoulders') {
      this.activeDragZone = zoneId;
      return;
    }
    this.activeDragZone = null;
  }

  updateDrag(delta: { x: number; y: number }): void {
    const zoneId = this.activeDragZone;
    if (!zoneId) {
      return;
    }

    if (zoneId === 'head' || zoneId === 'face' || zoneId === 'eyes') {
      this.headLookTarget.x = THREE.MathUtils.clamp(this.headLookTarget.x + delta.x * 1.8, -1, 1);
      this.headLookTarget.y = THREE.MathUtils.clamp(this.headLookTarget.y + delta.y * 1.8, -1, 1);
      return;
    }

    if (zoneId === 'body' || zoneId === 'shoulders') {
      this.bodyShiftTarget.x = THREE.MathUtils.clamp(this.bodyShiftTarget.x + delta.x * 2.2, -1, 1);
      this.bodyShiftTarget.y = THREE.MathUtils.clamp(this.bodyShiftTarget.y + delta.y * 2.2, -1, 1);
      return;
    }

    // 手部拖拽已禁用，保留点击反馈（triggerTap）能力。
  }

  endDrag(): void {
    this.activeDragZone = null;
    this.bodyShiftTarget.multiplyScalar(0.5);
    this.handSwingTarget *= 0.5;
    this.handLiftTarget *= 0.5;
  }

  setHover(zoneId: MotionTouchZone | null, normalizedPointer: { x: number; y: number }): void {
    if (zoneId === 'head' || zoneId === 'face' || zoneId === 'eyes') {
      this.hoverWeightTarget = 1;
      this.headLookTarget.set(
        THREE.MathUtils.clamp((normalizedPointer.x - 0.5) * 2, -1, 1),
        // 屏幕坐标 y 轴向下为正，这里翻转为“向上为正”以匹配直觉。
        THREE.MathUtils.clamp((0.5 - normalizedPointer.y) * 2, -1, 1)
      );
      return;
    }
    this.hoverWeightTarget = 0;
  }

  clearHover(): void {
    this.hoverWeightTarget = 0;
  }

  update(delta: number): void {
    const stageTarget = this.resolveStageBlendTarget(this.stage);
    this.stageBlend = THREE.MathUtils.damp(this.stageBlend, stageTarget, 6, delta);

    this.hoverWeightCurrent = THREE.MathUtils.damp(this.hoverWeightCurrent, this.hoverWeightTarget, 8, delta);
    this.headLookCurrent.x = THREE.MathUtils.damp(this.headLookCurrent.x, this.headLookTarget.x, 8, delta);
    this.headLookCurrent.y = THREE.MathUtils.damp(this.headLookCurrent.y, this.headLookTarget.y, 8, delta);
    this.bodyShiftCurrent.x = THREE.MathUtils.damp(this.bodyShiftCurrent.x, this.bodyShiftTarget.x, 7, delta);
    this.bodyShiftCurrent.y = THREE.MathUtils.damp(this.bodyShiftCurrent.y, this.bodyShiftTarget.y, 7, delta);
    this.handSwingCurrent = THREE.MathUtils.damp(this.handSwingCurrent, this.handSwingTarget, 9, delta);
    this.handLiftCurrent = THREE.MathUtils.damp(this.handLiftCurrent, this.handLiftTarget, 9, delta);

    this.headPitchImpulse = THREE.MathUtils.damp(this.headPitchImpulse, 0, 10, delta);
    this.headRollImpulse = THREE.MathUtils.damp(this.headRollImpulse, 0, 10, delta);
    this.shoulderImpulse = THREE.MathUtils.damp(this.shoulderImpulse, 0, 10, delta);
    this.handImpulse = THREE.MathUtils.damp(this.handImpulse, 0, 10, delta);

    const lookScale = this.hoverWeightCurrent * this.stageBlend;
    const yaw = THREE.MathUtils.clamp(this.headLookCurrent.x * 0.42 * lookScale, -0.45, 0.45);
    const pitch = THREE.MathUtils.clamp(-this.headLookCurrent.y * 0.28 * lookScale + this.headPitchImpulse, -0.35, 0.3);
    const roll = THREE.MathUtils.clamp(this.headRollImpulse, -0.24, 0.24);

    this.applyBoneRotation(this.rig.head, pitch, yaw, roll);
    this.applyBoneRotation(this.rig.neck, pitch * 0.35, yaw * 0.45, roll * 0.25);

    const shoulderLift = this.shoulderImpulse * this.stageBlend;
    this.applyBoneRotation(this.rig.leftShoulder, -shoulderLift * 0.7, 0, shoulderLift * 0.5);
    this.applyBoneRotation(this.rig.rightShoulder, -shoulderLift * 0.7, 0, -shoulderLift * 0.5);

    const handSwing = this.handSwingCurrent * 0.65 * this.stageBlend + this.handImpulse * 0.45;
    const handLift = this.handLiftCurrent * 0.42 * this.stageBlend;
    this.applyBoneRotation(this.rig.leftHand, -handLift, handSwing, 0);
    this.applyBoneRotation(this.rig.rightHand, -handLift, -handSwing, 0);

    this.tmpOffset.set(
      this.bodyShiftCurrent.x * 0.3 * this.stageBlend,
      0,
      -this.bodyShiftCurrent.y * 0.3 * this.stageBlend
    );
    this.mesh.position.copy(this.baseMeshPosition).add(this.tmpOffset);
  }

  dispose(): void {
    this.mesh.position.copy(this.baseMeshPosition);
  }

  private applyBoneRotation(
    bone: THREE.Bone | null,
    x: number,
    y: number,
    z: number
  ): void {
    if (!bone) {
      return;
    }
    this.tmpEuler.set(x, y, z);
    this.tmpQuat.setFromEuler(this.tmpEuler);
    bone.quaternion.multiply(this.tmpQuat);
  }

  private resolveStageBlendTarget(stage: PipelineStage): number {
    if (stage === 'idle') {
      return 1;
    }
    if (stage === 'speaking') {
      return 0.35;
    }
    if (stage === 'recording') {
      return 0.45;
    }
    if (stage === 'processing' || stage === 'uploading') {
      return 0.25;
    }
    return 0.2;
  }
}
