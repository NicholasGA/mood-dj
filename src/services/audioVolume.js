// 音量唯一真源 = 用户设定的 userVol(0..1)。DJ 说话时只是临时乘一个压低系数，
// 不再"快照-恢复"——所以说话期间改音量也会立刻生效、且不会被旧快照覆盖。
// （旧实现快照 audio.volume 再恢复，导致说话间隙改的音量被拉回快照值/默认值。）
export const DUCK_FACTOR = 0.28
export const clampVol = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
export function effectiveVolume(userVol, ducking, duck = DUCK_FACTOR) {
  return clampVol(clampVol(userVol) * (ducking ? duck : 1))
}
